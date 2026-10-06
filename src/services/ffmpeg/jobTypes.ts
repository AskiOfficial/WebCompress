import { ActiveEngine, ProcessingStage } from '../../types';

export interface FFmpegJobRequest {
  type: 'run';
  inputs: { name: string; data: Blob }[];
  outputName: string;
  args: string[];
  duration: number;
  preferMultiThread: boolean;
  stage: 'encoding' | 'muxing';
}

export type FFmpegJobResponse =
  | { type: 'stage'; stage: ProcessingStage; message: string }
  | { type: 'engine_ready'; engine: ActiveEngine }
  | { type: 'progress'; percent: number; elapsedMs: number; processedSeconds: number }
  | { type: 'stats'; fps?: number; speed?: string }
  | { type: 'completed'; outputBuffer: ArrayBuffer; engineUsed: ActiveEngine }
  | { type: 'error'; message: string };
