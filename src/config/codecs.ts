import { AudioCodec, ConversionSettings, OutputFormat, VideoCodec, VideoMetadata } from '../types';

export interface CodecInfo {
  id: VideoCodec;
  name: string;
  badge: string;
  description: string;
  recommendedContainer: OutputFormat;
}

export const VIDEO_CODECS: Record<VideoCodec, CodecInfo> = {
  h264: {
    id: 'h264',
    name: 'H.264 / AVC',
    badge: 'Best compatibility',
    description: 'Fast / best compatibility — plays on virtually any browser, TV, or phone.',
    recommendedContainer: 'mp4',
  },
  h265: {
    id: 'h265',
    name: 'H.265 / HEVC',
    badge: 'High efficiency',
    description: 'Higher compression (~50% smaller than H.264) — ideal for 4K and 1080p.',
    recommendedContainer: 'mp4',
  },
  vp9: {
    id: 'vp9',
    name: 'VP9',
    badge: 'Good compression',
    description: 'Smaller files / good web support — efficient modern web video format.',
    recommendedContainer: 'webm',
  },
  av1: {
    id: 'av1',
    name: 'AV1',
    badge: 'Best compression (WebCodecs)',
    description: 'Next-gen open standard compression — requires browser WebCodecs AV1 encoder.',
    recommendedContainer: 'webm',
  },
};

export const CONTAINER_FORMATS: Record<OutputFormat, {
  name: string;
  extension: string;
  mime: string;
  defaultVideoCodec: VideoCodec;
  defaultAudioCodec: AudioCodec;
  compatibleVideoCodecs: VideoCodec[];
  compatibleAudioCodecs: AudioCodec[];
}> = {
  mp4: {
    name: 'MP4',
    extension: '.mp4',
    mime: 'video/mp4',
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
    compatibleVideoCodecs: ['h264', 'h265', 'av1'],
    compatibleAudioCodecs: ['aac'],
  },
  webm: {
    name: 'WebM',
    extension: '.webm',
    mime: 'video/webm',
    defaultVideoCodec: 'vp9',
    defaultAudioCodec: 'opus',
    compatibleVideoCodecs: ['vp9', 'av1'],
    compatibleAudioCodecs: ['opus'],
  },
  mkv: {
    name: 'MKV',
    extension: '.mkv',
    mime: 'video/x-matroska',
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
    compatibleVideoCodecs: ['h264', 'h265', 'vp9', 'av1'],
    compatibleAudioCodecs: ['aac', 'opus'],
  },
  mov: {
    name: 'MOV',
    extension: '.mov',
    mime: 'video/quicktime',
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
    compatibleVideoCodecs: ['h264', 'h265'],
    compatibleAudioCodecs: ['aac'],
  },
  avi: {
    name: 'AVI',
    extension: '.avi',
    mime: 'video/x-msvideo',
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'mp3',
    compatibleVideoCodecs: ['h264'],
    compatibleAudioCodecs: ['mp3', 'aac'],
  },
};

export function getCompatibleVideoCodecs(format: OutputFormat): VideoCodec[] {
  return CONTAINER_FORMATS[format]?.compatibleVideoCodecs ?? ['h264'];
}

export function getDefaultVideoCodec(format: OutputFormat): VideoCodec {
  return CONTAINER_FORMATS[format]?.defaultVideoCodec ?? 'h264';
}

export function getCompatibleAudioCodecs(format: OutputFormat): AudioCodec[] {
  return CONTAINER_FORMATS[format]?.compatibleAudioCodecs ?? ['aac'];
}

export function getDefaultAudioCodec(format: OutputFormat): AudioCodec {
  return CONTAINER_FORMATS[format]?.defaultAudioCodec ?? 'aac';
}

/**
 * Checks whether audio can be copied without re-encoding.
 * Solves inverted architectural dependency: lives cleanly in container/codecs domain.
 */
export function canCopyAudio(settings: ConversionSettings, source?: VideoMetadata): boolean {
  if (settings.audioAction !== 'keep' || settings.audioChannels !== 'original') return false;
  const codec = source?.audioCodec?.toLowerCase();
  if (!codec) return false;
  if (settings.format === 'mkv') return true;
  if (settings.format === 'webm') return codec.includes('opus') || codec.includes('vorbis');
  if (settings.format === 'mp4' || settings.format === 'mov') return codec.includes('aac');
  return codec.includes('mp3');
}
