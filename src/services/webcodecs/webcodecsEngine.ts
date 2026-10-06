import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { CompressionResult, ConversionSettings, VideoMetadata } from '../../types';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps } from '../../utils/bitrateCalc';
import { getCompatibleVideoCodecs } from '../../config/codecs';
import { FFmpegEngine, FFmpegEngineEvents } from '../ffmpeg/ffmpegEngine';
import { cancelledError, MediaProcessingError } from '../mediaError';
import { resolveEncoderConfig } from './encoderConfig';
import { waitForVideo, waitWithAbort } from './mediaWait';

export type WebCodecsEngineEvents = FFmpegEngineEvents;

export class WebCodecsEngine {
  private controller: AbortController | null = null;
  private audioEngine = new FFmpegEngine();

  async isSupported(settings: ConversionSettings, source?: VideoMetadata): Promise<boolean> {
    if (typeof VideoFrame === 'undefined' || !getCompatibleVideoCodecs(settings.format).includes(settings.videoCodec)) return false;
    const { width, height } = getTargetDimensions(settings, source);
    return !!await resolveEncoderConfig(settings.videoCodec, width, height, getTargetFps(settings, source),
      calculateBitratesAndEstimates(settings, source).videoBitrateBps, settings.processingMode === 'hardware');
  }

