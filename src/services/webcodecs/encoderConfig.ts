import { VideoCodec } from '../../types';
import { getCodecCandidateStrings } from './codecString';

// TypeScript's DOM definitions do not yet include the HEVC registration extension.
export type MediaVideoEncoderConfig = VideoEncoderConfig & { hevc?: { format: 'hevc' } };

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
  for (const hardwareAcceleration of preferences) {
    for (const candidate of getCodecCandidateStrings(codec, width, height, fps)) {
      const config: MediaVideoEncoderConfig = {
        codec: candidate, width, height, framerate: fps,
        bitrate: Math.max(100_000, Math.round(bitrate)),
        hardwareAcceleration,
        bitrateMode: 'variable',
        // The muxer receives presentation timestamps only. Avoid B-frame reordering.
        latencyMode: 'realtime',
        ...(codec === 'h264' ? { avc: { format: 'avc' as const } } : {}),
        ...(codec === 'h265' ? { hevc: { format: 'hevc' as const } } : {}),
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return config;
      } catch {
        // A rejected profile is not an encoding failure; try another profile before starting.
      }
    }
  }
  return null;
}
