import type { MediaVideoEncoderConfig } from './encoderConfig';
import type { VideoCodec } from '../../types';

export const PIPELINE_LIMITS = {
  decodeQueue: 8,
  decoderInFlight: 24,
  decodedFrames: 8,
  encodeQueue: 6,
  encoderInFlight: 8,
} as const;

export class SequentialUnavailable extends Error {}

export interface PipelineStats {
  encodedFrames: number;
  decodedFrames: number;
  framesCreated: number;
  framesClosed: number;
  canvasFrames: number;
  seeks: number;
  flushes: number;
  encodeQueueMax: number;
  decodeQueueMax: number;
  decodedQueueMax: number;
  encoderInFlightMax: number;
  decoderInFlightMax: number;
  timings: {
    encoderWait: number;
    decodeLatency: number;
    encodeLatency: number;
  };
}

export interface VideoPipelineRequest {
  file: File;
  config: MediaVideoEncoderConfig;
  codec: VideoCodec;
  duration: number;
  fps: number;
}

export type VideoPipelineResponse =
  | { type: 'progress'; frames: number; total: number; stats?: PipelineStats }
  | { type: 'unsupported'; reason: string }
  | { type: 'error'; message: string; stats?: PipelineStats }
  | { type: 'complete'; buffer: ArrayBuffer; stats?: PipelineStats };
