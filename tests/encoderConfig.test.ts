import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEncoderConfig } from '../src/services/webcodecs/encoderConfig';
import { WebCodecsEngine } from '../src/services/webcodecs/webcodecsEngine';
import { createDefaultSettings } from '../src/config/presets';

afterEach(() => vi.unstubAllGlobals());

describe('browser encoder configurations', () => {
  it('returns the exact tested HEVC MP4 configuration and preserves fractional FPS', async () => {
    const isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
    vi.stubGlobal('VideoEncoder', { isConfigSupported });
    const config = await resolveEncoderConfig('h265', 1920, 1080, 29.97, 2_000_000, true);
    expect(config).toEqual(isConfigSupported.mock.calls[0][0]);
    expect(config).toMatchObject({ hevc: { format: 'hevc' }, framerate: 29.97, latencyMode: 'realtime', hardwareAcceleration: 'prefer-hardware' });
  });

  it('Hardware never accepts a configuration available only without hardware preference', async () => {
    const isConfigSupported = vi.fn(async (config) => ({ supported: config.hardwareAcceleration === 'no-preference' }));
    vi.stubGlobal('VideoEncoder', { isConfigSupported });
    expect(await resolveEncoderConfig('h265', 1280, 720, 30, 1_000_000, true)).toBeNull();
    expect(isConfigSupported.mock.calls.every(([config]) => config.hardwareAcceleration === 'prefer-hardware')).toBe(true);
  });

  it('Auto preserves no-preference when that is the supported configuration', async () => {
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async (config: VideoEncoderConfig) => ({ supported: config.hardwareAcceleration === 'no-preference' }) });
    expect(await resolveEncoderConfig('h265', 1280, 720, 30, 1_000_000, false)).toMatchObject({ hardwareAcceleration: 'no-preference' });
  });

  it('HEVC with audio and MKV does not require browser audio encoding', async () => {
    vi.stubGlobal('VideoEncoder', { isConfigSupported: async () => ({ supported: true }) });
    vi.stubGlobal('VideoFrame', class {});
    vi.stubGlobal('AudioEncoder', undefined);
    expect(await new WebCodecsEngine().isSupported({ ...createDefaultSettings(), videoCodec: 'h265', format: 'mkv' })).toBe(true);
  });
});
