import { afterEach, describe, expect, it, vi } from 'vitest';
import { FFmpegJob } from '../src/services/ffmpeg/ffmpegJob';
import { FFmpegJobRequest, FFmpegJobResponse } from '../src/services/ffmpeg/jobTypes';

class TestWorker {
  static last: TestWorker;
  onmessage: ((event: MessageEvent<FFmpegJobResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.last = this; }
  reply(data: FFmpegJobResponse) { this.onmessage?.({ data } as MessageEvent<FFmpegJobResponse>); }
}

const request: FFmpegJobRequest = { type: 'run', inputs: [], outputName: 'output.mp4', args: [],
  duration: 5, preferMultiThread: false, stage: 'muxing' };
const events = { onProgress: vi.fn(), onStage: vi.fn() };
afterEach(() => vi.unstubAllGlobals());

describe('local media worker lifecycle', () => {
  it('cancel rejects the pending job and terminates the worker immediately', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const job = new FFmpegJob();
    const result = job.run(request, events);
    job.cancel();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
  });

  it('audio processing errors reject the job and release the worker', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const result = new FFmpegJob().run(request, events);
    TestWorker.last.reply({ type: 'error', message: 'Audio decode failed' });
    await expect(result).rejects.toThrow('Audio decode failed');
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
  });

  it('an aborted operation never creates a worker', async () => {
    const Worker = vi.fn();
    vi.stubGlobal('Worker', Worker);
    const controller = new AbortController(); controller.abort();
    await expect(new FFmpegJob().run(request, events, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(Worker).not.toHaveBeenCalled();
  });

  it('successful completion releases the worker and keeps downloadable bytes', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const result = new FFmpegJob().run(request, events);
    const outputBuffer = new ArrayBuffer(12);
    TestWorker.last.reply({ type: 'completed', outputBuffer, engineUsed: 'ffmpeg-st' });
    expect(await result).toEqual({ buffer: outputBuffer, engine: 'ffmpeg-st' });
    expect(TestWorker.last.terminate).toHaveBeenCalledOnce();
  });
});
