import { cancelledError } from '../mediaError';

export function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs = 30_000): Promise<T> {
  if (signal.aborted) {
    // A flush promise may have already rejected when cancellation closed its encoder.
    void promise.catch(() => {});
    return Promise.reject(cancelledError());
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(cancelledError()); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Media operation timed out.')); }, timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

export function waitForVideo(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', ready: () => boolean,
  signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancelledError());
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener(event, loaded);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', abort);
    };
    const loaded = () => { if (ready()) { cleanup(); resolve(); } };
    const failed = () => { cleanup(); reject(new Error('The browser cannot read the source video.')); };
    const abort = () => { cleanup(); reject(cancelledError()); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Reading a video frame timed out.')); }, 30_000);
    video.addEventListener(event, loaded);
    video.addEventListener('error', failed);
    signal.addEventListener('abort', abort, { once: true });
    if (video.error) failed();
  });
}
