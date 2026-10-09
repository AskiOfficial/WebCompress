import { ActiveEngine, ProcessingStage } from '../../types';

export interface FFmpegJobRequest {
  type: 'run';
  inputs: { name: string; data: Blob }[];
  outputName: string;
  args: string[];
  // Initialization may fall back to core-st. Never send it pthread encoder options.
  singleThreadArgs?: string[];
  // The shipped core-st x265 build cannot initialize its frame encoder thread.
  requiresMultiThread?: boolean;
  duration: number;
  preferMultiThread: boolean;
  stage: 'encoding' | 'muxing';
}

export type FFmpegJobResponse =
  | { type: 'stage'; stage: ProcessingStage; message: string }
  | { type: 'engine_ready'; engine: ActiveEngine }
  | { type: 'progress'; percent: number; elapsedMs: number; processedSeconds: number }
  | { type: 'stats'; fps?: number; speed?: string; encoderThreads?: number }
  | { type: 'completed'; outputBuffer: ArrayBuffer; engineUsed: ActiveEngine }
  | { type: 'error'; message: string; userMessage?: string };
