import { FFmpegJob } from '../../src/services/ffmpeg/ffmpegJob';
import { FFmpegEngine } from '../../src/services/ffmpeg/ffmpegEngine';
import { WebCodecsEngine, encodeVideoInWorker } from '../../src/services/webcodecs/webcodecsEngine';
import { createDefaultSettings } from '../../src/config/presets';
import { probeVideoFile } from '../../src/services/media/mediaProbe';
import { resolveEncoderConfig } from '../../src/services/webcodecs/encoderConfig';
import { waitForVideo } from '../../src/services/webcodecs/mediaWait';
import type { PipelineStats } from '../../src/services/webcodecs/workerTypes';

const log = (message: string) => { document.querySelector('#log')!.textContent += message + '\n'; };
const events = { onProgress: () => {}, onStage: (_: string, message: string) => log(message) };
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
Object.assign(window, { mediaChecksReady: true });

async function inspect(blob: Blob, name: string, channels: number, audio = true,
  dimensions = { width: 320, height: 180 }, expectedFrames?: number) {
  const file = new File([blob], name);
  const earlyLink = document.createElement('a'); earlyLink.href = URL.createObjectURL(blob); earlyLink.download = name; earlyLink.textContent = `Download ${name}`;
  document.querySelector('#outputs')!.append(earlyLink, document.createElement('br'));
  const decoded = await new FFmpegJob().run({ type: 'run', inputs: [{ name: 'source', data: file }], outputName: 'video.rgb',
    args: ['-xerror', '-i', '/input/source', '-map', '0:v:0', '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', 'video.rgb'],
    duration: 1.2, preferMultiThread: false, stage: 'muxing' }, events);
  log(`${name}: decoded ${decoded.buffer.byteLength} RGB bytes with FFmpeg`);
  const metadata = await probeVideoFile(file);
  assert(metadata.width === dimensions.width && metadata.height === dimensions.height, `${name}: unexpected dimensions`);
  if (expectedFrames !== undefined) assert(decoded.buffer.byteLength === expectedFrames * dimensions.width * dimensions.height * 3,
    `${name}: expected ${expectedFrames} frames, got ${decoded.buffer.byteLength / (dimensions.width * dimensions.height * 3)}`);
  if (audio) assert(metadata.audioChannels === channels, `${name}: expected ${channels} channels, got ${metadata.audioChannels}`);
  else assert(!metadata.audioChannels, `${name}: audio was not removed`);
  const player = document.createElement('video'); player.controls = true; player.muted = true; player.src = metadata.objectUrl;
  document.querySelector('#outputs')!.append(player);
  await waitForVideo(player, 'loadeddata', () => player.readyState >= 2, new AbortController().signal);
  for (const time of [0.2, 0.6, 1.0]) { player.currentTime = time; await waitForVideo(player, 'seeked', () => !player.seeking && player.readyState >= 2, new AbortController().signal); }
  player.pause(); player.removeAttribute('src'); player.load();
  if (audio) {
    const pcm = await new FFmpegJob().run({ type: 'run', inputs: [{ name: 'source', data: file }], outputName: 'audio.pcm',
      args: ['-xerror', '-i', '/input/source', '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-y', 'audio.pcm'],
      duration: 1.2, preferMultiThread: false, stage: 'muxing' }, events);
    const samples = new Float32Array(pcm.buffer);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    assert(samples.length >= 9000 && samples.length <= 11_000, `${name}: truncated or stretched audio (${samples.length} samples)`);
    assert(rms > 0.03 && Number.isFinite(rms), `${name}: silent or corrupt audio`);
    log(`PASS ${name}: ${metadata.videoCodec}, ${channels}ch, ${samples.length} samples, RMS ${rms.toFixed(4)}, seek/playback ready`);
  } else log(`PASS ${name}: no audio, seek/playback ready`);
}

