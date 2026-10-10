import { ActiveEngine, CompressionResult, ConversionSettings, ProcessingProgress, ProcessingStage, VideoMetadata } from '../../types';
import { CONTAINER_FORMATS } from '../../config/codecs';
import { cancelledError, MediaProcessingError } from '../media/mediaError';
import { buildFFmpegArgs, buildFinalizeArgs } from './ffmpegCommands';
import { FFmpegJobRequest, FFmpegJobResponse } from './jobTypes';
import { calculateRemainingSeconds } from '../../utils/formatters';

export interface FFmpegEngineEvents {
  onProgress: (progress: ProcessingProgress) => void;
  onStage: (stage: ProcessingStage, message: string) => void;
}

export class FFmpegEngine {
  private worker: Worker | null = null;
  private rejectPending: ((reason: unknown) => void) | null = null;

  run(request: FFmpegJobRequest, events: FFmpegEngineEvents, signal?: AbortSignal): Promise<{ buffer: ArrayBuffer; engine: ActiveEngine }> {
    if (signal?.aborted) return Promise.reject(cancelledError());
    return new Promise((resolve, reject) => {
      let engine: ActiveEngine = 'ffmpeg-st';
      let fps: number | undefined;
      let speed: string | undefined;
      let encoderThreads: number | undefined;
      let lastProgress: ProcessingProgress | null = null;
      const start = performance.now();
      const onAbort = () => this.cancel();
      const finish = () => {
        signal?.removeEventListener('abort', onAbort);
        this.worker?.terminate();
        this.worker = null;
        this.rejectPending = null;
      };
      this.rejectPending = (reason) => { finish(); reject(reason); };
      try {
        this.worker = new Worker(new URL('../../workers/ffmpeg.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<FFmpegJobResponse>) => {
          const data = event.data;
          switch (data.type) {
            case 'engine_ready': engine = data.engine; break;
            case 'stage': events.onStage(data.stage, data.message); break;
            case 'stats':
              fps = data.fps ?? fps; speed = data.speed ?? speed;
              if (data.encoderThreads !== undefined) {
                encoderThreads = data.encoderThreads;
                // Encoder initialization is observable before its first frame.
                // Keep any actual media progress; never infer it from thread count.
                lastProgress = {
                  ...(lastProgress ?? {
                    stage: request.stage,
                    percent: 0,
                    elapsedMs: performance.now() - start,
                    processedSeconds: 0,
                    totalSeconds: request.duration,
                    activeEngine: engine,
                    hardwareAccelerated: false,
                  }),
                  encoderThreads,
                  fps,
                  speed,
                };
                events.onProgress(lastProgress);
              }
              break;
            case 'progress': {
              const estRemaining = calculateRemainingSeconds({
                stage: request.stage,
                percent: data.percent,
                elapsedMs: data.elapsedMs,
                processedSeconds: data.processedSeconds,
                totalSeconds: request.duration,
              }, request.duration);
              lastProgress = {
                stage: request.stage,
                percent: data.percent,
                elapsedMs: data.elapsedMs,
                estimatedRemainingMs: estRemaining !== undefined ? Math.round(estRemaining * 1000) : undefined,
                processedSeconds: data.processedSeconds,
                totalSeconds: request.duration,
                activeEngine: engine,
                hardwareAccelerated: false,
                fps,
                speed,
                encoderThreads,
              };
              events.onProgress(lastProgress);
              break;
            }
            case 'completed':
              finish();
              resolve({ buffer: data.outputBuffer, engine: data.engineUsed });
              break;
            case 'error':
              finish();
              reject(data.userMessage ? new MediaProcessingError(data.userMessage, data.message) : new Error(data.message));
              break;
          }
        };
        this.worker.onerror = (event) => { finish(); reject(new Error(`Media worker failed: ${event.message}`)); };
        this.worker.onmessageerror = () => { finish(); reject(new Error('Media worker returned an unreadable response.')); };
        signal?.addEventListener('abort', onAbort, { once: true });
        this.worker.postMessage(request);
      } catch (error) {
        finish();
        reject(error);
      }
    });
  }

  async process(
    file: File,
    settings: ConversionSettings,
    metadata: VideoMetadata,
    events: FFmpegEngineEvents
  ): Promise<CompressionResult> {
    const start = performance.now();
    const requiresMultiThread = settings.videoCodec === 'h265';
    const multi = (requiresMultiThread || settings.cpuThreads !== 1)
      && globalThis.crossOriginIsolated === true
      && typeof SharedArrayBuffer !== 'undefined';

    if (requiresMultiThread && !multi) {
      throw new MediaProcessingError(
        'H.265 CPU encoding requires browser isolation and shared memory. Select H.264 or VP9, or use a supported browser encoder.'
      );
    }

    const outputName = `output.${settings.format}`;
    const command = { inputFilename: '/input/source', outputFilename: outputName, settings, source: metadata };
    const result = await this.run({
      type: 'run',
      inputs: [{ name: 'source', data: file }],
      outputName,
      args: buildFFmpegArgs({ ...command, isMultiThread: multi }),
      singleThreadArgs: multi ? buildFFmpegArgs({ ...command, isMultiThread: false }) : undefined,
      requiresMultiThread,
      duration: metadata.duration,
      preferMultiThread: multi,
      stage: 'encoding',
    }, events);

    const outputBlob = new Blob([result.buffer], { type: CONTAINER_FORMATS[settings.format].mime });
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
      engineUsed: result.engine,
      hardwareAccelerated: false,
    };
  }

  async finalizeVideo(
    video: Blob,
    file: File,
    settings: ConversionSettings,
    metadata: VideoMetadata,
    events: FFmpegEngineEvents,
    signal: AbortSignal
  ): Promise<Blob> {
    try {
      const result = await this.run({
        type: 'run',
        inputs: [{ name: 'video.mp4', data: video }, { name: 'source', data: file }],
        outputName: `output.${settings.format}`,
        args: buildFinalizeArgs(settings, metadata),
        duration: metadata.duration,
        preferMultiThread: false,
        stage: 'muxing',
      }, events, signal);
      return new Blob([result.buffer], { type: CONTAINER_FORMATS[settings.format].mime });
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      throw new MediaProcessingError(
        'Audio or final file creation failed. No incomplete file was saved. Video encoding was not switched to CPU.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  cancel(): void {
    this.rejectPending?.(cancelledError());
  }
}
