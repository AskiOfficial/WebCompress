import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimpleSettings } from '../src/components/settings/SimpleSettings';
import { createDefaultSettings } from '../src/config/presets';
import type { HardwareEncodingSupport } from '../src/services/webcodecs/hardwareSupport';
import type { VideoMetadata } from '../src/types';
const probe = vi.hoisted(() => vi.fn());
vi.mock('../src/hooks/useHardwareEncodingSupport', () => ({ useHardwareEncodingSupport: probe }));
const source = { width: 1920, height: 1440, fps: 60, duration: 30, size: 85 * 1024 * 1024 } as VideoMetadata;
const render = (processingMode: 'hardware' | 'auto' = 'hardware') => renderToStaticMarkup(<SimpleSettings
  settings={{ ...createDefaultSettings(), processingMode }} source={source} capabilities={null} onChange={vi.fn()} onCompress={vi.fn()} />);
const compressionDisabled = (html: string) => /<button[^>]*disabled=""[^>]*>[^]*?<span>Compress Video<\/span>/.test(html.slice(html.lastIndexOf('<button')));
beforeEach(() => probe.mockReset());
describe('hardware settings availability', () => {
  it('blocks Hardware export while the current settings are being checked', () => {
    probe.mockReturnValue(null);
    expect(compressionDisabled(render())).toBe(true);
    expect(render()).toContain('Checking resolution, FPS and bitrate');
  });
  it('blocks an unsupported Hardware request and explains the checked alternative', () => {
    probe.mockReturnValue({ supported: false, suggestion: { resolution: '1080p', width: 1440, height: 1080 } } satisfies HardwareEncodingSupport);
    const html = render();
    expect(compressionDisabled(html)).toBe(true);
    expect(html).toContain('H.264 1920×1440 at 60 FPS');
    expect(html).toContain('Use 1080p (1440×1080) with Hardware');
  });
  it('allows supported Hardware settings and keeps Auto usable for unavailable hardware', () => {
    probe.mockReturnValue({ supported: true });
    expect(compressionDisabled(render())).toBe(false);
    probe.mockReturnValue({ supported: false });
    expect(compressionDisabled(render('auto'))).toBe(false);
  });

  it('offers switching to H.265 / HEVC with Hardware when H.264 hardware is unsupported but H.265 hardware is available', () => {
    probe.mockReturnValue({ supported: false, suggestion: { resolution: '1080p', width: 1440, height: 1080 } });
    const caps = {
      webAssembly: true, sharedArrayBuffer: true, crossOriginIsolated: true, webWorkers: true,
      webCodecs: true, videoEncoder: true, videoDecoder: true, hardwareConcurrency: 8,
      h264Hardware: false, h265Hardware: true, vp9Hardware: false, av1Hardware: false,
      h264Software: true, h265Software: true, vp9Software: true, av1Software: false,
      multithreadWasm: true,
    };
    const html = renderToStaticMarkup(<SimpleSettings
      settings={{ ...createDefaultSettings(), processingMode: 'hardware' }} source={source} capabilities={caps} onChange={vi.fn()} onCompress={vi.fn()} />);
    expect(html).toContain('Use H.265 / HEVC with Hardware');
  });
});
