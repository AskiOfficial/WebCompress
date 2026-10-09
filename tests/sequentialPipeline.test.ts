import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSequentialPipeline, PIPELINE_LIMITS } from '../src/services/webcodecs/sequentialPipeline';
import type { VideoPipelineRequest } from '../src/services/webcodecs/workerTypes';

const fixture = vi.hoisted(() => ({ timestamps: [] as number[], disposed: false }));
vi.mock('mediabunny', () => ({
  MP4: {}, QTFF: {}, WEBM: {}, MATROSKA: {}, BlobSource: class {},
  Input: class {
    async getPrimaryVideoTrack() { return {
      getDecoderConfig: async () => ({ codec: 'avc1.640028' }), getRotation: async () => 0, getFlip: async () => false,
    }; }
    dispose() { fixture.disposed = true; }
  },
  EncodedPacketSink: class {
    packet(index: number) {
      return index < fixture.timestamps.length ? { index, toEncodedVideoChunk: () => ({ timestamp: fixture.timestamps[index] }) } : null;
    }
    async getFirstPacket() { return this.packet(0); }
    async getNextPacket(packet: { index: number }) { return this.packet(packet.index + 1); }
  },
}));
vi.mock('mp4-muxer', () => ({
  ArrayBufferTarget: class { buffer = new ArrayBuffer(1); },
  Muxer: class { addVideoChunk() {} finalize() {} },
}));

const frames: FakeFrame[] = [];
const encoded: { timestamp: number; sourceTimestamp: number; duration: number }[] = [];
let abortOnEncode: (() => void) | undefined;
let encoderFailure = false;
class FakeFrame {
  displayWidth = 2560;
  displayHeight = 1440;
  closed = false;
  timestamp: number;
  duration: number;
  sourceTimestamp: number;
  constructor(source: FakeFrame | number, init?: VideoFrameInit) {
    this.timestamp = init?.timestamp ?? Number(source);
    this.duration = init?.duration ?? 16667;
    this.sourceTimestamp = source instanceof FakeFrame ? source.sourceTimestamp : Number(source);
    frames.push(this);
  }
  close() { if (this.closed) throw new Error('Frame closed twice'); this.closed = true; }
}
class FakeDecoder extends EventTarget {
  static async isConfigSupported() { return { supported: true }; }
  state = 'configured';
  decodeQueueSize = 0;
  pending = new Set<Promise<void>>();
  constructor(private callbacks: VideoDecoderInit) { super(); }
  configure() {}
  decode(chunk: EncodedVideoChunk) {
    this.decodeQueueSize++;
    const pending = new Promise<void>((resolve) => setTimeout(() => {
      this.decodeQueueSize--;
      if (this.state !== 'closed') this.callbacks.output(new FakeFrame(chunk.timestamp) as unknown as VideoFrame);
      this.dispatchEvent(new Event('dequeue')); resolve(); this.pending.delete(pending);
    }, 1));
    this.pending.add(pending);
  }
  async flush() { await Promise.all(this.pending); }
  close() { this.state = 'closed'; }
}
class FakeEncoder extends EventTarget {
  state = 'configured';
  encodeQueueSize = 0;
  pending = new Set<Promise<void>>();
  constructor(private callbacks: VideoEncoderInit) { super(); }
  configure() {}
  encode(frame: FakeFrame) {
    encoded.push({ timestamp: frame.timestamp, sourceTimestamp: frame.sourceTimestamp, duration: frame.duration });
    this.encodeQueueSize++;
    // Browser dequeue can occur well before the native encoder returns a chunk.
    setTimeout(() => { this.encodeQueueSize--; this.dispatchEvent(new Event('dequeue')); }, 0);
    const pending = new Promise<void>((resolve) => setTimeout(() => {
      if (this.state !== 'closed') {
        if (encoderFailure) this.callbacks.error(new DOMException('Encoder failed', 'EncodingError'));
        else this.callbacks.output({ timestamp: frame.timestamp } as EncodedVideoChunk,
          { decoderConfig: { codec: 'hvc1', description: new ArrayBuffer(1) } });
      }
      this.dispatchEvent(new Event('dequeue')); resolve(); this.pending.delete(pending);
    }, 8));
    this.pending.add(pending); abortOnEncode?.();
  }
  async flush() { await Promise.all(this.pending); }
  close() { this.state = 'closed'; }
}
const request = (fps: number, duration = 1): VideoPipelineRequest => ({ file: {} as File,
  config: { codec: 'hvc1', width: 2560, height: 1440 }, codec: 'h265', fps, duration });