document.querySelector('#run')!.addEventListener('click', async () => {
  (document.querySelector('#run') as HTMLButtonElement).disabled = true;
  try {
    log(`Browser: ${navigator.userAgent}; isolated=${crossOriginIsolated}`);
    const fixture = await new FFmpegJob().run({ type: 'run', inputs: [], outputName: 'fixture.mp4',
      args: ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=1.2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=1.2',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-b:a', '128k', '-y', 'fixture.mp4'],
      duration: 1.2, preferMultiThread: false, stage: 'encoding' }, events);
    const file = new File([fixture.buffer], 'fixture.mp4', { type: 'video/mp4' });
    const metadata = await probeVideoFile(file);
    const settings = { ...createDefaultSettings(metadata), videoCodec: 'h265' as const, processingMode: 'cpu' as const, cpuThreads: 2, fps: 'custom' as const, customFps: 10 };
    let hevc: Blob | null = null;
    let avc: Blob | null = null;
    let vp9Video: Blob | null = null;
    for (const codec of ['h264', 'h265', 'vp9'] as const) {
      const config = await resolveEncoderConfig(codec, 320, 180, 10, 1_000_000, false);
      if (!config) { log(`UNAVAILABLE browser ${codec}: browser does not expose encoder`); continue; }
      log(`Browser ${codec} preference: ${config.hardwareAcceleration}`);
      const result = await new WebCodecsEngine().process(file, { ...settings, videoCodec: codec, processingMode: 'auto' }, metadata, events);
      if (codec === 'h265') hevc = result.outputBlob;
      if (codec === 'h264') avc = result.outputBlob;
      if (codec === 'vp9') vp9Video = result.outputBlob;
      await inspect(result.outputBlob, `browser-${codec}.mp4`, 2);
    }
    const testedCodec = hevc ? 'h265' : 'h264';
    const testedVideo = hevc ?? avc;
    if (!testedVideo) throw new Error('No H.264 or HEVC browser encoder');
    if (!hevc) log('UNAVAILABLE HEVC in this browser environment: further queue/timing checks use H.264');
    const gopFixture = await new FFmpegJob().run({ type: 'run', inputs: [], outputName: 'long-gop.mp4',
      args: ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=60:duration=1.2', '-c:v', 'libx264', '-preset', 'fast',
        '-g', '120', '-bf', '3', '-pix_fmt', 'yuv420p', '-an', '-y', 'long-gop.mp4'],
      duration: 1.2, preferMultiThread: false, stage: 'encoding' }, events);
    const gopFile = new File([gopFixture.buffer], 'long-gop.bin');
    for (const variant of [
      { fps: 60, width: 320, height: 180, frames: 72 },
      { fps: 30, width: 320, height: 180, frames: 36 },
      { fps: 60, width: 160, height: 90, frames: 72 },
    ]) {
      const config = await resolveEncoderConfig(testedCodec, variant.width, variant.height, variant.fps, 1_000_000, false);
      assert(!!config, 'Missing encoder configuration');
      let stats: PipelineStats | undefined;
      const buffer = await encodeVideoInWorker({ file: gopFile, config: config!, codec: testedCodec, fps: variant.fps, duration: 1.2 },
        new AbortController().signal, () => {}, (value) => { stats = value; });
      assert(stats !== undefined, 'No stats reported');
      assert(stats.seeks === 0 && stats.flushes === 2, 'Worker did not use continuous decode');
      assert(stats.decodedFrames === 72 && stats.encodedFrames === variant.frames, 'Frames lost or decoded repeatedly');
      assert(stats.framesCreated === stats.framesClosed, 'Worker leaked VideoFrames');
      assert(stats.canvasFrames === (variant.width === 320 ? 0 : variant.frames), 'Unexpected canvas processing');
      await inspect(new Blob([buffer], { type: 'video/mp4' }), `${testedCodec}-gop-${variant.width}-${variant.fps}.mp4`, 0, false, variant, variant.frames);
      log(`PASS long GOP / B-frames ${variant.fps} FPS: ${JSON.stringify(stats)}`);
    }
    for (const variant of [
      { name: 'rotated.mov', data: gopFile as Blob, args: ['-c:v', 'copy', '-metadata:s:v:0', 'rotate=90'], width: 180, height: 320, canvas: true, fps: 60, frames: 72 },
      ...(vp9Video ? [{ name: 'source.webm', data: vp9Video, args: ['-c:v', 'copy'], width: 320, height: 180, canvas: false, fps: 10, frames: 12 }] : []),
    ]) {
      const source = await new FFmpegJob().run({ type: 'run', inputs: [{ name: 'source', data: variant.data }], outputName: variant.name,
        args: ['-i', '/input/source', ...variant.args, '-an', '-y', variant.name], duration: 1.2,
        preferMultiThread: false, stage: 'encoding' }, events);
      const config = await resolveEncoderConfig(testedCodec, variant.width, variant.height, variant.fps, 1_000_000, false);
      assert(!!config, 'Missing encoder configuration');
      let stats: PipelineStats | undefined;
      const buffer = await encodeVideoInWorker({ file: new File([source.buffer], variant.name), config: config!, codec: testedCodec, fps: variant.fps, duration: 1.2 },
        new AbortController().signal, () => {}, (value) => { stats = value; });
      assert(stats !== undefined, 'No stats reported');
      assert(stats.canvasFrames === (variant.canvas ? variant.frames : 0), 'Source orientation was not applied');
      assert(stats.framesCreated === stats.framesClosed, 'Worker leaked frames');
      await inspect(new Blob([buffer], { type: 'video/mp4' }), `${variant.name}.mp4`, 0, false, variant, variant.frames);
      log(`PASS sequential demux ${variant.name}: source transform preserved`);
    }
    if (await resolveEncoderConfig('vp9', 320, 180, 10, 1_000_000, false)) {
      const webm = await new WebCodecsEngine().process(file, { ...settings, videoCodec: 'vp9', format: 'webm', audioAction: 'remove', processingMode: 'auto' }, metadata, events);
      await inspect(webm.outputBlob, 'browser-vp9.webm', 0, false);
    }
    const browserVideo = { outputBlob: testedVideo };
    for (const variant of [
      { audioAction: 'keep' as const, audioChannels: 'original' as const, name: 'hevc-keep.mp4', channels: 2 },
      { audioAction: 'compress' as const, audioChannels: 'mono' as const, name: 'hevc-mono.mp4', channels: 1 },
      { audioAction: 'compress' as const, audioChannels: 'surround51' as const, name: 'hevc-surround.mp4', channels: 6 },
      { audioAction: 'remove' as const, audioChannels: 'original' as const, name: 'hevc-mute.mp4', channels: 0 },
    ]) {
      const blob = await new FFmpegEngine().finalizeVideo(browserVideo.outputBlob, file, { ...settings, videoCodec: testedCodec, ...variant, audioBitrateKbps: 320 }, metadata, events, new AbortController().signal);
      await inspect(blob, variant.name.replace('hevc', testedCodec), variant.channels, variant.channels > 0);
    }
    const delayedFixture = await new FFmpegJob().run({ type: 'run', inputs: [], outputName: 'delayed.mp4',
      args: ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30000/1001:duration=1.2', '-itsoffset', '0.3',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=1.2', '-c:v', 'libx264', '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-y', 'delayed.mp4'],
      duration: 1.5, preferMultiThread: false, stage: 'encoding' }, events);
    const delayedFile = new File([delayedFixture.buffer], 'delayed.mp4', { type: 'video/mp4' });
    const delayedMetadata = await probeVideoFile(delayedFile);
    assert(delayedMetadata.fps === 29.97, 'Source fractional FPS was lost');
    const delayed = await new WebCodecsEngine().process(delayedFile, { ...settings, videoCodec: testedCodec, processingMode: 'hardware', fps: 'original' }, delayedMetadata, events);
    const delayedOutputMetadata = await probeVideoFile(new File([delayed.outputBlob], 'delayed-output.mp4'));
    assert(delayedOutputMetadata.fps === 29.97, 'Output fractional FPS was lost');
    const delayedPcm = await new FFmpegJob().run({ type: 'run', inputs: [{ name: 'source', data: delayed.outputBlob }], outputName: 'delayed.pcm',
      args: ['-xerror', '-i', '/input/source', '-map', '0:a:0', '-af', 'aresample=async=1:first_pts=0', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-y', 'delayed.pcm'],
      duration: 1.5, preferMultiThread: false, stage: 'muxing' }, events);
    const delayedSamples = new Float32Array(delayedPcm.buffer);
    const rms = (values: Float32Array) => Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length);
    assert(rms(delayedSamples.subarray(0, 1600)) < 0.001, 'Audio starts early: the source offset was lost');
    assert(rms(delayedSamples.subarray(3200, 8000)) > 0.03, 'Delayed audio is missing');
    log(`PASS ${testedCodec} 29.97 FPS with audio starting 0.3 seconds later: timing preserved`);
    const cancelledEngine = new WebCodecsEngine();
    let cancelledDuringProgress = false;
    try {
      await cancelledEngine.process(file, { ...settings, videoCodec: testedCodec, processingMode: 'hardware' }, metadata, {
        onProgress: (progress) => {
          if (progress.stage === 'encoding' && progress.percent > 0 && !cancelledDuringProgress) {
            cancelledDuringProgress = true; void cancelledEngine.cancel();
          }
        },
        onStage: events.onStage,
      });
      throw new Error('Cancelled encoding incorrectly returned success');
    } catch (error) {
      assert(error instanceof DOMException && error.name === 'AbortError', `Cancellation returned the wrong error: ${String(error)}`);
      assert(cancelledDuringProgress, 'Cancellation did not exercise a running pipeline');
      log('PASS cancellation during browser encoding: no output file');
    }
    const afterCancel = await cancelledEngine.process(file, { ...settings, videoCodec: testedCodec, processingMode: 'hardware' }, metadata, events);
    await inspect(afterCancel.outputBlob, 'after-cancel.mp4', 2);
    log('ALL AVAILABLE CHECKS PASSED');
  } catch (error) { log(`FAILED: ${error instanceof Error ? error.stack + ('technicalDetails' in error ? '\n' + String(error.technicalDetails) : '') : String(error)}`); }
});
