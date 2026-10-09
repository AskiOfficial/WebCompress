import { ConversionSettings, VideoCodec, VideoMetadata } from '../../types';
import { getCompatibleVideoCodecs } from '../../config/codecs';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps } from '../media/bitrateCalc';
import { formatFps } from '../../utils/formatters';

// TypeScript's DOM definitions do not yet include the HEVC registration extension.
export type MediaVideoEncoderConfig = VideoEncoderConfig & { hevc?: { format: 'hevc' } };

export interface HardwareEncodingSupport {
  supported: boolean;
  suggestion?: { resolution: '1080p' | '720p'; width: number; height: number };
}

/**
 * Codec string and level resolution for WebCodecs VideoEncoder.
 * Generates RFC 6381 compliant codec strings matching video dimensions and framerate.
 */
export function getCodecCandidateStrings(
  codec: string,
  width = 1280,
  height = 720,
  fps = 30
): string[] {
  const samples = width * height;
  const sampleRate = samples * (fps || 30);

  switch (codec) {
    case 'h265': {
      const validLevels: string[] = [];

      if (samples <= 983_040 && sampleRate <= 33_177_600) {
        validLevels.push('L93');
      }
      if (samples <= 2_228_224 && sampleRate <= 66_846_720) {
        validLevels.push('L120');
      }
      if (samples <= 2_228_224 && sampleRate <= 133_693_440) {
        validLevels.push('L123');
      }
      if (samples <= 8_912_896 && sampleRate <= 267_386_880) {
        validLevels.push('L150');
      }
      if (samples <= 8_912_896 && sampleRate <= 534_773_760) {
        validLevels.push('L153');
      }
      validLevels.push('L156', 'L180', 'L183');

      const candidates: string[] = [];

      for (const level of validLevels) {
        candidates.push(`hvc1.1.6.${level}.B0`);
        candidates.push(`hev1.1.6.${level}.B0`);
        candidates.push(`hvc1.1.6.${level}.90`);
        candidates.push(`hev1.1.6.${level}.90`);
        candidates.push(`hvc1.1.6.${level}`);
        candidates.push(`hev1.1.6.${level}`);
        candidates.push(`hvc1.1.6.${level}.00`);
        candidates.push(`hev1.1.6.${level}.00`);
      }

      for (const level of validLevels) {
        candidates.push(`hvc1.2.4.${level}.B0`);
        candidates.push(`hev1.2.4.${level}.B0`);
        candidates.push(`hvc1.2.4.${level}.90`);
        candidates.push(`hev1.2.4.${level}.90`);
        candidates.push(`hvc1.2.4.${level}`);
        candidates.push(`hev1.2.4.${level}`);
      }

      return Array.from(new Set(candidates));
    }

    case 'h264': {
      const candidates: string[] = [];

      let primaryLevel = '28'; // 4.0
      if (samples <= 921_600 && sampleRate <= 27_648_000) {
        primaryLevel = '1F'; // 3.1
      } else if (samples <= 2_073_600 && sampleRate <= 66_846_720) {
        primaryLevel = '28'; // 4.0
      } else if (samples <= 2_073_600 && sampleRate <= 133_693_440) {
        primaryLevel = '2A'; // 4.2
      } else if (samples <= 8_294_400 && sampleRate <= 251_658_240) {
        primaryLevel = '33'; // 5.1
      } else {
        primaryLevel = '34'; // 5.2
      }

      // Constrained Baseline (42E0) - index 0 preserved for vitest expectations
      candidates.push(`avc1.42E0${primaryLevel}`);
      candidates.push(`avc1.4D40${primaryLevel}`);
      candidates.push(`avc1.6400${primaryLevel}`);
      candidates.push(`avc1.6408${primaryLevel}`);
      candidates.push(`avc1.4D00${primaryLevel}`);
      candidates.push(`avc1.4200${primaryLevel}`);

      for (const lvl of ['34', '33', '32', '3E', '3C']) {
        candidates.push(`avc1.6400${lvl}`);
        candidates.push(`avc1.6408${lvl}`);
        candidates.push(`avc1.4D40${lvl}`);
        candidates.push(`avc1.4D00${lvl}`);
      }

      const otherLevels = ['34', '33', '32', '2A', '29', '28', '1F', '3C', '3E'].filter(l => l !== primaryLevel);
      for (const lvl of otherLevels) {
        candidates.push(`avc1.6400${lvl}`);
        candidates.push(`avc1.6408${lvl}`);
        candidates.push(`avc1.4D40${lvl}`);
        candidates.push(`avc1.4D00${lvl}`);
        candidates.push(`avc1.42E0${lvl}`);
        candidates.push(`avc1.4200${lvl}`);
      }

      return Array.from(new Set(candidates));
    }

    case 'vp9': {
      const candidates: string[] = [];

      let primaryLevel = '40';
      if (samples <= 921_600 && sampleRate <= 27_648_000) {
        primaryLevel = '31';
      } else if (samples <= 2_073_600 && sampleRate <= 62_208_000) {
        primaryLevel = '40';
      } else if (samples <= 2_073_600) {
        primaryLevel = '41';
      } else if (samples <= 8_294_400) {
        primaryLevel = '50';
      } else {
        primaryLevel = '51';
      }

      candidates.push(`vp09.00.${primaryLevel}.08`);
      candidates.push('vp09.00.41.08');
      candidates.push('vp09.00.40.08');
      candidates.push('vp09.00.31.08');
      candidates.push('vp09.00.50.08');
      candidates.push('vp09.00.51.08');
      candidates.push('vp09.00.10.08');

      return Array.from(new Set(candidates));
    }

    case 'av1': {
      const candidates: string[] = [];

      let primaryLevel = '08M';
      if (samples <= 921_600) {
        primaryLevel = '04M';
      } else if (samples <= 2_073_600) {
        primaryLevel = '08M';
      } else if (samples <= 8_294_400) {
        primaryLevel = '12M';
      } else {
        primaryLevel = '16M';
      }

      candidates.push(`av01.0.${primaryLevel}.08`);
      candidates.push('av01.0.08M.08');
      candidates.push('av01.0.04M.08');
      candidates.push('av01.0.12M.08');
      candidates.push('av01.0.16M.08');

      return Array.from(new Set(candidates));
    }

    default:
      return ['avc1.42E01F'];
  }
}

