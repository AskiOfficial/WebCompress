import { describe, it, expect } from 'vitest';
import { getCodecCandidateStrings } from '../src/services/webcodecs/codecString';

describe('WebCodecs codec string resolution', () => {
  describe('H.265 / HEVC', () => {
    it('selects Level 3.1 for 720p @ 30fps', () => {
      const candidates = getCodecCandidateStrings('h265', 1280, 720, 30);
      expect(candidates[0]).toBe('hvc1.1.6.L93.B0');
    });

    it('selects Level 4.0 for 1080p @ 30fps', () => {
      const candidates = getCodecCandidateStrings('h265', 1920, 1080, 30);
      expect(candidates[0]).toBe('hvc1.1.6.L120.B0');
      expect(candidates).toContain('hvc1.1.6.L123.B0');
      // Should not put Level 3.1 as a candidate because 1080p exceeds Level 3.1
      expect(candidates).not.toContain('hvc1.1.6.L93.B0');
    });

    it('selects Level 4.1 for 1080p @ 60fps', () => {
      const candidates = getCodecCandidateStrings('h265', 1920, 1080, 60);
      expect(candidates[0]).toBe('hvc1.1.6.L123.B0');
      expect(candidates).not.toContain('hvc1.1.6.L93.B0');
      expect(candidates).not.toContain('hvc1.1.6.L120.B0');
    });

    it('selects Level 5.0 for 4K @ 30fps', () => {
      const candidates = getCodecCandidateStrings('h265', 3840, 2160, 30);
      expect(candidates[0]).toBe('hvc1.1.6.L150.B0');
    });

    it('selects Level 5.1 for 4K @ 60fps', () => {
      const candidates = getCodecCandidateStrings('h265', 3840, 2160, 60);
      expect(candidates[0]).toBe('hvc1.1.6.L153.B0');
    });
  });

  describe('H.264 / AVC', () => {
    it('selects Level 3.1 for 720p', () => {
      const candidates = getCodecCandidateStrings('h264', 1280, 720, 30);
      expect(candidates[0]).toBe('avc1.42E01F');
    });

    it('selects Level 4.0 for 1080p @ 30fps', () => {
      const candidates = getCodecCandidateStrings('h264', 1920, 1080, 30);
      expect(candidates[0]).toBe('avc1.42E028');
    });

    it('selects Level 4.2 for 1080p @ 60fps', () => {
      const candidates = getCodecCandidateStrings('h264', 1920, 1080, 60);
      expect(candidates[0]).toBe('avc1.42E02A');
    });

    it('selects Level 5.1 for 4K', () => {
      const candidates = getCodecCandidateStrings('h264', 3840, 2160, 30);
      expect(candidates[0]).toBe('avc1.42E033');
    });
  });

  describe('VP9', () => {
    it('selects Level 3.1 for 720p', () => {
      const candidates = getCodecCandidateStrings('vp9', 1280, 720, 30);
      expect(candidates[0]).toBe('vp09.00.31.08');
    });

    it('selects Level 4.0 for 1080p @ 30fps', () => {
      const candidates = getCodecCandidateStrings('vp9', 1920, 1080, 30);
      expect(candidates[0]).toBe('vp09.00.40.08');
    });

    it('selects Level 5.0 for 4K @ 30fps', () => {
      const candidates = getCodecCandidateStrings('vp9', 3840, 2160, 30);
      expect(candidates[0]).toBe('vp09.00.50.08');
    });
  });

  describe('AV1', () => {
    it('selects Level 3.0 for 720p', () => {
      const candidates = getCodecCandidateStrings('av1', 1280, 720, 30);
      expect(candidates[0]).toBe('av01.0.04M.08');
    });

    it('selects Level 4.0 for 1080p', () => {
      const candidates = getCodecCandidateStrings('av1', 1920, 1080, 30);
      expect(candidates[0]).toBe('av01.0.08M.08');
    });

    it('selects Level 5.0 for 4K', () => {
      const candidates = getCodecCandidateStrings('av1', 3840, 2160, 30);
      expect(candidates[0]).toBe('av01.0.12M.08');
    });
  });
});
