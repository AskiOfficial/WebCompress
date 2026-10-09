import { CompressionResult, ConversionSettings, VideoMetadata } from '../../types';
import { FFmpegEngine, FFmpegEngineEvents } from '../ffmpeg/ffmpegEngine';
import { WebCodecsEngine } from '../webcodecs/webcodecsEngine';
import { cancelledError, MediaProcessingError } from './mediaError';
import { encodingConfigurationLabel } from '../webcodecs/hardwareSupport';

export type MediaEngineEvents = FFmpegEngineEvents;

export interface IMediaEngine {
  process(file: File, settings: ConversionSettings, metadata: VideoMetadata, events: MediaEngineEvents): Promise<CompressionResult>;
  cancel(): void | Promise<void>;
}

export class MediaEngineDispatcher implements IMediaEngine {
  private ffmpegEngine = new FFmpegEngine();
  private webCodecsEngine = new WebCodecsEngine();
  private activeEngineInstance: IMediaEngine | null = null;
  private controller: AbortController | null = null;

  async process(
    file: File,
    settings: ConversionSettings,
    metadata: VideoMetadata,
    events: MediaEngineEvents
  ): Promise<CompressionResult> {
    const controller = new AbortController();
    this.controller = controller;
    try {
      let engine: IMediaEngine = this.ffmpegEngine;
      if (settings.processingMode === 'cpu' && settings.videoCodec === 'av1') {
        throw new MediaProcessingError('AV1 is unavailable in the CPU engine. Select Auto or a different codec.');
      }
      if (settings.processingMode !== 'cpu') {
        const supported = await this.webCodecsEngine.isSupported(settings, metadata);
        if (controller.signal.aborted) throw cancelledError();
        if (supported) {
          engine = this.webCodecsEngine;
        } else if (settings.processingMode === 'hardware' || settings.videoCodec === 'av1') {
          throw new MediaProcessingError(
            `Browser encoding is unavailable for ${encodingConfigurationLabel(settings, metadata)}${settings.processingMode === 'hardware' ? ' with hardware preferred' : ''}. ${settings.videoCodec === 'av1' ? 'Choose a supported resolution or another codec.' : 'Choose a supported resolution, or select Auto/CPU.'}`,
            'The selected configuration is not supported by this browser. Hardware support for 720p/1080p does not imply support for higher resolutions. No encoding was started.'
          );
        } else {
          events.onStage('initializing', 'Auto selected CPU: browser encoding is unavailable for these settings.');
        }
      }
      if (controller.signal.aborted) throw cancelledError();
      this.activeEngineInstance = engine;
      // Invariant: Select an engine once. Errors and cancellation never start another encoding job.
      return await engine.process(file, settings, metadata, events);
    } finally {
      if (this.controller === controller) {
        this.activeEngineInstance = null;
        this.controller = null;
      }
    }
  }

  async cancel(): Promise<void> {
    this.controller?.abort();
    await this.activeEngineInstance?.cancel();
  }
}

export const mediaEngine = new MediaEngineDispatcher();