export async function resolveEncoderConfig(
  codec: VideoCodec,
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  hardwareOnly: boolean,
): Promise<MediaVideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') return null;
  const preferences: HardwareAcceleration[] = hardwareOnly
    ? ['prefer-hardware'] : ['prefer-hardware', 'no-preference'];
  const candidates = getCodecCandidateStrings(codec, width, height, fps);
  const clampedBitrate = Math.max(100_000, Math.round(bitrate));

  for (const hardwareAcceleration of preferences) {
    // 1. Primary pass: low-latency realtime configuration
    for (const candidate of candidates) {
      const config: MediaVideoEncoderConfig = {
        codec: candidate,
        width,
        height,
        framerate: fps,
        bitrate: clampedBitrate,
        hardwareAcceleration,
        bitrateMode: 'variable',
        latencyMode: 'realtime',
        ...(codec === 'h264' ? { avc: { format: 'avc' as const } } : {}),
        ...(codec === 'h265' ? { hevc: { format: 'hevc' as const } } : {}),
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return config;
      } catch {
        // Continue probing candidates.
      }
    }

    // 2. High-resolution & HEVC fallback pass:
    // Some hardware encoders reject 'realtime' latency at resolutions > 1080p,
    // requiring 'quality' latency mode or omitting vendor-specific dictionary extensions.
    const fallbackOptions: Array<{
      latencyMode?: LatencyMode;
      bitrateMode?: VideoEncoderBitrateMode;
      includeFormatExtension?: boolean;
    }> = [
      { latencyMode: 'quality', bitrateMode: 'variable', includeFormatExtension: true },
      { latencyMode: 'quality', bitrateMode: 'variable', includeFormatExtension: false },
      { bitrateMode: 'variable', includeFormatExtension: true },
      { bitrateMode: 'variable', includeFormatExtension: false },
      { latencyMode: 'quality', bitrateMode: 'constant', includeFormatExtension: true },
      { latencyMode: 'quality', bitrateMode: 'constant', includeFormatExtension: false },
    ];

    for (const opts of fallbackOptions) {
      for (const candidate of candidates) {
        const config: MediaVideoEncoderConfig = {
          codec: candidate,
          width,
          height,
          framerate: fps,
          bitrate: clampedBitrate,
          hardwareAcceleration,
          ...(opts.bitrateMode ? { bitrateMode: opts.bitrateMode } : {}),
          ...(opts.latencyMode ? { latencyMode: opts.latencyMode } : {}),
          ...(opts.includeFormatExtension && codec === 'h264' ? { avc: { format: 'avc' as const } } : {}),
          ...(opts.includeFormatExtension && codec === 'h265' ? { hevc: { format: 'hevc' as const } } : {}),
        };
        try {
          const support = await VideoEncoder.isConfigSupported(config);
          if (support.supported) return config;
        } catch {
          // Continue probing.
        }
      }
    }
  }
  return null;
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
