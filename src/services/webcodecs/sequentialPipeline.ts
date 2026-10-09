import { MP4, QTFF, WEBM, MATROSKA, BlobSource, EncodedPacketSink, Input } from 'mediabunny';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { PipelineSignal } from './pipelineSignal';
import { waitWithAbort } from './mediaWait';
import {
  PIPELINE_LIMITS,
  PipelineStats,
  SequentialUnavailable,
  VideoPipelineRequest,
  VideoPipelineResponse,
} from './workerTypes';

export { PIPELINE_LIMITS, SequentialUnavailable };

export async function runSequentialPipeline(
  request: VideoPipelineRequest,
  signal: AbortSignal,
  send: (response: VideoPipelineResponse) => void
): Promise<{ buffer: ArrayBuffer; stats: PipelineStats }> {
  const stats: PipelineStats = {
    encodedFrames: 0,
    decodedFrames: 0,
    framesCreated: 0,
    framesClosed: 0,
    canvasFrames: 0,
    seeks: 0,
    flushes: 0,
    encodeQueueMax: 0,
    decodeQueueMax: 0,
    decodedQueueMax: 0,
    encoderInFlightMax: 0,
    decoderInFlightMax: 0,
    timings: {
      encoderWait: 0,
      decodeLatency: 0,
      encodeLatency: 0,
    },
  };

  let input: Input | null = null;
  let decoder: VideoDecoder | null = null;
  let encoder: VideoEncoder | null = null;
  const readyFrames: VideoFrame[] = [];
  let held: VideoFrame | null = null;
  let lookahead: VideoFrame | null = null;
  const wake = new PipelineSignal();
  const local = new AbortController();

  const abort = () => { local.abort(); wake.notify(); };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();

  let error: Error | null = null;
  let failure: unknown;

  const fail = (cause: unknown) => {
    error ??= cause instanceof Error ? cause : new Error(String(cause));
    local.abort();
    wake.notify();
  };

  const check = () => {
    if (error) throw error;
    if (local.signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
  };

  const closeFrame = (frame: VideoFrame) => {
    frame.close();
    stats.framesClosed++;
  };

  try {
    if (typeof VideoDecoder === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      throw new SequentialUnavailable('Sequential decoding is unavailable in this browser worker.');
    }

    input = new Input({
      source: new BlobSource(request.file, { maxCacheSize: 8 * 1024 * 1024 }),
      formats: [MP4, QTFF, WEBM, MATROSKA],
    });

    let prepared: {
      track: any;
      config: VideoDecoderConfig;
      rotation: number;
      flip: boolean;
    };

    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('No supported video track.');
      const config = await track.getDecoderConfig();
      if (!config) throw new Error('No browser decoder configuration.');
      const rotation = await track.getRotation();
      const flip = await track.getFlip();
      if (![0, 90, 180, 270].includes(rotation)) throw new Error('Non-orthogonal track transform.');
      prepared = { track, config, rotation, flip };
    } catch (cause) {
      throw new SequentialUnavailable(cause instanceof Error ? cause.message : String(cause));
    }

    check();

    let decoderConfig: VideoDecoderConfig | null = null;
    for (const preference of ['prefer-hardware', 'no-preference'] as const) {
      const candidate = { ...prepared.config, hardwareAcceleration: preference };
      try {
        if ((await VideoDecoder.isConfigSupported(candidate)).supported) {
          decoderConfig = candidate;
          break;
        }
      } catch {
        // Try browser default before falling back
      }
    }

    if (!decoderConfig) {
      throw new SequentialUnavailable('Browser does not support sequential decoding of this source codec.');
    }

    const sink = new EncodedPacketSink(prepared.track);
    const target = new ArrayBufferTarget();
    const { width, height } = request.config;
    const codecs = { h264: 'avc', h265: 'hevc', vp9: 'vp9', av1: 'av1' } as const;

    const muxer = new Muxer({
      target,
      video: { codec: codecs[request.codec], width, height },
      fastStart: false,
      firstTimestampBehavior: 'strict',
    });

    let hasDescription = false;
    const decodeStarts = new Map<number, number[]>();
    const encodeStarts = new Map<number, number>();
    let inFlight = 0;
    let done = false;
    let lastTimestamp = -Infinity;
    const total = Math.ceil(request.duration * request.fps);
    let lastProgress = -Infinity;

    const progress = () => {
      if (performance.now() - lastProgress >= 100 || stats.encodedFrames === total) {
        send({ type: 'progress', frames: stats.encodedFrames, total, stats });
        lastProgress = performance.now();
      }
    };

    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (error || local.signal.aborted) return;
        try {
          const submitted = encodeStarts.get(chunk.timestamp);
          if (submitted !== undefined) {
            stats.timings.encodeLatency += performance.now() - submitted;
            encodeStarts.delete(chunk.timestamp);
          }
          if (meta?.decoderConfig?.description?.byteLength) hasDescription = true;
          if ((request.codec === 'h264' || request.codec === 'h265') && !hasDescription) {
            throw new Error('Browser encoder did not provide the MP4 decoder configuration.');
          }
          muxer.addVideoChunk(chunk, meta);
          stats.encodedFrames++;
          progress();
        } catch (cause) {
          fail(cause);
        }
        wake.notify();
      },
      error: fail,
    });

    encoder.configure(request.config);
    encoder.addEventListener('dequeue', () => wake.notify());

    decoder = new VideoDecoder({
      output: (frame) => {
        stats.framesCreated++;
        stats.decodedFrames++;
        inFlight--;
        const submitted = decodeStarts.get(frame.timestamp);
        if (submitted?.length) {
          stats.timings.decodeLatency += performance.now() - submitted.shift()!;
          if (!submitted.length) decodeStarts.delete(frame.timestamp);
        }
        if (error || local.signal.aborted) {
          closeFrame(frame);
          wake.notify();
          return;
        }
        if (frame.timestamp < lastTimestamp) {
          closeFrame(frame);
          fail(new Error('Decoder returned frames outside presentation order.'));
          return;
        }
        lastTimestamp = frame.timestamp;
        readyFrames.push(frame);
        stats.decodedQueueMax = Math.max(stats.decodedQueueMax, readyFrames.length);
        wake.notify();
      },
      error: fail,
    });

    decoder.configure(decoderConfig);
    decoder.addEventListener('dequeue', () => wake.notify());

    let canvas: OffscreenCanvas | null = null;
    let context: OffscreenCanvasRenderingContext2D | null = null;

    const nextFrame = async (): Promise<VideoFrame | null> => {
      if (!readyFrames.length && !done) {
        await wake.until(() => readyFrames.length > 0 || done, local.signal, check);
      }
      check();
      const frame = readyFrames.shift() ?? null;
      wake.notify();
      return frame;
    };

    const encodeFrame = async (source: VideoFrame, index: number) => {
      if (encoder!.encodeQueueSize >= PIPELINE_LIMITS.encodeQueue || encodeStarts.size >= PIPELINE_LIMITS.encoderInFlight) {
        const waitStart = performance.now();
        await wake.until(
          () => encoder!.encodeQueueSize < PIPELINE_LIMITS.encodeQueue && encodeStarts.size < PIPELINE_LIMITS.encoderInFlight,
          local.signal,
          check
        );
        stats.timings.encoderWait += performance.now() - waitStart;
      }
      check();

      const timestamp = Math.round((index / request.fps) * 1_000_000);
      const duration = Math.max(1, Math.round(((index + 1) / request.fps) * 1_000_000) - timestamp);
      let frameSource: VideoFrame | OffscreenCanvas = source;
      const rotated = prepared.rotation === 90 || prepared.rotation === 270;
      const displayWidth = rotated ? source.displayHeight : source.displayWidth;
      const displayHeight = rotated ? source.displayWidth : source.displayHeight;

      if (displayWidth !== width || displayHeight !== height || prepared.rotation || prepared.flip) {
        canvas ??= new OffscreenCanvas(width, height);
        context ??= canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Cannot resize video in this worker.');
        context.save();
        try {
          context.translate(width / 2, height / 2);
          if (prepared.flip) context.scale(-1, 1);
          context.rotate((prepared.rotation * Math.PI) / 180);
          const w = rotated ? height : width;
          const h = rotated ? width : height;
          context.drawImage(source, -w / 2, -h / 2, w, h);
        } finally {
          context.restore();
        }
        stats.canvasFrames++;
        frameSource = canvas;
      }

      const frame = new VideoFrame(frameSource, { timestamp, duration });
      stats.framesCreated++;
      try {
        encodeStarts.set(timestamp, performance.now());
        stats.encoderInFlightMax = Math.max(stats.encoderInFlightMax, encodeStarts.size);
        encoder!.encode(frame, { keyFrame: index % Math.max(1, Math.round(request.fps * 2)) === 0 });
        stats.encodeQueueMax = Math.max(stats.encodeQueueMax, encoder!.encodeQueueSize);
      } finally {
        closeFrame(frame);
      }
    };

    const produce = async () => {
      const packets = (async function* () {
        let packet = await sink.getFirstPacket();
        while (packet) {
          yield packet;
          packet = await sink.getNextPacket(packet);
        }
      })();

      try {
        while (true) {
          if (
            decoder!.decodeQueueSize >= PIPELINE_LIMITS.decodeQueue ||
            inFlight + readyFrames.length >= PIPELINE_LIMITS.decoderInFlight ||
            readyFrames.length >= PIPELINE_LIMITS.decodedFrames
          ) {
            await wake.until(
              () =>
                decoder!.decodeQueueSize < PIPELINE_LIMITS.decodeQueue &&
                inFlight + readyFrames.length < PIPELINE_LIMITS.decoderInFlight &&
                readyFrames.length < PIPELINE_LIMITS.decodedFrames,
              local.signal,
              check
            );
          }
          check();

          const packet = await waitWithAbort(packets.next(), local.signal);
          check();
          if (packet.done) break;

          const chunk = packet.value.toEncodedVideoChunk();
          const times = decodeStarts.get(chunk.timestamp) ?? [];
          times.push(performance.now());
          decodeStarts.set(chunk.timestamp, times);

          decoder!.decode(chunk);
          inFlight++;
          stats.decoderInFlightMax = Math.max(stats.decoderInFlightMax, inFlight);
          stats.decodeQueueMax = Math.max(stats.decodeQueueMax, decoder!.decodeQueueSize);
        }

        stats.flushes++;
        await waitWithAbort(decoder!.flush(), local.signal, 60_000);
        check();
        done = true;
        wake.notify();
      } catch (cause) {
        fail(cause);
        throw cause;
      } finally {
        await packets.return();
      }
    };

    const consume = async () => {
      try {
        held = await nextFrame();
        if (!held) throw new Error('Source contains no decoded video frames.');
        lookahead = await nextFrame();

        for (let index = 0; index < total; index++) {
          const timestamp = Math.round((index / request.fps) * 1_000_000);
          while (lookahead && lookahead.timestamp <= timestamp) {
            closeFrame(held);
            held = lookahead;
            lookahead = null;
            lookahead = await nextFrame();
          }
          await encodeFrame(held, index);
        }

        if (held) { closeFrame(held); held = null; }
        if (lookahead) { closeFrame(lookahead); lookahead = null; }
        while (true) {
          const frame = await nextFrame();
          if (!frame) break;
          closeFrame(frame);
        }
      } catch (cause) {
        fail(cause);
        throw cause;
      }
    };

    const results = await Promise.allSettled([produce(), consume()]);
    check();
    for (const res of results) {
      if (res.status === 'rejected') throw res.reason;
    }
    check();

    stats.flushes++;
    await waitWithAbort(encoder!.flush(), local.signal, 60_000);
    check();

    if (stats.encodedFrames !== total) {
      throw new Error('The video encoder returned an incomplete stream.');
    }

    muxer.finalize();
    return { buffer: target.buffer, stats };
  } catch (cause) {
    failure = cause;
    throw cause;
  } finally {
    signal.removeEventListener('abort', abort);
    if (decoder && decoder.state !== 'closed') decoder.close();
    if (encoder && encoder.state !== 'closed') encoder.close();
    if (held) closeFrame(held);
    if (lookahead) closeFrame(lookahead);
    for (const frame of readyFrames) closeFrame(frame);
    input?.dispose();
    if (failure && !(failure instanceof SequentialUnavailable)) {
      send({
        type: 'error',
        message: failure instanceof Error ? failure.message : String(failure),
        stats,
      });
    }
  }
}
