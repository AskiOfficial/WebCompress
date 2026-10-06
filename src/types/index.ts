export type OutputFormat = 'mp4' | 'webm' | 'mkv' | 'mov' | 'avi';

export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1';

export type AudioCodec = 'auto' | 'aac' | 'opus' | 'mp3';

export type AudioAction = 'keep' | 'compress' | 'remove';

export type AudioChannels = 'original' | 'stereo' | 'mono' | 'surround51';

export type ResolutionOption = 'original' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | 'custom';

export type FpsOption = 'original' | 60 | 50 | 30 | 25 | 24 | 15 | 'custom';

export type QualityMode = 'quality' | 'target_size';

export type BitrateMode = 'vbr' | 'cbr';

export type ProcessingMode = 'auto' | 'hardware' | 'cpu';

export type ActiveEngine = 'webcodecs' | 'ffmpeg-mt' | 'ffmpeg-st';

export type CompressionPreset = 
  | 'balanced' 
  | 'small' 
  | 'high_quality' 
  | 'web' 
  | 'discord' 
  | 'email' 
  | 'original' 
  | 'custom';

export interface VideoMetadata {
  name: string;
  size: number; // bytes
  type: string;
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  videoCodec?: string;
  videoBitrate?: number; // bps
  audioCodec?: string;
  audioBitrate?: number; // bps
  audioChannels?: number;
  aspectRatio: number; // width / height
  objectUrl: string;
  file: File;
}

export interface ConversionSettings {
  preset: CompressionPreset;
  format: OutputFormat;
  videoCodec: VideoCodec;
  resolution: ResolutionOption;
  customWidth?: number;
  customHeight?: number;
  lockAspectRatio: boolean;
  fps: FpsOption;
  customFps?: number;
  qualityMode: QualityMode;
  qualityValue: number; // 0 - 100
  targetSizeMb?: number;
  bitrateMode: BitrateMode;
  customVideoBitrateKbps?: number;
  audioAction: AudioAction;
  audioCodec: AudioCodec;
  audioBitrateKbps: number;
  audioChannels: AudioChannels;
  processingMode: ProcessingMode;
  cpuThreads: number; // 0 for Auto
  fastStart: boolean;
  preserveMetadata: boolean;
}

export type ProcessingStage = 
  | 'idle'
  | 'initializing'
  | 'probing'
  | 'demuxing'
  | 'encoding'
  | 'muxing'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface ProcessingProgress {
  stage: ProcessingStage;
  percent: number; // 0 - 100
  elapsedMs: number;
  estimatedRemainingMs?: number;
  fps?: number;
  speed?: string;
  processedSeconds?: number;
  totalSeconds?: number;
  activeEngine: ActiveEngine;
  hardwareAccelerated: boolean;
  hardwarePreferred?: boolean;
  message?: string;
}

export interface CompressionResult {
  outputBlob: Blob;
  outputUrl: string;
  outputFileName: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  durationSeconds: number;
  compressionRatioPercent: number; // e.g. 77% saved
  elapsedTimeMs: number;
  format: OutputFormat;
  engineUsed: ActiveEngine;
  hardwareAccelerated: boolean;
  hardwarePreferred?: boolean;
}

export interface BrowserCapabilities {
  webAssembly: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webWorkers: boolean;
  webCodecs: boolean;
  videoEncoder: boolean;
  videoDecoder: boolean;
  hardwareConcurrency: number;
  h264Hardware: boolean;
  h265Hardware: boolean;
  vp9Hardware: boolean;
  av1Hardware: boolean;
  h264Software: boolean;
  h265Software: boolean;
  vp9Software: boolean;
  av1Software: boolean;
  multithreadWasm: boolean;
}
