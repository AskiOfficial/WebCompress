import { CompressionResult, ConversionSettings, VideoMetadata } from '../../types';
import { CONTAINER_FORMATS } from '../../config/codecs';
import { buildFFmpegArgs } from './ffmpegCommands';
import { buildFinalizeArgs } from './audioCommands';
import { FFmpegJob, FFmpegJobEvents } from './ffmpegJob';
import { MediaProcessingError } from '../mediaError';

export type FFmpegEngineEvents = FFmpegJobEvents;

export class FFmpegEngine {
  private job = new FFmpegJob();

  async process(file: File, settings: ConversionSettings, metadata: VideoMetadata, events: FFmpegEngineEvents): Promise<CompressionResult> {
    const start = performance.now();
    const multi = settings.cpuThreads !== 1 && globalThis.crossOriginIsolated === true;
    const outputName = `output.${settings.format}`;
    const result = await this.job.run({
      type: 'run', inputs: [{ name: 'source', data: file }], outputName,
      args: buildFFmpegArgs({ inputFilename: '/input/source', outputFilename: outputName, settings, source: metadata, isMultiThread: multi }),
      duration: metadata.duration, preferMultiThread: multi, stage: 'encoding',
    }, events);
    const outputBlob = new Blob([result.buffer], { type: CONTAINER_FORMATS[settings.format].mime });
    return {
      outputBlob, outputUrl: URL.createObjectURL(outputBlob),
      outputFileName: `${file.name.replace(/\.[^.]+$/, '')}_compressed.${settings.format}`,
      originalSizeBytes: file.size, compressedSizeBytes: outputBlob.size,
      durationSeconds: metadata.duration,
      compressionRatioPercent: Math.round(Math.max(0, 1 - outputBlob.size / file.size) * 100),
      elapsedTimeMs: performance.now() - start, format: settings.format,
      engineUsed: result.engine, hardwareAccelerated: false,
    };
  }

  async finalizeVideo(video: Blob, file: File, settings: ConversionSettings, metadata: VideoMetadata,
    events: FFmpegEngineEvents, signal: AbortSignal): Promise<Blob> {
    try {
      const result = await this.job.run({
        type: 'run', inputs: [{ name: 'video.mp4', data: video }, { name: 'source', data: file }],
        outputName: `output.${settings.format}`, args: buildFinalizeArgs(settings, metadata),
        duration: metadata.duration, preferMultiThread: false, stage: 'muxing',
      }, events, signal);
      return new Blob([result.buffer], { type: CONTAINER_FORMATS[settings.format].mime });
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      throw new MediaProcessingError('Audio or final file creation failed. No incomplete file was saved. Video encoding was not switched to CPU.',
        error instanceof Error ? error.message : String(error));
    }
  }

  async cancel(): Promise<void> { this.job.cancel(); }
}