beforeEach(() => {
  fixture.disposed = false; frames.length = 0; encoded.length = 0; encoderFailure = false; abortOnEncode = undefined;
  vi.stubGlobal('VideoFrame', FakeFrame); vi.stubGlobal('VideoDecoder', FakeDecoder); vi.stubGlobal('VideoEncoder', FakeEncoder);
  vi.stubGlobal('OffscreenCanvas', class { constructor() { throw new Error('Canvas must not be used for unchanged dimensions'); } });
});
afterEach(() => vi.unstubAllGlobals());

describe('sequential export user-visible behavior', () => {
  it('exports exactly 60 FPS, closes all frames and bounds queues with a slower encoder', async () => {
    fixture.timestamps = Array.from({ length: 60 }, (_, i) => Math.round(i / 60 * 1e6));
    const { stats } = await runSequentialPipeline(request(60), new AbortController().signal, () => {});
    expect(encoded.map((frame) => frame.timestamp)).toEqual(fixture.timestamps);
    expect(encoded.reduce((sum, frame) => sum + frame.duration, 0)).toBe(1e6);
    expect(stats.encodedFrames).toBe(60);
    expect(stats.encodeQueueMax).toBeLessThanOrEqual(PIPELINE_LIMITS.encodeQueue);
    expect(stats.encoderInFlightMax).toBeLessThanOrEqual(PIPELINE_LIMITS.encoderInFlight);
    expect(stats.decodeQueueMax).toBeLessThanOrEqual(PIPELINE_LIMITS.decodeQueue);
    expect(stats.decoderInFlightMax).toBeLessThanOrEqual(PIPELINE_LIMITS.decoderInFlight);
    expect(stats.seeks).toBe(0);
    expect(stats.flushes).toBe(2);
    expect(stats.canvasFrames).toBe(0);
    expect(stats.timings.encoderWait).toBeGreaterThan(0);
    expect(stats.framesClosed).toBe(stats.framesCreated);
    expect(frames.every((frame) => frame.closed)).toBe(true);
    expect(fixture.disposed).toBe(true);
  });

  it('drops output frames for 60 -> 30 FPS without seeking or decoding twice', async () => {
    fixture.timestamps = Array.from({ length: 60 }, (_, i) => Math.round(i / 60 * 1e6));
    const { stats } = await runSequentialPipeline(request(30), new AbortController().signal, () => {});
    expect(encoded.map((frame) => frame.sourceTimestamp)).toEqual(fixture.timestamps.filter((_, i) => i % 2 === 0));
    expect(stats.decodedFrames).toBe(60);
    expect(stats.encodedFrames).toBe(30);
  });

  it('holds frames for explicitly requested higher FPS and keeps the presentation offset', async () => {
    fixture.timestamps = [-33333, 0, 33333, 66667];
    await runSequentialPipeline(request(60, 0.1), new AbortController().signal, () => {});
    expect(encoded.map((frame) => frame.sourceTimestamp)).toEqual([0, 0, 33333, 33333, 66667, 66667]);
    expect(encoded.map((frame) => frame.timestamp)).toEqual([0, 16667, 33333, 50000, 66667, 83333]);
  });

  it('keeps fractional CFR on the final frame instead of truncating its duration', async () => {
    fixture.timestamps = Array.from({ length: 45 }, (_, i) => Math.round(i / 29.97 * 1e6));
    await runSequentialPipeline(request(29.97, 1.5), new AbortController().signal, () => {});
    expect(encoded).toHaveLength(45);
    expect(encoded.reduce((sum, frame) => sum + frame.duration, 0)).toBe(Math.round(45 / 29.97 * 1e6));
  });

  it('aborts while the encoder is busy and releases held/queued frames', async () => {
    const controller = new AbortController();
    fixture.timestamps = Array.from({ length: 60 }, (_, i) => Math.round(i / 60 * 1e6));
    abortOnEncode = () => controller.abort();
    await expect(runSequentialPipeline(request(60), controller.signal, () => {})).rejects.toMatchObject({ name: 'AbortError' });
    expect(frames.every((frame) => frame.closed)).toBe(true);
    expect(fixture.disposed).toBe(true);
    expect(encoded.length).toBeLessThan(60);
  });

  it('propagates encoder errors through backpressure waits and releases resources', async () => {
    fixture.timestamps = Array.from({ length: 60 }, (_, i) => Math.round(i / 60 * 1e6));
    encoderFailure = true;
    await expect(runSequentialPipeline(request(60), new AbortController().signal, () => {})).rejects.toThrow('Encoder failed');
    expect(frames.every((frame) => frame.closed)).toBe(true);
    expect(fixture.disposed).toBe(true);
  });
});
