import { CompressionResult, ConversionSettings, VideoMetadata } from '../../types';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps } from '../media/bitrateCalc';
import { getCompatibleVideoCodecs } from '../../config/codecs';
import { FFmpegEngine, FFmpegEngineEvents } from '../ffmpeg/ffmpegEngine';
import { cancelledError, MediaProcessingError } from '../media/mediaError';
import { resolveEncoderConfig } from './encoderConfig';
import type { VideoPipelineRequest, VideoPipelineResponse, PipelineStats } from './workerTypes';
import { calculateRemainingSeconds } from '../../utils/formatters';

export type WebCodecsEngineEvents = FFmpegEngineEvents;

export class WebCodecsEngine {
  private controller: AbortController | null = null;
  private activeWorker: Worker | null = null;
  private audioEngine = new FFmpegEngine();

  async isSupported(settings: ConversionSettings, source?: VideoMetadata): Promise<boolean> {
    if (typeof VideoFrame === 'undefined' || !getCompatibleVideoCodecs(settings.format).includes(settings.videoCodec)) {
      return false;
    }
    const { width, height } = getTargetDimensions(settings, source);
    return !!(await resolveEncoderConfig(
      settings.videoCodec,
      width,
      height,
      getTargetFps(settings, source),
      calculateBitratesAndEstimates(settings, source).videoBitrateBps,
      settings.processingMode === 'hardware'
    ));
  }

  async process(
    file: File,
    settings: ConversionSettings,
    metadata: VideoMetadata,
    events: WebCodecsEngineEvents
  ): Promise<CompressionResult> {
    const start = performance.now();
    const controller = new AbortController();
    this.controller = controller;

    try {
      const { width, height } = getTargetDimensions(settings, metadata);
      const fps = getTargetFps(settings, metadata);
      if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(metadata.duration) || metadata.duration <= 0) {
        throw new Error('Invalid video duration or output frame rate.');
      }

      events.onStage('initializing', 'Checking browser video encoder...');
      const config = await resolveEncoderConfig(
        settings.videoCodec,
        width,
        height,
        fps,
        calculateBitratesAndEstimates(settings, metadata).videoBitrateBps,
        settings.processingMode === 'hardware'
      );

      if (controller.signal.aborted) throw cancelledError();
      if (!config) {
        throw new MediaProcessingError(
          'The browser cannot encode this video configuration. Choose a supported codec or select CPU manually.'
        );
      }

      const hardwarePreferred = config.hardwareAcceleration === 'prefer-hardware';
      events.onStage('encoding', 'Decoding and encoding sequentially with browser WebCodecs...');

      const buffer = await this.encodeInWorker(
        { file, config, codec: settings.videoCodec, fps, duration: metadata.duration },
        controller.signal,
        (frames, total) => {
          const elapsedMs = performance.now() - start;
          const percent = Math.min(99, Math.floor((frames / total) * 100));
          const processedSeconds = Math.min(metadata.duration, frames / fps);
          const estRemaining = calculateRemainingSeconds({
            stage: 'encoding',
            percent,
            elapsedMs,
            processedSeconds,
            totalSeconds: metadata.duration,
          }, metadata.duration);
          events.onProgress({
            stage: 'encoding',
            percent,
            elapsedMs,
            estimatedRemainingMs: estRemaining !== undefined ? Math.round(estRemaining * 1000) : undefined,
            fps: frames / Math.max(0.001, elapsedMs / 1000),
            processedSeconds,
            totalSeconds: metadata.duration,
            activeEngine: 'webcodecs',
            hardwareAccelerated: false,
            hardwarePreferred,
          });
        }
      );

      if (controller.signal.aborted) throw cancelledError();

      const videoBlob = new Blob([buffer], { type: 'video/mp4' });
      events.onStage('muxing', 'Preparing audio and saving the final container...');

      const outputBlob = await this.audioEngine.finalizeVideo(
        videoBlob,
        file,
        settings,
        metadata,
        {
          onStage: events.onStage,
          onProgress: (progress) =>
            events.onProgress({
              ...progress,
              activeEngine: 'webcodecs',
              hardwareAccelerated: false,
              hardwarePreferred,
            }),
        },
        controller.signal
      );

      if (controller.signal.aborted) throw cancelledError();

      return {
        outputBlob,
        outputUrl: URL.createObjectURL(outputBlob),
        outputFileName: `${file.name.replace(/\.[^.]+$/, '')}_compressed.${settings.format}`,
        originalSizeBytes: file.size,
        compressedSizeBytes: outputBlob.size,
        durationSeconds: metadata.duration,
        compressionRatioPercent: Math.round(Math.max(0, 1 - outputBlob.size / file.size) * 100),
        elapsedTimeMs: performance.now() - start,
        format: settings.format,
        engineUsed: 'webcodecs',
        hardwareAccelerated: false,
        hardwarePreferred,
      };
    } catch (error) {
      if (controller.signal.aborted) throw cancelledError();
      if (error instanceof MediaProcessingError) throw error;
      throw new MediaProcessingError(
        'Browser encoding failed. No incomplete file was saved. CPU encoding was not started. Try different settings or select CPU manually.',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private encodeInWorker(
    request: VideoPipelineRequest,
    signal: AbortSignal,
    onProgress: (frames: number, total: number) => void
  ): Promise<ArrayBuffer> {
    return encodeVideoInWorker(request, signal, onProgress, undefined, (worker) => {
      this.activeWorker = worker;
    });
  }

  cancel(): void {
    this.controller?.abort();
    this.activeWorker?.terminate();
    this.activeWorker = null;
    this.audioEngine.cancel();
  }
}

export function encodeVideoInWorker(
  request: VideoPipelineRequest,
  signal: AbortSignal,
  onProgress?: (frames: number, total: number) => void,
  onStats?: (stats: PipelineStats) => void,
  onWorkerCreated?: (worker: Worker) => void
): Promise<ArrayBuffer> {
  if (typeof Worker === 'undefined') {
    return Promise.reject(new Error('Web Workers are unavailable in this environment.'));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/webcodecs.worker.ts', import.meta.url), { type: 'module' });
    onWorkerCreated?.(worker);

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };

    const abort = () => {
      cleanup();
      reject(cancelledError());
    };

    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'Browser video worker failed.'));
    };
    worker.onmessageerror = () => {
      cleanup();
      reject(new Error('Cannot read video worker response.'));
    };
    worker.onmessage = ({ data }: MessageEvent<VideoPipelineResponse>) => {
      if (data.type === 'progress') {
        onProgress?.(data.frames, data.total);
        return;
      }
      cleanup();
      if (data.type === 'unsupported') {
        reject(new Error(data.reason));
      } else if (data.type === 'error') {
        reject(new Error(data.message));
      } else if (data.type === 'complete') {
        if (data.stats && onStats) onStats(data.stats);
        resolve(data.buffer);
      }
    };

    if (signal.aborted) {
      abort();
    } else {
      worker.postMessage(request);
    }
  });
}

