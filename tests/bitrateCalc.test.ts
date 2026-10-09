import { describe, it, expect } from 'vitest';
import { 
  calculateBitratesAndEstimates, 
  getTargetDimensions, 
  getTargetFps, 
  qualityToCrf 
} from '../src/services/media/bitrateCalc';
import { ConversionSettings, VideoMetadata } from '../src/types';
import { createDefaultSettings } from '../src/config/presets';

describe('bitrateCalc utility', () => {
  const mockSource1080p: VideoMetadata = {
    name: 'sample.mp4',
    size: 100 * 1024 * 1024, // 100 MB
    type: 'video/mp4',
    duration: 60, // 60 seconds
    width: 1920,
    height: 1080,
    fps: 60,
    aspectRatio: 16 / 9,
    objectUrl: 'blob:test',
    file: new File([], 'sample.mp4'),
  };

  it('correctly maps visual quality (0-100) to CRF values for H.264, H.265, VP9, and AV1', () => {
    expect(qualityToCrf(100, 'h264')).toBe(10); // visually near-lossless
    expect(qualityToCrf(0, 'h264')).toBe(38);   // aggressive compression
    expect(qualityToCrf(50, 'h264')).toBe(24);

    expect(qualityToCrf(100, 'h265')).toBe(12);
    expect(qualityToCrf(0, 'h265')).toBe(40);
    expect(qualityToCrf(50, 'h265')).toBe(26);

    expect(qualityToCrf(100, 'vp9')).toBe(15);
    expect(qualityToCrf(0, 'vp9')).toBe(50);

    expect(qualityToCrf(100, 'av1')).toBe(16);
    expect(qualityToCrf(0, 'av1')).toBe(52);
  });

  it('enforces even dimensions required by video codecs even for odd source inputs', () => {
    // Test odd dimensions source video (e.g. cropped or mobile capture 1919x1079)
    const oddSource: VideoMetadata = {
      ...mockSource1080p,
      width: 1919,
      height: 1079,
      aspectRatio: 1919 / 1079,
    };

    // 1. Original resolution on odd input must round to even dimensions
    const origSettings: ConversionSettings = {
      ...createDefaultSettings(),
      resolution: 'original',
    };
    const origDims = getTargetDimensions(origSettings, oddSource);
    expect(origDims.width % 2).toBe(0);
    expect(origDims.height % 2).toBe(0);

    // 2. Custom odd resolution inputs
    const customSettings: ConversionSettings = {
      ...createDefaultSettings(),
      resolution: 'custom',
      customWidth: 853,
      customHeight: 479,
    };
    const customDims = getTargetDimensions(customSettings, oddSource);
    expect(customDims.width % 2).toBe(0);
    expect(customDims.height % 2).toBe(0);

    // 3. Preset resolutions (e.g. 720p, 480p)
    const res720p = getTargetDimensions({ ...createDefaultSettings(), resolution: '720p' }, mockSource1080p);
    expect(res720p.width % 2).toBe(0);
    expect(res720p.height % 2).toBe(0);
    expect(res720p.height).toBe(720);
    expect(res720p.width).toBe(1280);

    const res480p = getTargetDimensions({ ...createDefaultSettings(), resolution: '480p' }, mockSource1080p);
    expect(res480p.width % 2).toBe(0);
    expect(res480p.height % 2).toBe(0);
  });

  it('calculates target size bitrates correctly for a 60s video and 25MB target', () => {
    const settings: ConversionSettings = {
      ...createDefaultSettings(),
      qualityMode: 'target_size',
      targetSizeMb: 25,
      audioBitrateKbps: 128,
    };

    const res = calculateBitratesAndEstimates(settings, mockSource1080p);
    // 25MB * 8 = 200Mb. 200Mb / 60s ~ 3.33 Mbps total.
    expect(res.totalBitrateBps).toBeGreaterThan(3_000_000);
    expect(res.totalBitrateBps).toBeLessThan(3_600_000);
    expect(res.audioBitrateBps).toBe(128_000);
    expect(res.videoBitrateBps).toBeGreaterThan(2_800_000);
    expect(res.isTooLow).toBe(false);
  });

  it('warns when target size is unrealistically small', () => {
    const longVideo: VideoMetadata = {
      ...mockSource1080p,
      duration: 3600, // 1 hour
    };

    const settings: ConversionSettings = {
      ...createDefaultSettings(),
      qualityMode: 'target_size',
      targetSizeMb: 5, // 5 MB for 1 hour!
    };

    const res = calculateBitratesAndEstimates(settings, longVideo);
    expect(res.isTooLow).toBe(true);
    expect(res.warningMessage).toBeDefined();
    expect(res.warningMessage).toContain('extremely low video bitrate');
  });

  it('preserves source FPS by default and handles explicit framerate targets', () => {
    const settingsOriginal: ConversionSettings = {
      ...createDefaultSettings(),
      fps: 'original',
    };

    // 1. Source 60 FPS remains 60 FPS
    expect(getTargetFps(settingsOriginal, mockSource1080p)).toBe(60);

    // 2. Source 24 FPS cinema remains 24 FPS (never automatically boosted to 30 or 60)
    const source24Fps = { ...mockSource1080p, fps: 24 };
    expect(getTargetFps(settingsOriginal, source24Fps)).toBe(24);

    // 3. Source 30 FPS remains 30 FPS
    const source30Fps = { ...mockSource1080p, fps: 30 };
    expect(getTargetFps(settingsOriginal, source30Fps)).toBe(30);

    // 4. Explicit user downscale to 30 FPS on 60 FPS source
    const settings30Fps: ConversionSettings = {
      ...createDefaultSettings(),
      fps: 30,
    };
    expect(getTargetFps(settings30Fps, mockSource1080p)).toBe(30);

    // 5. Custom FPS
    const settingsCustomFps: ConversionSettings = {
      ...createDefaultSettings(),
      fps: 'custom',
      customFps: 15,
    };
    expect(getTargetFps(settingsCustomFps, mockSource1080p)).toBe(15);
  });
});
