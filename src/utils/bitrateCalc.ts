import { ConversionSettings, VideoMetadata } from '../types';
import { canCopyAudio } from '../services/ffmpeg/audioCommands';

export interface BitrateCalculationResult {
  videoBitrateBps: number;
  audioBitrateBps: number;
  totalBitrateBps: number;
  estimatedSizeBytes: number;
  isTooLow: boolean;
  warningMessage?: string;
}

export function qualityToCrf(qualityValue: number, codec: 'h264' | 'h265' | 'vp9' | 'av1'): number {
  const q = Math.max(0, Math.min(100, qualityValue));
  
  if (codec === 'h264') {
    // 0 -> 38 (aggressive compression), 100 -> 10 (visually near-lossless, no visible artifacts)
    return Math.round(38 - (q / 100) * (38 - 10));
  } else if (codec === 'h265') {
    // 0 -> 40, 100 -> 12 (pristine HEVC fidelity)
    return Math.round(40 - (q / 100) * (40 - 12));
  } else if (codec === 'vp9') {
    // 0 -> 50, 100 -> 15 (high fidelity VP9)
    return Math.round(50 - (q / 100) * (50 - 15));
  } else {
    // AV1: 0 -> 52, 100 -> 16
    return Math.round(52 - (q / 100) * (52 - 16));
  }
}

export function getTargetDimensions(settings: ConversionSettings, source?: VideoMetadata): { width: number; height: number } {
  const origW = source?.width || 1920;
  const origH = source?.height || 1080;
  const aspectRatio = origW / origH;

  let targetH = origH;
  let targetW = origW;

  if (settings.resolution === '2160p') {
    targetH = 2160;
    targetW = Math.round(targetH * aspectRatio);
  } else if (settings.resolution === '1440p') {
    targetH = 1440;
    targetW = Math.round(targetH * aspectRatio);
  } else if (settings.resolution === '1080p') {
    targetH = 1080;
    targetW = Math.round(targetH * aspectRatio);
  } else if (settings.resolution === '720p') {
    targetH = 720;
    targetW = Math.round(targetH * aspectRatio);
  } else if (settings.resolution === '480p') {
    targetH = 480;
    targetW = Math.round(targetH * aspectRatio);
  } else if (settings.resolution === 'custom') {
    targetW = settings.customWidth || origW;
    targetH = settings.customHeight || origH;
  }

  // Ensure dimensions are even (required by H.264 / VP9 / yuv420p)
  targetW = Math.round(targetW / 2) * 2;
  targetH = Math.round(targetH / 2) * 2;

  return { width: Math.max(2, targetW), height: Math.max(2, targetH) };
}

export function getTargetFps(settings: ConversionSettings, source?: VideoMetadata): number {
  const origFps = source?.fps && source.fps > 0 ? source.fps : 30;
  if (settings.fps === 'original') return origFps;
  if (settings.fps === 'custom') return settings.customFps || origFps;
  return Number(settings.fps);
}

export function calculateBitratesAndEstimates(
  settings: ConversionSettings,
  source?: VideoMetadata
): BitrateCalculationResult {
  const duration = source?.duration && source.duration > 0 ? source.duration : 60;
  const originalSize = source?.size || 50 * 1024 * 1024;
  
  // Audio bitrate
  let audioBitrateBps = 0;
  if (settings.audioAction !== 'remove') {
    audioBitrateBps = canCopyAudio(settings, source) && source?.audioBitrate
      ? source.audioBitrate : (settings.audioBitrateKbps || 128) * 1000;
  }

  if (settings.qualityMode === 'target_size' && settings.targetSizeMb) {
    const targetBytes = settings.targetSizeMb * 1024 * 1024;
    const targetBits = targetBytes * 8;
    const totalBitrateBps = Math.floor(targetBits / duration);
    
    // Safety margin 4% for container headers/metadata
    const containerMarginBps = Math.floor(totalBitrateBps * 0.04);
    let videoBitrateBps = totalBitrateBps - audioBitrateBps - containerMarginBps;
    
    const isTooLow = videoBitrateBps < 120_000; // less than 120 kbps
    let warningMessage: string | undefined;

    if (isTooLow) {
      warningMessage = `Target size (${settings.targetSizeMb} MB) for a ${Math.round(duration)}s video requires an extremely low video bitrate (~${Math.round(videoBitrateBps / 1000)} kbps). Visual quality will be severely degraded.`;
    }

    if (videoBitrateBps < 50_000) {
      videoBitrateBps = 50_000;
    }

    return {
      videoBitrateBps,
      audioBitrateBps,
      totalBitrateBps,
      estimatedSizeBytes: targetBytes,
      isTooLow,
      warningMessage,
    };
  }

  // If custom bitrate in advanced settings
  if (settings.customVideoBitrateKbps && settings.customVideoBitrateKbps > 0) {
    const videoBitrateBps = settings.customVideoBitrateKbps * 1000;
    const totalBitrateBps = videoBitrateBps + audioBitrateBps;
    const estimatedSizeBytes = Math.floor((totalBitrateBps * duration) / 8);

    return {
      videoBitrateBps,
      audioBitrateBps,
      totalBitrateBps,
      estimatedSizeBytes,
      isTooLow: videoBitrateBps < 120_000,
      warningMessage: videoBitrateBps < 120_000 ? 'Video bitrate is very low.' : undefined,
    };
  }

  // Quality mode (CRF / Quality slider)
  const { width, height } = getTargetDimensions(settings, source);
  const targetFps = getTargetFps(settings, source);
  const crf = qualityToCrf(settings.qualityValue, settings.videoCodec);

  // Baseline empirical bitrate at 1080p 30fps CRF 23 ~ 2,500,000 bps
  const pixelCount = width * height;
  const standard1080pPixels = 1920 * 1080;
  const resolutionFactor = pixelCount / standard1080pPixels;
  const fpsFactor = targetFps / 30;

  // CRF curve approximation: ±6 CRF doubles / halves bitrate
  const crfFactor = Math.pow(2, (23 - crf) / 6);
  
  // Codec efficiency factor: VP9 is ~30% more efficient than H.264, AV1 is ~45% more efficient
  let codecEfficiency = 1.0;
  if (settings.videoCodec === 'h265') codecEfficiency = 0.65;
  if (settings.videoCodec === 'vp9') codecEfficiency = 0.72;
  if (settings.videoCodec === 'av1') codecEfficiency = 0.58;

  let base1080pBitrate = 3_200_000; // 3.2 Mbps for balanced H.264
  let estimatedVideoBitrate = Math.round(
    base1080pBitrate * Math.pow(resolutionFactor, 0.8) * Math.pow(fpsFactor, 0.75) * crfFactor * codecEfficiency
  );

  // Clamp within realistic limits (up to 65 Mbps for 4K / 60fps near-lossless)
  estimatedVideoBitrate = Math.max(120_000, Math.min(65_000_000, estimatedVideoBitrate));

  const totalBitrateBps = estimatedVideoBitrate + audioBitrateBps;
  let estimatedSizeBytes = Math.round((totalBitrateBps * duration) / 8 * 1.03); // +3% container overhead

  // If estimated size is greater than original, cap display realistically
  if (source && estimatedSizeBytes > originalSize * 1.2) {
    estimatedSizeBytes = Math.round(originalSize * 0.95);
  }

  return {
    videoBitrateBps: estimatedVideoBitrate,
    audioBitrateBps,
    totalBitrateBps,
    estimatedSizeBytes,
    isTooLow: false,
  };
}
