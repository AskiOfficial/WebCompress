import { describe, it, expect } from 'vitest';
import { buildFFmpegArgs } from '../src/services/ffmpeg/ffmpegCommands';
import { ConversionSettings, VideoMetadata } from '../src/types';
import { createDefaultSettings } from '../src/config/presets';
import { getAutoCpuThreads, H265_MAX_CPU_THREADS } from '../src/services/ffmpeg/threading';

describe('FFmpeg commands builder', () => {
  const mockSource1080p: VideoMetadata = {
    name: 'input.mov',
    size: 50 * 1024 * 1024,
    type: 'video/quicktime',
    duration: 30,
    width: 1920,
    height: 1080,
    fps: 60,
    aspectRatio: 16 / 9,
    objectUrl: 'blob:test',
    file: new File([], 'input.mov'),
  };

  it('generates correct arguments for 1080p MP4 H.264 -> 720p MP4 H.264', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      format: 'mp4',
      videoCodec: 'h264',
      resolution: '720p',
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-i');
    expect(args).toContain('input.mp4');
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toContain('scale=1280:720');
    expect(args).toContain('-c:v');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx264');
    expect(args).toContain('-c:a');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
    expect(args).toContain('output.mp4');
  });

  it('generates correct arguments for H.265 / HEVC encoding with hvc1 tag', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      format: 'mp4',
      videoCodec: 'h265',
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-c:v');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx265');
    expect(args).toContain('-tag:v');
    expect(args[args.indexOf('-tag:v') + 1]).toBe('hvc1');
    expect(args).toContain('-x265-params');
    expect(args[args.indexOf('-x265-params') + 1]).toContain('pools=none');
  });

  it.each([2, 4, 8, 16, 24, 32])('uses a bounded H.265 worker pool for %i requested CPU threads', (cpuThreads) => {
    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4', outputFilename: 'output.mp4', isMultiThread: true,
      settings: { ...createDefaultSettings(mockSource1080p), videoCodec: 'h265', cpuThreads },
      source: mockSource1080p,
    });
    const threads = Math.min(cpuThreads, H265_MAX_CPU_THREADS);
    expect(args[args.indexOf('-x265-params') + 1]).toBe(`pools=${threads}:frame-threads=1:wpp=1:lookahead-threads=0`);
    // Decoder and filter pools must not exhaust the preallocated pthreads.
    expect(args[args.indexOf('-filter_threads') + 1]).toBe('1');
    expect(args.indexOf('-threads')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-threads') + 1]).toBe('1');
    expect(args[args.lastIndexOf('-threads') + 1]).toBe(String(threads));
  });

  it('applies Auto threads to H.265 without exhausting the WASM worker pool', () => {
    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4', outputFilename: 'output.mp4', isMultiThread: true,
      settings: { ...createDefaultSettings(mockSource1080p), videoCodec: 'h265', cpuThreads: 0 },
    });
    expect(args[args.indexOf('-x265-params') + 1]).toContain(`pools=${Math.min(H265_MAX_CPU_THREADS, getAutoCpuThreads())}:`);
  });

  it.each([{ multi: false, cpuThreads: 16 }, { multi: true, cpuThreads: 1 }])(
    'keeps H.265 single-threaded when multi=$multi and cpuThreads=$cpuThreads', ({ multi, cpuThreads }) => {
      const args = buildFFmpegArgs({
        inputFilename: 'input.mp4', outputFilename: 'output.mp4', isMultiThread: multi,
        settings: { ...createDefaultSettings(mockSource1080p), videoCodec: 'h265', cpuThreads },
      });
      expect(args[args.indexOf('-x265-params') + 1]).toBe('pools=none:frame-threads=1:wpp=0');
      expect(args[args.indexOf('-threads') + 1]).toBe('1');
    },
  );

  it('generates correct arguments for MOV -> MP4 conversion with fast start', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      format: 'mp4',
      fastStart: true,
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mov',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-i');
    expect(args).toContain('input.mov');
    expect(args).toContain('-movflags');
    expect(args[args.indexOf('-movflags') + 1]).toBe('+faststart');
    expect(args).toContain('output.mp4');
  });

  it('generates correct arguments for MP4 -> WebM VP9 with Opus audio', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      format: 'webm',
      videoCodec: 'vp9',
      audioCodec: 'opus',
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.webm',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-c:v');
    expect(args[args.indexOf('-c:v') + 1]).toBe('libvpx-vp9');
    expect(args).toContain('-c:a');
    expect(args[args.indexOf('-c:a') + 1]).toBe('libopus');
    expect(args).toContain('output.webm');
  });

  it('generates correct arguments for AVI with mp3 audio', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      format: 'avi',
      videoCodec: 'h264',
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.avi',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-c:a');
    expect(args[args.indexOf('-c:a') + 1]).toBe('libmp3lame');
    expect(args).toContain('output.avi');
  });

  it('generates correct arguments when audio is removed (muted)', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      audioAction: 'remove',
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
  });

  it('generates correct arguments for framerate downscaling (60 FPS -> 30 FPS)', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      fps: 30,
    };

    const args = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
    });

    expect(args).toContain('-r');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
  });

  it('generates correct arguments for custom audio bitrate configuration', () => {
    // 128 kbps audio
    const settings128k: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      audioBitrateKbps: 128,
    };
    const args128 = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: settings128k,
      source: mockSource1080p,
    });
    expect(args128).toContain('-b:a');
    expect(args128[args128.indexOf('-b:a') + 1]).toBe('128k');

    // 320 kbps high-fidelity audio
    const settings320k: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      audioBitrateKbps: 320,
    };
    const args320 = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: settings320k,
      source: mockSource1080p,
    });
    expect(args320).toContain('-b:a');
    expect(args320[args320.indexOf('-b:a') + 1]).toBe('320k');
  });

  it('selects veryfast preset for high quality (>= 75) and ultrafast for fast compression to avoid macroblocking', () => {
    // Quality 85: uses veryfast (enables CABAC and deblocking filter)
    const settingsHighQuality: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      qualityValue: 85,
    };
    const argsHigh = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: settingsHighQuality,
      source: mockSource1080p,
    });
    expect(argsHigh).toContain('-preset');
    expect(argsHigh[argsHigh.indexOf('-preset') + 1]).toBe('veryfast');

    // Quality 50: uses ultrafast for speed
    const settingsMedium: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      qualityValue: 50,
    };
    const argsMedium = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: settingsMedium,
      source: mockSource1080p,
    });
    expect(argsMedium).toContain('-preset');
    expect(argsMedium[argsMedium.indexOf('-preset') + 1]).toBe('ultrafast');
  });

  it('manages thread allocation properly for multi-threaded and single-threaded environments', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(mockSource1080p),
      cpuThreads: 0, // Auto
    };

    // Multi-threaded: allocates multiple cores effectively
    const argsMulti = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
      isMultiThread: true,
    });
    expect(argsMulti).toContain('-threads');
    const threadsIdx = argsMulti.indexOf('-threads');
    const threadsNum = parseInt(argsMulti[threadsIdx + 1], 10);
    expect(threadsNum).toBeGreaterThanOrEqual(2);

    // Single-threaded fallback: does not push multi-thread flag (prevents single-thread WASM crash)
    const argsSingle = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings,
      source: mockSource1080p,
      isMultiThread: false,
    });
    expect(argsSingle).not.toContain('-threads');
  });

  it('correctly maps stereo, mono, and 5.1 surround audio channels', () => {
    // 1. Stereo
    const argsStereo = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: { ...createDefaultSettings(mockSource1080p), audioChannels: 'stereo' },
    });
    expect(argsStereo).toContain('-ac');
    expect(argsStereo[argsStereo.indexOf('-ac') + 1]).toBe('2');

    // 2. Mono
    const argsMono = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: { ...createDefaultSettings(mockSource1080p), audioChannels: 'mono' },
    });
    expect(argsMono).toContain('-ac');
    expect(argsMono[argsMono.indexOf('-ac') + 1]).toBe('1');

    // 3. Surround 5.1
    const argsSurround = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: { ...createDefaultSettings(mockSource1080p), audioChannels: 'surround51' },
    });
    expect(argsSurround).toContain('-ac');
    expect(argsSurround[argsSurround.indexOf('-ac') + 1]).toBe('6');

    // 4. Original (passes through without -ac flag)
    const argsOriginal = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: { ...createDefaultSettings(mockSource1080p), audioChannels: 'original' },
    });
    expect(argsOriginal).not.toContain('-ac');
  });

  it('handles metadata preservation and stripping flags correctly (F-18)', () => {
    // When preserveMetadata is false (default): strips metadata (-map_metadata -1)
    const argsStripped = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: { ...createDefaultSettings(mockSource1080p), preserveMetadata: false },
    });
    const stripIdx = argsStripped.indexOf('-map_metadata');
    expect(stripIdx).toBeGreaterThan(-1);
    expect(argsStripped[stripIdx + 1]).toBe('-1');

    // When preserveMetadata is true: preserves metadata (-map_metadata 1)
    const argsPreserved = buildFFmpegArgs({
      inputFilename: 'input.mp4',
      outputFilename: 'output.mp4',
      settings: { ...createDefaultSettings(mockSource1080p), preserveMetadata: true },
    });
    const presIdx = argsPreserved.indexOf('-map_metadata');
    expect(presIdx).toBeGreaterThan(-1);
    expect(argsPreserved[presIdx + 1]).toBe('1');
  });
});
