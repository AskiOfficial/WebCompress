import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForVideo, waitWithAbort } from '../src/services/webcodecs/mediaWait';

afterEach(() => vi.useRealTimers());
describe('video frame readiness', () => {
  it('rejects a seek timeout instead of accepting a stale frame', async () => {
    vi.useFakeTimers();
    const video = new EventTarget() as HTMLVideoElement;
    const result = waitForVideo(video, 'seeked', () => false, new AbortController().signal);
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('cancels pending frame reads immediately', async () => {
    const controller = new AbortController();
    const result = waitForVideo(new EventTarget() as HTMLVideoElement, 'seeked', () => false, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates flush failures instead of returning an incomplete output', async () => {
    await expect(waitWithAbort(Promise.reject(new Error('Encoder failed')), new AbortController().signal)).rejects.toThrow('Encoder failed');
  });
});
