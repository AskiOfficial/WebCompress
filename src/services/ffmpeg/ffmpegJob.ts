import { ActiveEngine, ProcessingProgress, ProcessingStage } from '../../types';
import { cancelledError } from '../mediaError';
import { FFmpegJobRequest, FFmpegJobResponse } from './jobTypes';

export interface FFmpegJobEvents {
  onProgress: (progress: ProcessingProgress) => void;
  onStage: (stage: ProcessingStage, message: string) => void;
}

export class FFmpegJob {
  private worker: Worker | null = null;
  private rejectPending: ((reason: unknown) => void) | null = null;

  run(request: FFmpegJobRequest, events: FFmpegJobEvents, signal?: AbortSignal): Promise<{ buffer: ArrayBuffer; engine: ActiveEngine }> {
    if (signal?.aborted) return Promise.reject(cancelledError());
    return new Promise((resolve, reject) => {
      let engine: ActiveEngine = 'ffmpeg-st';
      let fps: number | undefined;
      let speed: string | undefined;
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
            case 'stats': fps = data.fps ?? fps; speed = data.speed ?? speed; break;
            case 'progress':
              events.onProgress({
                stage: request.stage, percent: data.percent, elapsedMs: data.elapsedMs,
                processedSeconds: data.processedSeconds, totalSeconds: request.duration,
                activeEngine: engine, hardwareAccelerated: false, fps, speed,
              });
              break;
            case 'completed': finish(); resolve({ buffer: data.outputBuffer, engine: data.engineUsed }); break;
            case 'error': finish(); reject(new Error(data.message)); break;
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

  cancel(): void {
    this.rejectPending?.(cancelledError());
  }
}
