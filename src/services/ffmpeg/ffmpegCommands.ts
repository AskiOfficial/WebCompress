import { ConversionSettings, VideoMetadata } from '../../types';
import { canCopyAudio } from '../../config/codecs';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps, qualityToCrf } from '../media/bitrateCalc';
import { getEncodingThreads } from './threading';

export { canCopyAudio };

export interface FFmpegCommandOptions {
  inputFilename: string;
  outputFilename: string;
  settings: ConversionSettings;
  source?: VideoMetadata;
  isMultiThread?: boolean;
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

export function buildFFmpegArgs(options: FFmpegCommandOptions): string[] {
  const { inputFilename, outputFilename, settings, source, isMultiThread } = options;
  const threads = getEncodingThreads(settings, isMultiThread === true);
  const args: string[] = ['-xerror'];

  if (settings.videoCodec === 'h265') {
    // Give the bounded x265 pool most of the workers. FFmpeg's automatic
    // decoder/filter pools compete for the same preallocated WASM pthreads.
    args.push('-filter_threads', '1', '-threads', '1');
  }
  args.push('-i', inputFilename, '-map', '0:v:0', '-map', '0:a:0?');

  // Video Filters (Scale + Padding to ensure even dimensions)
  const { width, height } = getTargetDimensions(settings, source);
  const targetFps = getTargetFps(settings, source);
  
  const videoFilters: string[] = [];
  
  if (settings.resolution !== 'original') {
    videoFilters.push(`scale=${width}:${height}`);
  } else {
    videoFilters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
  }

  if (videoFilters.length > 0) {
    args.push('-vf', videoFilters.join(','));
  }

  // Framerate
  if (settings.fps !== 'original') {
    args.push('-r', targetFps.toString());
  }

  // Video Codec & Quality/Bitrate
  if (settings.videoCodec === 'h264') {
    args.push('-c:v', 'libx264');
    // For high/near-lossless quality (>= 75), use 'veryfast' to enable CABAC and in-loop deblocking filter.
    // 'ultrafast' completely disables CABAC, B-frames, and deblocking, creating severe visible macroblocking.
    const preset = settings.qualityValue >= 75 ? 'veryfast' : 'ultrafast';
    args.push('-preset', preset);
    args.push('-pix_fmt', 'yuv420p');

    if (settings.qualityMode === 'quality') {
      const crf = qualityToCrf(settings.qualityValue, 'h264');
      args.push('-crf', crf.toString());
    } else {
      const calc = calculateBitratesAndEstimates(settings, source);
      const vBitrateK = Math.max(100, Math.round(calc.videoBitrateBps / 1000));
      args.push('-b:v', `${vBitrateK}k`);
      if (settings.bitrateMode === 'cbr') {
        args.push('-minrate', `${vBitrateK}k`, '-maxrate', `${vBitrateK}k`, '-bufsize', `${vBitrateK * 2}k`);
      }
    }
  } else if (settings.videoCodec === 'h265') {
    args.push('-c:v', 'libx265');
    const preset = settings.qualityValue >= 75 ? 'veryfast' : 'ultrafast';
    args.push('-preset', preset);
    args.push('-pix_fmt', 'yuv420p');
    // Ensure FourCC hvc1 tag for MP4/MOV compatibility with Apple/Windows
    if (settings.format === 'mp4' || settings.format === 'mov') {
      args.push('-tag:v', 'hvc1');
    }
    // Parallelize CTU rows within a frame, keeping frame/control threading
    // bounded. -threads alone does not configure x265's worker pool.
    args.push('-x265-params', threads > 1
      ? `pools=${threads}:frame-threads=1:wpp=1:lookahead-threads=0`
      : 'pools=none:frame-threads=1:wpp=0');

    if (settings.qualityMode === 'quality') {
      const crf = qualityToCrf(settings.qualityValue, 'h265');
      args.push('-crf', crf.toString());
    } else {
      const calc = calculateBitratesAndEstimates(settings, source);
      const vBitrateK = Math.max(100, Math.round(calc.videoBitrateBps / 1000));
      args.push('-b:v', `${vBitrateK}k`);
      if (settings.bitrateMode === 'cbr') {
        args.push('-minrate', `${vBitrateK}k`, '-maxrate', `${vBitrateK}k`, '-bufsize', `${vBitrateK * 2}k`);
      }
    }
  } else if (settings.videoCodec === 'vp9') {
    args.push('-c:v', 'libvpx-vp9');
    args.push('-deadline', 'realtime');
    args.push('-cpu-used', '4');

    if (settings.qualityMode === 'quality') {
      const crf = qualityToCrf(settings.qualityValue, 'vp9');
      args.push('-crf', crf.toString(), '-b:v', '0');
    } else {
      const calc = calculateBitratesAndEstimates(settings, source);
      const vBitrateK = Math.max(100, Math.round(calc.videoBitrateBps / 1000));
      args.push('-b:v', `${vBitrateK}k`);
    }
  }

  args.push(...buildAudioArgs(settings, source));

  // Fast Start (for MP4 and MOV web streaming)
  if ((settings.format === 'mp4' || settings.format === 'mov') && settings.fastStart) {
    args.push('-movflags', '+faststart');
  }

  // Metadata handling
  args.push('-map_metadata', settings.preserveMetadata ? '1' : '-1');

  // Multi-threading: calculate cores cleanly
  if (isMultiThread) {
    args.push('-threads', threads.toString());
  }

  // Overwrite output
  args.push('-y', outputFilename);

  return args;
}
