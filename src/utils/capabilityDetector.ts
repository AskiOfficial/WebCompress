import { BrowserCapabilities, VideoCodec } from '../types';
import { resolveEncoderConfig } from '../services/webcodecs/encoderConfig';

let cachedCapabilities: BrowserCapabilities | null = null;

export async function detectBrowserCapabilities(): Promise<BrowserCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;
  const webAssembly = typeof WebAssembly !== 'undefined';
  const webWorkers = typeof Worker !== 'undefined';
  const sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const crossOriginIsolated = globalThis.crossOriginIsolated === true;
  const webCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  const probe = async (codec: VideoCodec) => {
    if (!webCodecs) return { hw: false, available: false };
    for (const { width, height } of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const config = await resolveEncoderConfig(codec, width, height, 30, 2_000_000, false);
      if (config) return { hw: config.hardwareAcceleration === 'prefer-hardware', available: true };
    }
    return { hw: false, available: false };
  };
  const [h264, h265, vp9, av1] = await Promise.all([probe('h264'), probe('h265'), probe('vp9'), probe('av1')]);
  cachedCapabilities = {
    webAssembly, webWorkers, sharedArrayBuffer, crossOriginIsolated, webCodecs,
    videoEncoder: typeof VideoEncoder !== 'undefined', videoDecoder: typeof VideoDecoder !== 'undefined',
    hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
    multithreadWasm: webAssembly && webWorkers && sharedArrayBuffer && crossOriginIsolated,
    h264Hardware: h264.hw, h265Hardware: h265.hw, vp9Hardware: vp9.hw, av1Hardware: av1.hw,
    // These legacy field names mean browser encoding available, not verified software encoders.
    h264Software: h264.available, h265Software: h265.available, vp9Software: vp9.available, av1Software: av1.available,
  };
  return cachedCapabilities;
}

export function getAutoCpuThreads(cores?: number): number {
  const c = cores ?? ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4);
  return Math.max(2, Math.min(32, c > 2 ? c - 1 : c));
}
