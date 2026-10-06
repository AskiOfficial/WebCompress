import { ConversionSettings, VideoMetadata } from '../../types';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps, qualityToCrf } from '../../utils/bitrateCalc';
import { getAutoCpuThreads } from '../../utils/capabilityDetector';
import { buildAudioArgs } from './audioCommands';

export interface FFmpegCommandOptions {
  inputFilename: string;
  outputFilename: string;
  settings: ConversionSettings;
  source?: VideoMetadata;
  isMultiThread?: boolean;
}

export function buildFFmpegArgs(options: FFmpegCommandOptions): string[] {
  const { inputFilename, outputFilename, settings, source, isMultiThread } = options;
  const args: string[] = ['-xerror', '-i', inputFilename, '-map', '0:v:0', '-map', '0:a:0?'];

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
    // Prevent WebAssembly pthread deadlock on libx265 encoder close by running single-threaded
    args.push('-x265-params', 'pools=none:frame-threads=1:wpp=0');

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
  } else if (settings.videoCodec === 'av1') {
    // Note: If invoked in CPU mode, libaom-av1 is specified
    args.push('-c:v', 'libaom-av1');
    args.push('-cpu-used', '6');
    const crf = qualityToCrf(settings.qualityValue, 'av1');
    args.push('-crf', crf.toString());
  }

  args.push(...buildAudioArgs(settings, source));

  // Fast Start (for MP4 and MOV web streaming)
  if ((settings.format === 'mp4' || settings.format === 'mov') && settings.fastStart) {
    args.push('-movflags', '+faststart');
  }

  // Metadata handling
  if (!settings.preserveMetadata) {
    args.push('-map_metadata', '-1');
  }

  // Multi-threading: calculate cores cleanly
  if (isMultiThread) {
    const threads = settings.cpuThreads > 0 ? settings.cpuThreads : getAutoCpuThreads();
    args.push('-threads', threads.toString());
  }

  // Overwrite output
  args.push('-y', outputFilename);

  return args;
}
