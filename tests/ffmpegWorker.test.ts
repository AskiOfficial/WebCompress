import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FFmpegJobRequest, FFmpegJobResponse } from '../src/services/ffmpeg/jobTypes';

const ffmpeg = vi.hoisted(() => ({
  load: vi.fn(), terminate: vi.fn(), on: vi.fn(), createDir: vi.fn(), mount: vi.fn(),
  exec: vi.fn(), readFile: vi.fn(), deleteFile: vi.fn(), unmount: vi.fn(),
}));
vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class { constructor() { return ffmpeg; } }, FFFSType: { WORKERFS: 'WORKERFS' },
}));
vi.mock('@ffmpeg/util', () => ({ toBlobURL: vi.fn(async (url: string) => `blob:${url}`) }));

const request: FFmpegJobRequest = {
  type: 'run', inputs: [], outputName: 'output.mp4', duration: 1, stage: 'encoding', preferMultiThread: true,
  args: ['-c:v', 'libx264', '-threads', '4', 'output.mp4'],
  singleThreadArgs: ['-c:v', 'libx264', 'output.mp4'],
};
const scope = {
  location: { origin: 'http://localhost' }, crossOriginIsolated: true,
  postMessage: vi.fn(), onmessage: null as ((event: MessageEvent<FFmpegJobRequest>) => Promise<void>) | null,
};

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  scope.onmessage = null;
  vi.stubGlobal('self', scope);
  vi.stubGlobal('SharedArrayBuffer', class {});
  ffmpeg.load.mockResolvedValue(true);
  ffmpeg.mount.mockResolvedValue(true);
  ffmpeg.exec.mockResolvedValue(0);
  ffmpeg.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
});
afterEach(() => vi.unstubAllGlobals());

async function run(job = request) {
  await import('../src/workers/ffmpeg.worker');
  await scope.onmessage!({ data: job } as MessageEvent<FFmpegJobRequest>);
  return scope.postMessage.mock.calls.map(([message]) => message as FFmpegJobResponse);
}

describe('CPU encoding uses the actual initialized WASM core', () => {
  it('reports the x265 pool count, without confusing one frame-control thread with one CPU worker', async () => {
    ffmpeg.exec.mockImplementationOnce(async () => {
      const [, log] = ffmpeg.on.mock.calls.find(([event]) => event === 'log')!;
      log({ message: 'x265 [info]: Thread pool created using 8 threads' });
      log({ message: 'x265 [info]: frame threads / pool features       : 1 / wpp(34 rows)' });
      return 0;
    });
    const messages = await run();
    expect(messages.filter(message => message.type === 'stats')).toEqual([{ type: 'stats', encoderThreads: 8 }]);
  });

  it('reports a single x265 encoding thread when no worker pool was initialized', async () => {
    ffmpeg.exec.mockImplementationOnce(async () => {
      const [, log] = ffmpeg.on.mock.calls.find(([event]) => event === 'log')!;
      log({ message: 'x265 [info]: frame threads / pool features       : 1 / none' });
      return 0;
    });
    const messages = await run();
    expect(messages).toContainEqual({ type: 'stats', encoderThreads: 1 });
  });

  it('uses the multithread encoder arguments after loading core-mt', async () => {
    const messages = await run();
    expect(ffmpeg.exec).toHaveBeenCalledWith(request.args);
    expect(messages).toContainEqual({ type: 'engine_ready', engine: 'ffmpeg-mt' });
    expect(messages.at(-1)).toMatchObject({ type: 'completed', engineUsed: 'ffmpeg-mt' });
    expect(ffmpeg.terminate).toHaveBeenCalledOnce();
  });

  it('rebuilds encoder threading when core-mt initialization falls back to core-st', async () => {
    ffmpeg.load.mockRejectedValueOnce(new Error('Shared memory initialization failed'));
    const messages = await run();
    expect(ffmpeg.load).toHaveBeenCalledTimes(2);
    expect(ffmpeg.exec).toHaveBeenCalledExactlyOnceWith(request.singleThreadArgs);
    expect(messages).toContainEqual({ type: 'engine_ready', engine: 'ffmpeg-st' });
    expect(messages.at(-1)).toMatchObject({ type: 'completed', engineUsed: 'ffmpeg-st' });
    expect(ffmpeg.terminate).toHaveBeenCalledTimes(2);
  });

  it('uses single-thread arguments if shared memory is unavailable in the worker', async () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    const messages = await run();
    expect(ffmpeg.load).toHaveBeenCalledOnce();
    expect(ffmpeg.exec).toHaveBeenCalledExactlyOnceWith(request.singleThreadArgs);
    expect(messages.at(-1)).toMatchObject({ type: 'completed', engineUsed: 'ffmpeg-st' });
  });

  it('reports encoding failure and cleans up without starting a CPU retry', async () => {
    ffmpeg.exec.mockResolvedValue(1);
    const messages = await run();
    expect(ffmpeg.exec).toHaveBeenCalledOnce();
    expect(messages.at(-1)).toMatchObject({ type: 'error' });
    expect(ffmpeg.unmount).toHaveBeenCalledWith('/input');
    expect(ffmpeg.terminate).toHaveBeenCalledOnce();
  });

  it('stops before encoding when HEVC requires core-mt but initialization fails', async () => {
    ffmpeg.load.mockRejectedValueOnce(new Error('Shared memory initialization failed'));
    const messages = await run({ ...request, requiresMultiThread: true });
    expect(ffmpeg.load).toHaveBeenCalledOnce();
    expect(ffmpeg.exec).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({ type: 'error', userMessage: expect.stringContaining('H.265') });
  });

  it('stops before loading core-st when HEVC shared memory is unavailable', async () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    const messages = await run({ ...request, requiresMultiThread: true });
    expect(ffmpeg.load).not.toHaveBeenCalled();
    expect(ffmpeg.exec).not.toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({ type: 'error', userMessage: expect.stringContaining('H.265') });
    expect(ffmpeg.terminate).toHaveBeenCalledOnce();
  });
});
