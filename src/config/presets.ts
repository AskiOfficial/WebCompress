import { CompressionPreset, ConversionSettings, VideoMetadata, ResolutionOption, FpsOption } from '../types';

export interface PresetDefinition {
  id: CompressionPreset;
  name: string;
  badge?: string;
  description: string;
}

export const PRESETS: PresetDefinition[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    badge: 'Recommended',
    description: 'Optimal balance of visual fidelity and compact file size (Original resolution & FPS).',
  },
  {
    id: 'small',
    name: 'Small',
    description: 'Aggressive compression for minimal storage (Original resolution & FPS).',
  },
  {
    id: 'high_quality',
    name: 'High Quality',
    description: 'High bitrate preserving crisp fine details (Original resolution & FPS).',
  },
  {
    id: 'web',
    name: 'Web / Streaming',
    description: 'Fast start streaming optimization (Original resolution & FPS).',
  },
  {
    id: 'discord',
    name: 'Discord',
    badge: '25 MB',
    description: 'Targeted to reliably fit within Discord’s 25 MB file upload limit.',
  },
  {
    id: 'email',
    name: 'Email',
    badge: '20 MB',
    description: 'Targeted to fit standard email attachment size restrictions.',
  },
  {
    id: 'original',
    name: 'Original / Re-encode',
    description: 'Retain original dimensions and framerate with standard re-encoding.',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Configure resolution, framerate, bitrates, and audio individually.',
  },
];

// HandBrake pattern: Default to original resolution and FPS for every preset
export function getResolutionForPreset(_preset: CompressionPreset, _source?: VideoMetadata): ResolutionOption {
  return 'original';
}

export function getFpsForPreset(_preset: CompressionPreset, _source?: VideoMetadata): FpsOption {
  return 'original';
}

export function createDefaultSettings(_source?: VideoMetadata): ConversionSettings {
  return {
    preset: 'balanced',
    format: 'mp4',
    videoCodec: 'h264',
    resolution: 'original',
    lockAspectRatio: true,
    fps: 'original',
    qualityMode: 'quality',
    qualityValue: 65, // Medium-High
    targetSizeMb: 25,
    bitrateMode: 'vbr',
    audioAction: 'compress',
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    audioChannels: 'original',
    processingMode: 'auto',
    cpuThreads: 0, // Auto (calculated based on detected cores)
    fastStart: true,
    preserveMetadata: false,
  };
}

export function applyPresetToSettings(
  current: ConversionSettings,
  preset: CompressionPreset,
  source?: VideoMetadata
): ConversionSettings {
  if (preset === 'custom') {
    return { ...current, preset: 'custom' };
  }

  // Start with clean default settings, preserving only hardware/execution preferences
  const base = createDefaultSettings(source);
  base.processingMode = current.processingMode;
  base.cpuThreads = current.cpuThreads;

  // Preserve original resolution and framerate by default for all profiles
  const resolution: ResolutionOption = 'original';
  const fps: FpsOption = 'original';

  switch (preset) {
    case 'small':
      return {
        ...base,
        preset: 'small',
        resolution,
        fps,
        qualityMode: 'quality',
        qualityValue: 35,
        audioAction: 'compress',
        audioBitrateKbps: 128,
        fastStart: true,
      };

    case 'balanced':
      return {
        ...base,
        preset: 'balanced',
        resolution,
        fps,
        qualityMode: 'quality',
        qualityValue: 65,
        audioAction: 'compress',
        audioBitrateKbps: 192,
        fastStart: true,
      };

    case 'high_quality':
      return {
        ...base,
        preset: 'high_quality',
        resolution,
        fps,
        qualityMode: 'quality',
        qualityValue: 85,
        audioAction: 'keep',
        audioBitrateKbps: 256,
        fastStart: true,
      };

    case 'web':
      return {
        ...base,
        preset: 'web',
        resolution,
        fps,
        qualityMode: 'quality',
        qualityValue: 60,
        audioAction: 'compress',
        audioBitrateKbps: 160,
        fastStart: true,
      };

    case 'discord':
      return {
        ...base,
        preset: 'discord',
        resolution,
        fps,
        qualityMode: 'target_size',
        targetSizeMb: 25,
        audioAction: 'compress',
        audioBitrateKbps: 128,
        fastStart: true,
      };

    case 'email':
      return {
        ...base,
        preset: 'email',
        resolution,
        fps,
        qualityMode: 'target_size',
        targetSizeMb: 20,
        audioAction: 'compress',
        audioBitrateKbps: 96,
        fastStart: true,
      };

    case 'original':
      return {
        ...base,
        preset: 'original',
        resolution,
        fps,
        qualityMode: 'quality',
        qualityValue: 75,
        audioAction: 'keep',
        audioBitrateKbps: 192,
        fastStart: true,
      };

    default:
      return current;
  }
}

/**
 * HandBrake pattern (Modified indicator):
 * Checks if the current settings diverge from the clean preset baseline.
 */
export function isPresetModified(settings: ConversionSettings, source?: VideoMetadata): boolean {
  if (settings.preset === 'custom') return false;

  const pristine = applyPresetToSettings(createDefaultSettings(source), settings.preset, source);

  if (settings.format !== pristine.format) return true;
  if (settings.videoCodec !== pristine.videoCodec) return true;
  if (settings.resolution !== pristine.resolution) return true;
  if (settings.fps !== pristine.fps) return true;
  if (settings.qualityMode !== pristine.qualityMode) return true;

  if (settings.qualityMode === 'quality') {
    if (settings.qualityValue !== pristine.qualityValue) return true;
  } else {
    if (settings.targetSizeMb !== pristine.targetSizeMb) return true;
  }

  if (settings.audioAction !== pristine.audioAction) return true;
  if (settings.audioBitrateKbps !== pristine.audioBitrateKbps) return true;
  if (settings.audioChannels !== pristine.audioChannels) return true;
  if (settings.bitrateMode !== pristine.bitrateMode) return true;
  if (settings.customVideoBitrateKbps !== pristine.customVideoBitrateKbps) return true;
  if (settings.fastStart !== pristine.fastStart) return true;
  if (settings.preserveMetadata !== pristine.preserveMetadata) return true;

  return false;
}
