import { describe, it, expect } from 'vitest';
import { 
  normalizeFps, 
  parseMp4Boxes, 
  parseEbmlMetadata, 
  parseAviMetadata 
} from '../src/services/media/mediaProbe';
import { formatFps } from '../src/utils/formatters';
import { getTargetFps } from '../src/services/media/bitrateCalc';
import { ConversionSettings, VideoMetadata } from '../src/types';
import { createDefaultSettings } from '../src/config/presets';

describe('mediaProbe framerate detection and formatting', () => {
  describe('normalizeFps', () => {
    it('normalizes standard framerates with tolerance', () => {
      expect(normalizeFps(60.000002)).toBe(60);
      expect(normalizeFps(59.940059)).toBe(59.94);
      expect(normalizeFps(30.000003)).toBe(30);
      expect(normalizeFps(29.970029)).toBe(29.97);
      expect(normalizeFps(24.000001)).toBe(24);
      expect(normalizeFps(23.976024)).toBe(23.976);
      expect(normalizeFps(25.0)).toBe(25);
      expect(normalizeFps(48.001)).toBe(48);
      expect(normalizeFps(50.0)).toBe(50);
      expect(normalizeFps(119.8801)).toBe(119.88);
      expect(normalizeFps(120.0)).toBe(120);
      expect(normalizeFps(144.0)).toBe(144);
      expect(normalizeFps(240.0)).toBe(240);
    });

    it('falls back to 30 for invalid, 0, or negative framerates', () => {
      expect(normalizeFps(0)).toBe(30);
      expect(normalizeFps(-10)).toBe(30);
      expect(normalizeFps(NaN)).toBe(30);
      expect(normalizeFps(Infinity)).toBe(30);
    });

    it('preserves non-standard framerates rounded to integer or 2 decimal places', () => {
      expect(normalizeFps(15.002)).toBe(15);
      expect(normalizeFps(14.5)).toBe(14.5);
    });
  });

  describe('formatFps', () => {
    it('formats integer and fractional framerates nicely', () => {
      expect(formatFps(60)).toBe('60 FPS');
      expect(formatFps(59.94)).toBe('59.94 FPS');
      expect(formatFps(30)).toBe('30 FPS');
      expect(formatFps(29.97)).toBe('29.97 FPS');
      expect(formatFps(24)).toBe('24 FPS');
      expect(formatFps(23.98)).toBe('23.98 FPS');
      expect(formatFps(0)).toBe('Original');
      expect(formatFps(NaN)).toBe('Original');
    });
  });

  describe('getTargetFps with exact source FPS', () => {
    const baseSource: VideoMetadata = {
      name: 'test.mp4',
      size: 10_000_000,
      type: 'video/mp4',
      duration: 10,
      width: 1920,
      height: 1080,
      fps: 60,
      aspectRatio: 16 / 9,
      objectUrl: 'blob:test',
      file: new File([], 'test.mp4'),
    };

    it('preserves exact fractional framerate when fps is original', () => {
      const settingsOriginal: ConversionSettings = {
        ...createDefaultSettings(),
        fps: 'original',
      };

      expect(getTargetFps(settingsOriginal, { ...baseSource, fps: 60 })).toBe(60);
      expect(getTargetFps(settingsOriginal, { ...baseSource, fps: 59.94 })).toBe(59.94);
      expect(getTargetFps(settingsOriginal, { ...baseSource, fps: 29.97 })).toBe(29.97);
      expect(getTargetFps(settingsOriginal, { ...baseSource, fps: 23.976 })).toBe(23.976);
      expect(getTargetFps(settingsOriginal, { ...baseSource, fps: 24 })).toBe(24);
    });
  });

  describe('MP4 container box parsing', () => {
    function createMockMp4Buffer(options: {
      timescale: number;
      sampleDelta: number;
      sampleCount?: number;
      codecFourCC?: string;
      audioFourCC?: string;
      channels?: number;
    }): ArrayBuffer {
      const {
        timescale,
        sampleDelta,
        sampleCount = 100,
        codecFourCC = 'avc1',
        audioFourCC = 'mp4a',
        channels = 2,
      } = options;

      // 1. stts box
      const stts = Buffer.alloc(24);
      stts.writeUInt32BE(24, 0);
      stts.write('stts', 4);
      stts.writeUInt32BE(0, 8); // version & flags
      stts.writeUInt32BE(1, 12); // entry count
      stts.writeUInt32BE(sampleCount, 16);
      stts.writeUInt32BE(sampleDelta, 20);

      // 2. stsd box for video
      const videoEntry = Buffer.alloc(32);
      videoEntry.writeUInt32BE(32, 0);
      videoEntry.write(codecFourCC, 4);

      const stsdVideo = Buffer.concat([
        Buffer.alloc(16),
        videoEntry
      ]);
      stsdVideo.writeUInt32BE(stsdVideo.length, 0);
      stsdVideo.write('stsd', 4);
      stsdVideo.writeUInt32BE(0, 8);
      stsdVideo.writeUInt32BE(1, 12);

      // 3. stbl for video
      const stblVideo = Buffer.concat([
        Buffer.alloc(8),
        stsdVideo,
        stts
      ]);
      stblVideo.writeUInt32BE(stblVideo.length, 0);
      stblVideo.write('stbl', 4);

      // 4. minf for video
      const minfVideo = Buffer.concat([
        Buffer.alloc(8),
        stblVideo
      ]);
      minfVideo.writeUInt32BE(minfVideo.length, 0);
      minfVideo.write('minf', 4);

      // 5. hdlr for video
      const hdlrVideo = Buffer.alloc(32);
      hdlrVideo.writeUInt32BE(32, 0);
      hdlrVideo.write('hdlr', 4);
      hdlrVideo.write('vide', 16);

      // 6. mdhd for video
      const mdhdVideo = Buffer.alloc(32);
      mdhdVideo.writeUInt32BE(32, 0);
      mdhdVideo.write('mdhd', 4);
      mdhdVideo.writeUInt32BE(0, 8); // version 0
      mdhdVideo.writeUInt32BE(timescale, 20); // timescale
      mdhdVideo.writeUInt32BE(sampleCount * sampleDelta, 24); // duration

      // 7. mdia for video
      const mdiaVideo = Buffer.concat([
        Buffer.alloc(8),
        mdhdVideo,
        hdlrVideo,
        minfVideo
      ]);
      mdiaVideo.writeUInt32BE(mdiaVideo.length, 0);
      mdiaVideo.write('mdia', 4);

      // 8. trak for video
      const trakVideo = Buffer.concat([
        Buffer.alloc(8),
        mdiaVideo
      ]);
      trakVideo.writeUInt32BE(trakVideo.length, 0);
      trakVideo.write('trak', 4);

      // 9. Audio track (trak)
      const audioEntry = Buffer.alloc(36);
      audioEntry.writeUInt32BE(36, 0);
      audioEntry.write(audioFourCC, 4);
      audioEntry.writeUInt16BE(channels, 24); // channels

      const stsdAudio = Buffer.concat([
        Buffer.alloc(16),
        audioEntry
      ]);
      stsdAudio.writeUInt32BE(stsdAudio.length, 0);
      stsdAudio.write('stsd', 4);
      stsdAudio.writeUInt32BE(0, 8);
      stsdAudio.writeUInt32BE(1, 12);

      const stblAudio = Buffer.concat([Buffer.alloc(8), stsdAudio]);
      stblAudio.writeUInt32BE(stblAudio.length, 0);
      stblAudio.write('stbl', 4);

      const minfAudio = Buffer.concat([Buffer.alloc(8), stblAudio]);
      minfAudio.writeUInt32BE(minfAudio.length, 0);
      minfAudio.write('minf', 4);

      const hdlrAudio = Buffer.alloc(32);
      hdlrAudio.writeUInt32BE(32, 0);
      hdlrAudio.write('hdlr', 4);
      hdlrAudio.write('soun', 16);

      const mdhdAudio = Buffer.alloc(32);
      mdhdAudio.writeUInt32BE(32, 0);
      mdhdAudio.write('mdhd', 4);
      mdhdAudio.writeUInt32BE(0, 8);
      mdhdAudio.writeUInt32BE(48000, 20); // audio timescale 48000 Hz

      const mdiaAudio = Buffer.concat([Buffer.alloc(8), mdhdAudio, hdlrAudio, minfAudio]);
      mdiaAudio.writeUInt32BE(mdiaAudio.length, 0);
      mdiaAudio.write('mdia', 4);

      const trakAudio = Buffer.concat([Buffer.alloc(8), mdiaAudio]);
      trakAudio.writeUInt32BE(trakAudio.length, 0);
      trakAudio.write('trak', 4);

      // 10. moov
      const moov = Buffer.concat([
        Buffer.alloc(8),
        trakVideo,
        trakAudio
      ]);
      moov.writeUInt32BE(moov.length, 0);
      moov.write('moov', 4);

      return moov.buffer.slice(moov.byteOffset, moov.byteOffset + moov.byteLength);
    }

    it('correctly detects 60 FPS in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 60000, sampleDelta: 1000 });
      const res = parseMp4Boxes(buf);
      expect(res.fps).toBe(60);
      expect(res.videoCodec).toBe('H.264');
      expect(res.audioCodec).toBe('AAC');
      expect(res.audioChannels).toBe(2);
    });

    it('correctly detects 59.94 FPS (NTSC 60) in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 60000, sampleDelta: 1001 });
      const res = parseMp4Boxes(buf);
      expect(res.fps).toBe(59.94);
    });

    it('correctly detects 24 FPS (Cinema) in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 24, sampleDelta: 1 });
      const res = parseMp4Boxes(buf);
      expect(res.fps).toBe(24);
    });

    it('correctly detects 23.976 FPS (NTSC 24) in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 24000, sampleDelta: 1001 });
      const res = parseMp4Boxes(buf);
      expect(res.fps).toBe(23.976);
    });

    it('correctly detects 29.97 FPS (NTSC 30) in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 30000, sampleDelta: 1001 });
      const res = parseMp4Boxes(buf);
      expect(res.fps).toBe(29.97);
    });

    it('correctly detects 30 FPS in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 30000, sampleDelta: 1000 });
      const res = parseMp4Boxes(buf);
      expect(res.fps).toBe(30);
    });

    it('correctly identifies H.265 / HEVC codec in MP4 container', () => {
      const buf = createMockMp4Buffer({ timescale: 60, sampleDelta: 1, codecFourCC: 'hvc1' });
      const res = parseMp4Boxes(buf);
      expect(res.videoCodec).toBe('H.265 / HEVC');
      expect(res.fps).toBe(60);
    });
  });

  describe('WebM EBML container parsing', () => {
    function createMockWebmBuffer(defaultDurationNs: number, codecId = 'V_VP9'): ArrayBuffer {
      // TrackType: 0x83, len 1, val 1
      const trackType = Buffer.from([0x83, 0x81, 0x01]);

      // CodecID: 0x86
      const codecBuffer = Buffer.from(codecId, 'ascii');
      const codecElem = Buffer.concat([
        Buffer.from([0x86, 0x80 | codecBuffer.length]),
        codecBuffer
      ]);

      // DefaultDuration: 0x23, 0xE3, 0x83, len 4 (0x84), 4 bytes uint
      const defDur = Buffer.alloc(3 + 1 + 4);
      defDur[0] = 0x23; defDur[1] = 0xe3; defDur[2] = 0x83;
      defDur[3] = 0x84; // 4 bytes
      defDur.writeUInt32BE(defaultDurationNs, 4);

      // TrackEntry: 0xAE
      const trackEntryContent = Buffer.concat([trackType, codecElem, defDur]);
      const trackEntryLen = Buffer.from([0x80 | trackEntryContent.length]);
      const trackEntry = Buffer.concat([Buffer.from([0xAE]), trackEntryLen, trackEntryContent]);

      // Tracks: 0x16, 0x54, 0xAE, 0x6B
      const tracksHeader = Buffer.from([0x16, 0x54, 0xAE, 0x6B, 0x80 | trackEntry.length]);
      const full = Buffer.concat([tracksHeader, trackEntry]);

      return full.buffer.slice(full.byteOffset, full.byteOffset + full.byteLength);
    }

    it('detects 60 FPS in WebM from DefaultDuration', () => {
      const buf = createMockWebmBuffer(16666666, 'V_VP9');
      const res = parseEbmlMetadata(buf);
      expect(res.fps).toBe(60);
      expect(res.videoCodec).toBe('VP9');
    });

    it('detects 59.94 FPS in WebM from DefaultDuration', () => {
      const buf = createMockWebmBuffer(16683333, 'V_VP9');
      const res = parseEbmlMetadata(buf);
      expect(res.fps).toBe(59.94);
    });

    it('detects 24 FPS in WebM from DefaultDuration', () => {
      const buf = createMockWebmBuffer(41666666, 'V_VP9');
      const res = parseEbmlMetadata(buf);
      expect(res.fps).toBe(24);
    });

    it('detects 30 FPS in WebM from DefaultDuration', () => {
      const buf = createMockWebmBuffer(33333333, 'V_VP9');
      const res = parseEbmlMetadata(buf);
      expect(res.fps).toBe(30);
    });

    it('detects 25 FPS in WebM from DefaultDuration', () => {
      const buf = createMockWebmBuffer(40000000, 'V_VP9');
      const res = parseEbmlMetadata(buf);
      expect(res.fps).toBe(25);
    });
  });

  describe('AVI RIFF container parsing', () => {
    function createMockAviBuffer(microSecPerFrame: number): ArrayBuffer {
      const buf = Buffer.alloc(100);
      buf.write('RIFF', 0);
      buf.writeUInt32LE(92, 4);
      buf.write('AVI ', 8);
      buf.write('LIST', 12);
      buf.writeUInt32LE(76, 16);
      buf.write('hdrl', 20);
      buf.write('avih', 24);
      buf.writeUInt32LE(56, 28);
      buf.writeUInt32LE(microSecPerFrame, 32);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    it('detects 60 FPS in AVI', () => {
      const buf = createMockAviBuffer(16666);
      const res = parseAviMetadata(buf);
      expect(res.fps).toBe(60);
    });

    it('detects 30 FPS in AVI', () => {
      const buf = createMockAviBuffer(33333);
      const res = parseAviMetadata(buf);
      expect(res.fps).toBe(30);
    });
  });
});
