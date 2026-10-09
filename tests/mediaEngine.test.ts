import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSettings } from '../src/config/presets';
import { VideoMetadata } from '../src/types';

const engines = vi.hoisted(() => ({ supported: vi.fn(), browser: vi.fn(), cpu: vi.fn(), cancel: vi.fn() }));
vi.mock('../src/services/webcodecs/webcodecsEngine', () => ({ WebCodecsEngine: class {
  isSupported = engines.supported; process = engines.browser; cancel = engines.cancel;
} }));
vi.mock('../src/services/ffmpeg/ffmpegEngine', () => ({ FFmpegEngine: class {
  process = engines.cpu; cancel = engines.cancel;
} }));
import { MediaEngineDispatcher } from '../src/services/media/mediaDispatcher';

const source = {} as VideoMetadata;
const file = new File([], 'source.mp4');
const events = { onProgress: vi.fn(), onStage: vi.fn() };

describe('engine selection and encoding failures', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it.each(['hardware', 'auto'] as const)('never starts CPU after an encoding error in %s mode', async (processingMode) => {
    engines.supported.mockResolvedValue(true);
    engines.browser.mockRejectedValue(new Error('Encoder crashed'));
    await expect(new MediaEngineDispatcher().process(file, { ...createDefaultSettings(), processingMode }, source, events))
      .rejects.toThrow('Encoder crashed');
    expect(engines.cpu).not.toHaveBeenCalled();
  });

  it('hardware mode reports unsupported settings without starting CPU', async () => {
    engines.supported.mockResolvedValue(false);
    await expect(new MediaEngineDispatcher().process(file, { ...createDefaultSettings(), processingMode: 'hardware' }, source, events))
      .rejects.toThrow('unavailable');
    expect(engines.cpu).not.toHaveBeenCalled();
  });

  it('Auto can select CPU before encoding starts when no browser encoder is available', async () => {
    engines.supported.mockResolvedValue(false);
    engines.cpu.mockResolvedValue({});
    await new MediaEngineDispatcher().process(file, createDefaultSettings(), source, events);
    expect(engines.cpu).toHaveBeenCalledOnce();
    expect(engines.browser).not.toHaveBeenCalled();
  });

  it('cancellation during capability checking never starts any encoder', async () => {
    let supported!: (value: boolean) => void;
    engines.supported.mockImplementation(() => new Promise((resolve) => { supported = resolve; }));
    const dispatcher = new MediaEngineDispatcher();
    const job = dispatcher.process(file, createDefaultSettings(), source, events);
    await dispatcher.cancel();
    supported(true);
    await expect(job).rejects.toMatchObject({ name: 'AbortError' });
    expect(engines.cpu).not.toHaveBeenCalled();
    expect(engines.browser).not.toHaveBeenCalled();
  });

  it('a failed job does not prevent retrying the browser engine', async () => {
    engines.supported.mockResolvedValue(true);
    engines.browser.mockRejectedValueOnce(new Error('Encoder crashed')).mockResolvedValueOnce({});
    const dispatcher = new MediaEngineDispatcher();
    await expect(dispatcher.process(file, createDefaultSettings(), source, events)).rejects.toThrow();
    await expect(dispatcher.process(file, createDefaultSettings(), source, events)).resolves.toEqual({});
    expect(engines.cpu).not.toHaveBeenCalled();
  });
});
