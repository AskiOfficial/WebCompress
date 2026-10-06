import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { FFmpegJobRequest, FFmpegJobResponse } from '../services/ffmpeg/jobTypes';

const post = (message: FFmpegJobResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<FFmpegJobRequest>) => {
  const job = event.data;
  if (job.type !== 'run') return;
  let ffmpeg = new FFmpeg();
  const assetUrls: string[] = [];
  let mounted = false;
  let details: string[] = [];
  let response: FFmpegJobResponse | null = null;
  const start = performance.now();
  try {
    post({ type: 'stage', stage: 'initializing', message: 'Loading local media engine...' });
    const asset = async (path: string, mime: string) => {
      const url = await toBlobURL(`${self.location.origin}${path}`, mime);
      assetUrls.push(url);
      return url;
    };
    const load = async (multi: boolean) => {
      const base = multi ? '/ffmpeg/core-mt' : '/ffmpeg/core';
      await ffmpeg.load({
        coreURL: await asset(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await asset(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        ...(multi ? { workerURL: await asset(`${base}/ffmpeg-core.worker.js`, 'text/javascript') } : {}),
      });
    };
    let engine: 'ffmpeg-mt' | 'ffmpeg-st' = 'ffmpeg-st';
    if (job.preferMultiThread && typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated) {
      try {
        await load(true);
        engine = 'ffmpeg-mt';
      } catch {
        // Only engine initialization can select single-thread WASM. Encoding errors never retry.
        ffmpeg.terminate();
        ffmpeg = new FFmpeg();
        await load(false);
      }
    } else {
      await load(false);
    }
    post({ type: 'engine_ready', engine });
    ffmpeg.on('log', ({ message }) => {
      // Keep a bounded local diagnostic tail; no console logging or network transmission.
      details.push(message);
      if (details.length > 16) details.shift();
      const fps = message.match(/fps=\s*([\d.]+)/);
      const speed = message.match(/speed=\s*([\d.x]+)/);
      if (fps || speed) post({ type: 'stats', fps: fps ? Number(fps[1]) : undefined, speed: speed?.[1] });
    });
    ffmpeg.on('progress', ({ time }) => {
      const seconds = Math.max(0, time / 1_000_000);
      post({ type: 'progress', percent: job.duration > 0 ? Math.min(99, Math.round(seconds / job.duration * 100)) : 0,
        elapsedMs: performance.now() - start, processedSeconds: seconds });
    });
    await ffmpeg.createDir('/input');
    // WORKERFS reads Blob/File inputs without copying entire source files into the WASM heap.
    mounted = await ffmpeg.mount(FFFSType.WORKERFS, { blobs: job.inputs }, '/input');
    if (!mounted) throw new Error('Could not mount local media inputs.');
    post({ type: 'stage', stage: job.stage,
      message: job.stage === 'muxing' ? 'Preparing audio and combining local media tracks...' : 'Encoding video and audio locally...' });
    const exitCode = await ffmpeg.exec(job.args);
    if (exitCode !== 0) throw new Error(`Local media processing failed (exit ${exitCode}).\n${details.join('\n')}`);
    const output = await ffmpeg.readFile(job.outputName);
    if (typeof output === 'string' || output.byteLength === 0) throw new Error('Media engine produced an empty or invalid file.');
    const outputBuffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
    await ffmpeg.deleteFile(job.outputName);
    await ffmpeg.unmount('/input');
    mounted = false;
    response = { type: 'completed', outputBuffer, engineUsed: engine };
  } catch (error) {
    response = { type: 'error', message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (mounted) {
      try { await ffmpeg.unmount('/input'); } catch { /* Engine may already be terminated. */ }
    }
    ffmpeg.terminate();
    for (const url of assetUrls) URL.revokeObjectURL(url);
    details = [];
  }
  // Release nested FFmpeg workers and asset URLs before reporting completion to the UI worker owner.
  if (response?.type === 'completed') (self as unknown as Worker).postMessage(response, [response.outputBuffer]);
  else if (response) post(response);
};