  async process(file: File, settings: ConversionSettings, metadata: VideoMetadata,
    events: WebCodecsEngineEvents): Promise<CompressionResult> {
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const start = performance.now();
    let encoder: VideoEncoder | null = null;
    let video: HTMLVideoElement | null = null;
    let fileUrl: string | null = null;
    let pipelineError: Error | null = null;
    let writtenFrames = 0;
    const failIfStopped = () => {
      if (signal.aborted) throw cancelledError();
      if (pipelineError) throw pipelineError;
    };
    const closeEncoder = () => {
      if (encoder && encoder.state !== 'closed') encoder.close();
    };
    signal.addEventListener('abort', closeEncoder, { once: true });
    try {
      const { width, height } = getTargetDimensions(settings, metadata);
      const fps = getTargetFps(settings, metadata);
      if (!Number.isFinite(fps) || fps <= 0) throw new Error('Invalid output frame rate.');
      events.onStage('initializing', 'Checking browser video encoder...');
      const config = await resolveEncoderConfig(settings.videoCodec, width, height, fps,
        calculateBitratesAndEstimates(settings, metadata).videoBitrateBps, settings.processingMode === 'hardware');
      failIfStopped();
      if (!config) throw new MediaProcessingError('The browser cannot encode this video configuration. Choose a supported codec or select CPU manually.');
      const hardwarePreferred = config.hardwareAcceleration === 'prefer-hardware';
      events.onProgress({ stage: 'initializing', percent: 0, elapsedMs: performance.now() - start,
        activeEngine: 'webcodecs', hardwareAccelerated: false, hardwarePreferred });

      video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      fileUrl = URL.createObjectURL(file);
      video.src = fileUrl;
      await waitForVideo(video, 'loadeddata', () => video!.readyState >= 2, signal);
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('The source video has no readable duration.');

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('The browser cannot prepare video frames.');
      const target = new ArrayBufferTarget();
      const codec = { h264: 'avc', h265: 'hevc', vp9: 'vp9', av1: 'av1' } as const;
      const muxer = new Muxer({ target, video: { codec: codec[settings.videoCodec], width, height, frameRate: fps },
        fastStart: false, firstTimestampBehavior: 'strict' });
      let hasDescription = false;
      encoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (signal.aborted || pipelineError) return;
          try {
            if (meta?.decoderConfig?.description?.byteLength) hasDescription = true;
            if ((settings.videoCodec === 'h264' || settings.videoCodec === 'h265') && !hasDescription) {
              throw new Error('Browser encoder did not provide the MP4 decoder configuration.');
            }
            muxer.addVideoChunk(chunk, meta);
            writtenFrames++;
          } catch (error) {
            pipelineError = error instanceof Error ? error : new Error(String(error));
          }
        },
        error: (error) => { pipelineError = error; },
      });
      // Use exactly the configuration that passed capability detection, including bitstream format.
      encoder.configure(config);
      events.onStage('encoding', config.hardwareAcceleration === 'prefer-hardware'
        ? 'Encoding video with hardware preferred...' : 'Encoding video with browser WebCodecs...');
      const frames = Math.ceil(duration * fps);
      const keyInterval = Math.max(1, Math.round(fps * 2));
      for (let index = 0; index < frames; index++) {
        failIfStopped();
        const time = index / fps;
        if (Math.abs(video.currentTime - time) > 0.000001) {
          video.currentTime = time;
          // A seek timeout is an error, never permission to encode an old frame.
          await waitForVideo(video, 'seeked', () => !video!.seeking && video!.readyState >= 2, signal);
        }
        const queueDeadline = performance.now() + 30_000;
        while (encoder.encodeQueueSize > 5) {
          failIfStopped();
          if (performance.now() > queueDeadline) throw new Error('Video encoder queue stopped responding.');
          await waitWithAbort(new Promise<void>((resolve) => setTimeout(resolve, 10)), signal);
        }
        failIfStopped();
        context.drawImage(video, 0, 0, width, height);
        const timestamp = Math.round(time * 1_000_000);
        const frame = new VideoFrame(canvas, { timestamp,
          duration: Math.max(1, Math.round(Math.min(duration, (index + 1) / fps) * 1_000_000) - timestamp) });
        try { encoder.encode(frame, { keyFrame: index % keyInterval === 0 }); }
        finally { frame.close(); }
        const elapsedMs = performance.now() - start;
        events.onProgress({ stage: 'encoding', percent: Math.min(99, Math.floor(writtenFrames / frames * 100)),
          elapsedMs, fps: writtenFrames / Math.max(0.001, elapsedMs / 1000),
          processedSeconds: Math.min(duration, writtenFrames / fps), totalSeconds: duration,
          activeEngine: 'webcodecs', hardwareAccelerated: false, hardwarePreferred });
      }
      await waitWithAbort(encoder.flush(), signal, 60_000);
      failIfStopped();
      if (writtenFrames !== frames) throw new Error('The video encoder returned an incomplete stream.');
      closeEncoder();
      encoder = null;
      muxer.finalize();
      const videoBlob = new Blob([target.buffer], { type: 'video/mp4' });
      events.onStage('muxing', 'Preparing audio and saving the final container...');
      const outputBlob = await this.audioEngine.finalizeVideo(videoBlob, file, settings, metadata, {
        onStage: events.onStage,
        onProgress: (progress) => events.onProgress({ ...progress, activeEngine: 'webcodecs', hardwareAccelerated: false, hardwarePreferred }),
      }, signal);
      failIfStopped();
      return {
        outputBlob, outputUrl: URL.createObjectURL(outputBlob),
        outputFileName: `${file.name.replace(/\.[^.]+$/, '')}_compressed.${settings.format}`,
        originalSizeBytes: file.size, compressedSizeBytes: outputBlob.size, durationSeconds: duration,
        compressionRatioPercent: Math.round(Math.max(0, 1 - outputBlob.size / file.size) * 100),
        elapsedTimeMs: performance.now() - start, format: settings.format,
        engineUsed: 'webcodecs', hardwareAccelerated: false, hardwarePreferred,
      };
    } catch (error) {
      if (signal.aborted) throw cancelledError();
      if (error instanceof MediaProcessingError) throw error;
      throw new MediaProcessingError('Browser encoding failed. No incomplete file was saved. CPU encoding was not started. Try different settings or select CPU manually.',
        error instanceof Error ? error.message : String(error));
    } finally {
      signal.removeEventListener('abort', closeEncoder);
      closeEncoder();
      if (video) { video.removeAttribute('src'); video.load(); }
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (this.controller === controller) this.controller = null;
    }
  }

  async cancel(): Promise<void> { this.controller?.abort(); await this.audioEngine.cancel(); }
}
