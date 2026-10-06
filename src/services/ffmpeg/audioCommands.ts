import { ConversionSettings, VideoMetadata } from '../../types';

export function canCopyAudio(settings: ConversionSettings, source?: VideoMetadata): boolean {
  if (settings.audioAction !== 'keep' || settings.audioChannels !== 'original') return false;
  const codec = source?.audioCodec?.toLowerCase();
  if (!codec) return false;
  if (settings.format === 'mkv') return true;
  if (settings.format === 'webm') return codec === 'opus' || codec === 'vorbis';
  if (settings.format === 'mp4' || settings.format === 'mov') return codec === 'aac';
  return codec === 'mp3';
}

export function buildAudioArgs(settings: ConversionSettings, source?: VideoMetadata): string[] {
  if (settings.audioAction === 'remove') return ['-an'];
  if (canCopyAudio(settings, source)) return ['-c:a', 'copy'];
  const codec = settings.format === 'webm' || (settings.format === 'mkv' && settings.audioCodec === 'opus')
    ? 'libopus' : settings.format === 'avi' ? 'libmp3lame' : 'aac';
  const args = ['-c:a', codec, '-b:a', `${settings.audioBitrateKbps || 192}k`];
  if (settings.audioChannels === 'mono') args.push('-ac', '1');
  if (settings.audioChannels === 'stereo') args.push('-ac', '2');
  if (settings.audioChannels === 'surround51') args.push('-ac', '6');
  return args;
}

export function buildFinalizeArgs(settings: ConversionSettings, source?: VideoMetadata): string[] {
  // Video is already encoded. Never invoke a CPU video encoder in this job.
  // Both inputs use the media presentation timeline; do not independently reset audio timestamps
  // or use -shortest (which can truncate either track when their lengths differ).
  const args = ['-xerror', '-i', '/input/video.mp4', '-i', '/input/source', '-map', '0:v:0'];
  if (settings.audioAction !== 'remove') args.push('-map', '1:a:0?');
  args.push('-c:v', 'copy', ...buildAudioArgs(settings, source));
  if ((settings.format === 'mp4' || settings.format === 'mov') && settings.videoCodec === 'h265') args.push('-tag:v', 'hvc1');
  if ((settings.format === 'mp4' || settings.format === 'mov') && settings.fastStart) args.push('-movflags', '+faststart');
  args.push('-map_metadata', settings.preserveMetadata ? '1' : '-1', '-y', `output.${settings.format}`);
  return args;
}
