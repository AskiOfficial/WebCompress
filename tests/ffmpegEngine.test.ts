import { afterEach, describe, expect, it, vi } from 'vitest';
import { FFmpegEngine } from '../src/services/ffmpeg/ffmpegEngine';
import { createDefaultSettings } from '../src/config/presets';
import { VideoMetadata } from '../src/types';

const file = new File([new Uint8Array([0])], 'source.mp4');
const metadata = { duration: 1, width: 640, height: 360, fps: 30 } as VideoMetadata;
const events = { onProgress: vi.fn(), onStage: vi.fn() };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('HEVC CPU engine selection', () => {
  it.each([0, 1, 4, 32])('requires core-mt for H.265 with %i selected threads', async (cpuThreads) => {
    vi.stubGlobal('crossOriginIsolated', true);
    const run = vi.spyOn(FFmpegEngine.prototype, 'run').mockResolvedValue({ buffer: new ArrayBuffer(3), engine: 'ffmpeg-mt' });
    const result = await new FFmpegEngine().process(file, { ...createDefaultSettings(), videoCodec: 'h265', cpuThreads }, metadata, events);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ preferMultiThread: true, requiresMultiThread: true }), events);
    URL.revokeObjectURL(result.outputUrl);
  });

  it('rejects unavailable HEVC before creating any worker', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    const run = vi.spyOn(FFmpegEngine.prototype, 'run');
    await expect(new FFmpegEngine().process(file, { ...createDefaultSettings(), videoCodec: 'h265' }, metadata, events))
      .rejects.toThrow('H.265 CPU encoding requires');
    expect(run).not.toHaveBeenCalled();
  });
});
