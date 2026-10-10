import { describe, expect, it } from 'vitest';
import {
  calculateRemainingSeconds,
  formatAudioChannels,
  formatBitrate,
  formatBytes,
  formatDuration,
  formatFps,
  formatResolution,
} from '../src/utils/formatters';
import { ProcessingProgress } from '../src/types';

describe('formatters', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 5.5)).toBe('5.5 MB');
  });

  it('formats duration correctly', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(45)).toBe('00:45');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3665)).toBe('01:01:05');
  });

  it('formats fps correctly', () => {
    expect(formatFps(0)).toBe('Original');
    expect(formatFps(30)).toBe('30 FPS');
    expect(formatFps(29.97)).toBe('29.97 FPS');
  });

  it('formats resolution correctly', () => {
    expect(formatResolution(0, 0)).toBe('Original');
    expect(formatResolution(1920, 1080)).toBe('1920 × 1080');
  });

  it('formats bitrate correctly', () => {
    expect(formatBitrate(0)).toBe('Auto');
    expect(formatBitrate(500_000)).toBe('500 kbps');
    expect(formatBitrate(2_500_000)).toBe('2.5 Mbps');
  });

  it('formats audio channels correctly', () => {
    expect(formatAudioChannels(0)).toBe('');
    expect(formatAudioChannels(1)).toBe('Mono');
    expect(formatAudioChannels(2)).toBe('Stereo');
    expect(formatAudioChannels(6)).toBe('5.1');
  });
});

describe('calculateRemainingSeconds', () => {
  it('returns undefined for null or undefined progress', () => {
    expect(calculateRemainingSeconds(null)).toBeUndefined();
    expect(calculateRemainingSeconds(undefined)).toBeUndefined();
  });

  it('returns undefined during initializing, probing, or idle stages', () => {
    expect(calculateRemainingSeconds({ stage: 'initializing', elapsedMs: 1000, percent: 10 })).toBeUndefined();
    expect(calculateRemainingSeconds({ stage: 'probing', elapsedMs: 1000, percent: 10 })).toBeUndefined();
    expect(calculateRemainingSeconds({ stage: 'idle', elapsedMs: 1000, percent: 10 })).toBeUndefined();
  });

  it('returns undefined when elapsedMs is less than 500ms', () => {
    expect(calculateRemainingSeconds({ stage: 'encoding', elapsedMs: 300, percent: 20 })).toBeUndefined();
  });

  it('returns undefined when percent and processedSeconds are zero', () => {
    expect(calculateRemainingSeconds({ stage: 'encoding', elapsedMs: 2000, percent: 0, processedSeconds: 0 })).toBeUndefined();
  });

  it('returns 0 when stage is completed', () => {
    expect(calculateRemainingSeconds({ stage: 'completed', elapsedMs: 5000, percent: 100 })).toBe(0);
  });

  it('returns 0 when percent is 100 or greater', () => {
    expect(calculateRemainingSeconds({ stage: 'encoding', elapsedMs: 5000, percent: 100 })).toBe(0);
    expect(calculateRemainingSeconds({ stage: 'encoding', elapsedMs: 5000, percent: 101 })).toBe(0);
  });

  it('returns 0 when processedSeconds is greater than or equal to totalSeconds', () => {
    expect(calculateRemainingSeconds({
      stage: 'encoding',
      elapsedMs: 5000,
      percent: 99,
      processedSeconds: 10,
      totalSeconds: 10,
    })).toBe(0);
  });

  it('respects explicitly provided estimatedRemainingMs including 0', () => {
    expect(calculateRemainingSeconds({
      stage: 'encoding',
      elapsedMs: 5000,
      percent: 50,
      estimatedRemainingMs: 15000,
    })).toBe(15);

    expect(calculateRemainingSeconds({
      stage: 'encoding',
      elapsedMs: 5000,
      percent: 100,
      estimatedRemainingMs: 0,
    })).toBe(0);
  });

  it('calculates remaining seconds based on processedSeconds and total duration', () => {
    // 2.5 seconds of a 10s video processed in 1.0s elapsed (speed = 2.5x)
    // Remaining video = 7.5s -> 7.5 / 2.5 = 3.0s remaining
    const progress: Partial<ProcessingProgress> = {
      stage: 'encoding',
      elapsedMs: 1000,
      percent: 25,
      processedSeconds: 2.5,
      totalSeconds: 10,
    };
    expect(calculateRemainingSeconds(progress)).toBeCloseTo(3, 1);
  });

  it('uses totalDurationSeconds parameter if progress.totalSeconds is missing', () => {
    const progress: Partial<ProcessingProgress> = {
      stage: 'encoding',
      elapsedMs: 2000,
      percent: 20,
      processedSeconds: 4,
    };
    // 4s of 20s processed in 2s elapsed -> rate = 2s/s -> remaining 16s / 2 = 8s
    expect(calculateRemainingSeconds(progress, 20)).toBeCloseTo(8, 1);
  });

  it('calculates remaining seconds based on percent when processedSeconds is not provided', () => {
    // 25% completed in 1000ms -> remaining 75% will take 3000ms = 3.0s
    const progress: Partial<ProcessingProgress> = {
      stage: 'encoding',
      elapsedMs: 1000,
      percent: 25,
    };
    expect(calculateRemainingSeconds(progress)).toBeCloseTo(3, 1);
  });

  it('calculates remaining seconds for 50% progress', () => {
    const progress: Partial<ProcessingProgress> = {
      stage: 'encoding',
      elapsedMs: 4000,
      percent: 50,
    };
    expect(calculateRemainingSeconds(progress)).toBeCloseTo(4, 1);
  });
});
