import { ConversionSettings } from '../../types';

// The bundled core-mt preallocates 32 pthread workers. Reserve workers for
// decoding, filters and x265's control threads instead of exhausting that pool.
export const H265_MAX_CPU_THREADS = 16;

export function getAutoCpuThreads(cores?: number): number {
  const c = cores ?? ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4);
  return Math.max(2, Math.min(32, c > 2 ? c - 1 : c));
}

export function getEncodingThreads(settings: ConversionSettings, multi: boolean): number {
  if (!multi) return 1;
  const requested = settings.cpuThreads > 0 ? settings.cpuThreads : getAutoCpuThreads();
  return Math.max(1, Math.min(settings.videoCodec === 'h265' ? H265_MAX_CPU_THREADS : 32, Math.floor(requested)));
}
