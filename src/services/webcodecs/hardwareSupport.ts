import type { ConversionSettings, VideoMetadata } from '../../types';
import { getCompatibleVideoCodecs } from '../../config/codecs';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps } from '../media/bitrateCalc';
import { resolveEncoderConfig } from './encoderConfig';
import { formatFps } from '../../utils/formatters';

export interface HardwareEncodingSupport {
  supported: boolean;
  suggestion?: { resolution: '1080p' | '720p'; width: number; height: number };
}

export function encodingConfigurationLabel(settings: ConversionSettings, source?: VideoMetadata): string {
  const { width, height } = getTargetDimensions(settings, source);
  const names = { h264: 'H.264', h265: 'HEVC', vp9: 'VP9', av1: 'AV1' };
  return `${names[settings.videoCodec]} ${width}×${height} at ${formatFps(getTargetFps(settings, source))}`;
}

/** Use the same exact configuration as the processing engine, not a generic codec probe. */
export async function checkHardwareEncodingSupport(settings: ConversionSettings, source?: VideoMetadata): Promise<HardwareEncodingSupport> {
  if (!getCompatibleVideoCodecs(settings.format).includes(settings.videoCodec)) return { supported: false };
  const supported = async (candidate: ConversionSettings) => {
    const { width, height } = getTargetDimensions(candidate, source);
    return !!await resolveEncoderConfig(candidate.videoCodec, width, height, getTargetFps(candidate, source),
      calculateBitratesAndEstimates(candidate, source).videoBitrateBps, true);
  };
  if (await supported(settings)) return { supported: true };
  const target = getTargetDimensions(settings, source);
  const original = getTargetDimensions({ ...settings, resolution: 'original' }, source);
  // Suggestions preserve aspect ratio and FPS, never upscale or silently alter settings.
  for (const resolution of ['1080p', '720p'] as const) {
    const candidate = { ...settings, resolution };
    const dimensions = getTargetDimensions(candidate, source);
    if (dimensions.width > target.width || dimensions.height >= target.height
      || dimensions.width > original.width || dimensions.height > original.height) continue;
    if (await supported(candidate)) return { supported: false, suggestion: { resolution, ...dimensions } };
  }
  return { supported: false };
}
