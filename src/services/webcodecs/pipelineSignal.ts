import { cancelledError } from '../media/mediaError';

/** Event-driven wakeups shared by decoder output, dequeue and encoder output. */
export class PipelineSignal {
  private listeners = new Set<() => void>();
  notify() { for (const listener of [...this.listeners]) listener(); }

  async until(ready: () => boolean, signal: AbortSignal, check: () => void): Promise<void> {
    const deadline = performance.now() + 30_000;
    while (true) {
      check();
      if (ready()) return;
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); this.listeners.delete(wake); signal.removeEventListener('abort', abort); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(cancelledError()); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('WebCodecs pipeline stopped responding.')); }, Math.max(0, deadline - performance.now()));
        this.listeners.add(wake);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else if (ready()) wake();
      });
    }
  }
}
