import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPresetToSettings, createDefaultSettings } from '../src/config/presets';
import type { VideoMetadata } from '../src/types';
import { calculateBitratesAndEstimates } from '../src/services/media/bitrateCalc';

const encoder = vi.hoisted(() => vi.fn());
vi.mock('../src/services/webcodecs/encoderConfig', () => ({ resolveEncoderConfig: encoder }));
import { checkHardwareEncodingSupport, encodingConfigurationLabel } from '../src/services/webcodecs/hardwareSupport';
const source = { width: 1920, height: 1440, fps: 60, duration: 30, size: 85 * 1024 * 1024 } as VideoMetadata;
const settings = { ...applyPresetToSettings(createDefaultSettings(), 'small', source), processingMode: 'hardware' as const };
beforeEach(() => encoder.mockReset());

describe('hardware support for the selected settings', () => {
  it('checks 1920x1440 at 60 FPS and its actual bitrate, not a generic 720p probe', async () => {
    encoder.mockResolvedValue({});
    await expect(checkHardwareEncodingSupport(settings, source)).resolves.toEqual({ supported: true });
    expect(encoder).toHaveBeenCalledExactlyOnceWith('h264', 1920, 1440, 60,
      calculateBitratesAndEstimates(settings, source).videoBitrateBps, true);
  });

  it('suggests checked 1440x1080 at the same 60 FPS when Chrome rejects 1440p', async () => {
    encoder.mockImplementation(async (_codec, _width, height) => height <= 1080 ? {} : null);
    await expect(checkHardwareEncodingSupport(settings, source)).resolves.toEqual({ supported: false,
      suggestion: { resolution: '1080p', width: 1440, height: 1080 } });
    expect(encoder.mock.calls.map((call) => call.slice(1, 4))).toEqual([[1920, 1440, 60], [1440, 1080, 60]]);
    expect(settings.resolution).toBe('original');
    expect(settings.fps).toBe('original');
  });

  it('does not recommend a resolution that the encoder also rejects', async () => {
    encoder.mockResolvedValue(null);
    await expect(checkHardwareEncodingSupport(settings, source)).resolves.toEqual({ supported: false });
    expect(encoder).toHaveBeenCalledTimes(3);
  });

  it('never suggests upscaling a small source to gain hardware support', async () => {
    encoder.mockResolvedValue(null);
    await expect(checkHardwareEncodingSupport(settings, { ...source, width: 640, height: 480 })).resolves.toEqual({ supported: false });
    expect(encoder).toHaveBeenCalledTimes(1);
  });

  it('rejects incompatible containers without probing the encoder', async () => {
    await expect(checkHardwareEncodingSupport({ ...settings, format: 'webm' }, source)).resolves.toEqual({ supported: false });
    expect(encoder).not.toHaveBeenCalled();
  });

  it('identifies the failed exact configuration in the error message', () => {
    expect(encodingConfigurationLabel(settings, source)).toBe('H.264 1920×1440 at 60 FPS');
  });
});
