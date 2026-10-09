import { FFmpegJob } from '../../src/services/ffmpeg/ffmpegJob';
import { FFmpegEngine } from '../../src/services/ffmpeg/ffmpegEngine';
import { createDefaultSettings } from '../../src/config/presets';
import { probeVideoFile } from '../../src/services/media/mediaProbe';
import { waitForVideo } from '../../src/services/webcodecs/mediaWait';
import { ConversionSettings } from '../../src/types';
import { MediaProcessingError } from '../../src/services/media/mediaError';
import { getEncodingThreads } from '../../src/services/ffmpeg/threading';

const log = (message: string) => { document.querySelector('#log')!.textContent += message + '\n'; };
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const events = { onProgress: () => {}, onStage: (_: string, message: string) => log(message) };

document.querySelector('#run')!.addEventListener('click', async () => {
  (document.querySelector('#run') as HTMLButtonElement).disabled = true;
  const urls: string[] = [];
  try {
    const fallback = new URLSearchParams(location.search).has('fallback');
    log(`isolated=${crossOriginIsolated}; hardwareConcurrency=${navigator.hardwareConcurrency}`);
    const fixture = await new FFmpegJob().run({
      type: 'run', inputs: [], outputName: 'source.mp4', duration: 1.2, preferMultiThread: false, stage: 'encoding',
      args: ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=60:duration=1.2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=1.2',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-y', 'source.mp4'],
    }, events);
    const file = new File([fixture.buffer], 'source.mp4', { type: 'video/mp4' });
    const source = await probeVideoFile(file);
    urls.push(source.objectUrl);
    const settings: ConversionSettings = { ...createDefaultSettings(source), videoCodec: 'h265' as const,
      processingMode: 'cpu' as const, resolution: '480p' as const, fps: 30 as const };

    if (fallback) {
      try {
        await new FFmpegEngine().process(file, { ...settings, cpuThreads: 4 }, source, events);
        throw new Error('HEVC was allowed to start on the unsupported single-thread core');
      } catch (error) {
        assert(error instanceof MediaProcessingError && error.message.includes('H.265'), `Incorrect HEVC error: ${String(error)}`);
        log('PASS unavailable core-mt: actionable HEVC error, no stalled encode');
      }
      settings.videoCodec = 'h264';
    }

    for (const cpuThreads of fallback ? [4] : [1, 2, 4, 8, 16, 0, 32]) {
      let progressEvents = 0;
      let encoderThreads: number | undefined;
      const result = await new FFmpegEngine().process(file, { ...settings, cpuThreads,
        qualityValue: cpuThreads === 8 ? 80 : 60 }, source, {
        ...events, onProgress: (progress) => {
          if ((progress.processedSeconds ?? 0) > 0) progressEvents++;
          encoderThreads = progress.encoderThreads ?? encoderThreads;
        },
      });
      urls.push(result.outputUrl);
      const expectedEngine = !crossOriginIsolated || fallback ? 'ffmpeg-st' : 'ffmpeg-mt';
      assert(result.engineUsed === expectedEngine, `threads=${cpuThreads}: wrong engine ${result.engineUsed}`);
      assert(progressEvents > 0, `threads=${cpuThreads}: missing real progress`);
      if (!fallback) assert(encoderThreads === getEncodingThreads({ ...settings, cpuThreads }, true),
        `Selected ${cpuThreads} threads, but x265 reported ${encoderThreads}`);
      const output = await probeVideoFile(new File([result.outputBlob], result.outputFileName));
      urls.push(output.objectUrl);
      assert(output.videoCodec === (fallback ? 'H.264' : 'H.265 / HEVC'), `Unexpected codec: ${output.videoCodec}`);
      assert(output.width === 854 && output.height === 480 && output.fps === 30, 'Incorrect resolution/FPS');
      assert(output.audioChannels === 2, 'Audio channels were lost');

      // Decode every video frame, including delayed frames flushed on encoder close.
      const decoded = await new FFmpegJob().run({
        type: 'run', inputs: [{ name: 'source', data: result.outputBlob }], outputName: 'frames.md5',
        duration: 1.2, preferMultiThread: false, stage: 'muxing',
        args: ['-xerror', '-i', '/input/source', '-map', '0:v:0', '-an', '-f', 'framemd5', '-y', 'frames.md5'],
      }, events);
      const frames = new TextDecoder().decode(decoded.buffer).split('\n').filter(line => /^0,/.test(line));
      // CFR resampling can duplicate up to two frames at the source boundary.
      assert(frames.length >= 36 && frames.length <= 38, `Expected 36–38 decoded frames, got ${frames.length}`);
      const pcm = await new FFmpegJob().run({
        type: 'run', inputs: [{ name: 'source', data: result.outputBlob }], outputName: 'audio.pcm',
        duration: 1.2, preferMultiThread: false, stage: 'muxing',
        args: ['-xerror', '-i', '/input/source', '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-y', 'audio.pcm'],
      }, events);
      const samples = new Float32Array(pcm.buffer);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      assert(samples.length >= 9000 && samples.length <= 11000 && rms > 0.03, 'Corrupted or truncated audio');

      const link = document.createElement('a');
      link.href = result.outputUrl; link.download = result.outputFileName;
      link.textContent = `Download ${fallback ? 'H.264 fallback' : 'H.265'} (${cpuThreads || 'Auto'} threads)`;
      const player = document.createElement('video');
      player.controls = true; player.muted = true; player.src = result.outputUrl;
      document.querySelector('#outputs')!.append(link, player);
      await waitForVideo(player, 'loadeddata', () => player.readyState >= 2, new AbortController().signal);
      player.currentTime = 0.6;
      await waitForVideo(player, 'seeked', () => !player.seeking && player.readyState >= 2, new AbortController().signal);
      // Keep the player and download link available for manual verification.
      log(`PASS threads=${cpuThreads || 'Auto'}: ${result.engineUsed}, x265 reports ${encoderThreads ?? 'N/A'} workers, ${frames.length} ${output.videoCodec} frames, 854x480/30 FPS, audible stereo, seek/playback, ${result.outputBlob.size} bytes`);
    }

    if (!fallback) {
      const engine = new FFmpegEngine();
      try {
        await engine.process(file, { ...settings, cpuThreads: 4 }, source, {
          ...events, onProgress: (progress) => { if ((progress.processedSeconds ?? 0) > 0) void engine.cancel(); },
        });
        throw new Error('Cancelled encoding returned a file');
      } catch (error) {
        assert(error instanceof DOMException && error.name === 'AbortError', `Incorrect cancellation: ${String(error)}`);
      }
      const next = await engine.process(file, { ...settings, cpuThreads: 4 }, source, events);
      urls.push(next.outputUrl);
      assert(next.outputBlob.size > 0, 'Encoding after cancellation failed');
      log('PASS cancellation on real progress and successful next encoding');
    }
    log('ALL H.265 CPU CHECKS PASSED');
  } catch (error) { log(`FAILED: ${error instanceof Error ? error.stack : String(error)}`); }
  finally {
    // Download/player URLs remain valid until the verification page is closed.
    window.addEventListener('pagehide', () => urls.forEach(url => URL.revokeObjectURL(url)), { once: true });
    (document.querySelector('#run') as HTMLButtonElement).disabled = false;
  }
});
