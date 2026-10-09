import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProcessingScreen } from '../src/components/processing/ProcessingScreen';
import { createDefaultSettings } from '../src/config/presets';
import { ProcessingProgress, VideoMetadata } from '../src/types';

const metadata = { duration: 10, width: 1920, height: 1080, fps: 60 } as VideoMetadata;
const settings = { ...createDefaultSettings(metadata), videoCodec: 'h265' as const, cpuThreads: 16 };
const progress: ProcessingProgress = {
  stage: 'encoding', percent: 25, elapsedMs: 1000, activeEngine: 'ffmpeg-mt', hardwareAccelerated: false,
};
const render = (value: ProcessingProgress) => renderToStaticMarkup(
  <ProcessingScreen settings={settings} metadata={metadata} progress={value} onCancel={vi.fn()} />,
);

describe('H.265 processing status', () => {
  it('shows multithread WASM without the old forced single-thread warning', () => {
    const html = render(progress);
    expect(html).toContain('CPU Multi-Thread');
    expect(html).not.toContain('Single-Thread x265');
    expect(html).not.toContain('restricted to a single thread');
    expect(html).not.toContain('Why is H.265 encoding running on 1 thread?');
  });

  it('shows the worker count reported by x265 rather than the selected 16 threads', () => {
    expect(render({ ...progress, encoderThreads: 4 })).toContain('CPU · x265: 4 worker threads');
    expect(render({ ...progress, encoderThreads: 4 })).not.toContain('16 worker threads');
  });

  it('reports one encoding thread only when x265 confirms it', () => {
    expect(render({ ...progress, encoderThreads: 1 })).toContain('CPU · x265: 1 encoding thread');
  });

  it('does not claim single-thread encoding while the CPU engine is still initializing', () => {
    const html = render({ ...progress, stage: 'initializing', activeEngine: 'ffmpeg-st' });
    expect(html).toContain('Preparing CPU engine');
    expect(html).not.toContain('CPU Single-Thread');
  });
});
