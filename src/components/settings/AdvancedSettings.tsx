import { useState, type FC } from 'react';
import { ConversionSettings, VideoMetadata } from '../../types';
import { ChevronDown, ChevronUp, Sliders, Volume2, Cpu, Globe } from 'lucide-react';
import { canCopyAudio } from '../../config/codecs';
import { formatAudioChannels } from '../../utils/formatters';
import { getEncodingThreads, getAutoCpuThreads, H265_MAX_CPU_THREADS } from '../../services/ffmpeg/threading';

interface AdvancedSettingsProps {
  settings: ConversionSettings;
  onChange: (updated: Partial<ConversionSettings>) => void;
  source?: VideoMetadata;
}

export const AdvancedSettings: FC<AdvancedSettingsProps> = ({
  settings,
  onChange,
  source,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const detectedCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const autoThreads = settings.videoCodec === 'h265'
    ? getEncodingThreads({ ...settings, cpuThreads: 0 }, true)
    : getAutoCpuThreads(detectedCores);

  const isFastStartSupported = settings.format === 'mp4' || settings.format === 'mov';

  return (
    <div className="border border-slate-800 rounded-2xl bg-slate-900/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-800/40 transition cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-2 text-sm font-semibold text-slate-200">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Advanced Settings</span>
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span>{isOpen ? 'Hide technical controls' : 'Show technical controls'}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="p-5 border-t border-slate-800/80 space-y-5 bg-slate-950/40 animate-in fade-in duration-150">
          {/* Section: Video Bitrate & Mode */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Video Bitrate Controls
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Bitrate Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['vbr', 'cbr'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onChange({ bitrateMode: mode })}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border text-center transition cursor-pointer ${
                        settings.bitrateMode === mode
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Manual Video Bitrate (kbps)
                </label>
                <input
                  type="number"
                  placeholder="Auto (based on quality/target)"
                  value={settings.customVideoBitrateKbps || ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    onChange({ customVideoBitrateKbps: val });
                  }}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                  min="100"
                  max="50000"
                  step="100"
                />
              </div>
            </div>
          </div>

          {/* Section: Audio Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> Audio Parameters
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Audio Action */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Audio Track
                </label>
                <select
                  value={settings.audioAction}
                  onChange={(e) => onChange({ audioAction: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value="compress">Compress Audio</option>
                  <option value="keep">Keep Audio (copy if compatible)</option>
                  <option value="remove">Remove Audio (Mute)</option>
                </select>
              </div>

              {/* Audio Bitrate */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Audio Bitrate
                </label>
                <select
                  value={settings.audioBitrateKbps}
                  disabled={settings.audioAction === 'remove' || canCopyAudio(settings, source)}
                  onChange={(e) => onChange({ audioBitrateKbps: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 disabled:opacity-50 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  {[64, 96, 128, 160, 192, 256, 320].map((b) => (
                    <option key={b} value={b}>
                      {b} kbps {b === 192 ? '(Standard)' : b === 128 ? '(Light)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Channels */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Channels
                </label>
                <select
                  value={settings.audioChannels}
                  disabled={settings.audioAction === 'remove'}
                  onChange={(e) => onChange({ audioChannels: e.target.value as any })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 disabled:opacity-50 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value="original">{formatAudioChannels(source?.audioChannels, true)}</option>
                  <option value="stereo">Stereo (2 channels)</option>
                  <option value="mono">Mono (1 channel)</option>
                  <option value="surround51">5.1 Surround (6 channels)</option>
                </select>
              </div>
            </div>
            {settings.audioAction === 'keep' && (
              <p className="text-xs text-slate-400">
                {canCopyAudio(settings, source)
                  ? 'The source audio will be copied without re-encoding.'
                  : 'Audio will be converted using the selected bitrate and channels to fit the output format.'}
              </p>
            )}
          </div>

          {/* Section: CPU Threads & Optimization */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" /> Processing & Packaging
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="cpu-threads" className="text-xs font-medium text-slate-300">
                    CPU Threads (FFmpeg WASM)
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Detected: {detectedCores} cores
                  </span>
                </div>
                <select
                  id="cpu-threads"
                  value={settings.cpuThreads}
                  onChange={(e) => onChange({ cpuThreads: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                >
                  <option value={0}>
                    Auto ({autoThreads} threads - Recommended)
                  </option>
                  <option value={2}>2 Threads</option>
                  <option value={4}>4 Threads</option>
                  <option value={6}>6 Threads</option>
                  <option value={8}>8 Threads</option>
                  {detectedCores >= 12 && <option value={12}>12 Threads</option>}
                  {detectedCores >= 16 && <option value={16}>16 Threads</option>}
                  {detectedCores >= 24 && <option value={24} disabled={settings.videoCodec === 'h265'}>24 Threads{settings.videoCodec === 'h265' ? ' (H.265 limit: 16)' : ''}</option>}
                  {detectedCores >= 32 && <option value={32} disabled={settings.videoCodec === 'h265'}>32 Threads{settings.videoCodec === 'h265' ? ' (H.265 limit: 16)' : ''}</option>}
                  <option value={1}>1 Thread (Single-core fallback - Slow)</option>
                </select>
                {settings.videoCodec === 'h265' ? (
                  <p className="text-[10px] text-amber-400 mt-1 leading-tight">
                    H.265 uses up to {H265_MAX_CPU_THREADS} CPU worker threads when browser isolation is available. Higher selections are capped to keep WASM workers available for decoding and filters.
                  </p>
                ) : settings.cpuThreads === 1 ? (
                  <p className="text-[10px] text-amber-400 mt-1 leading-tight">
                    Warning: 1 thread is very slow for high-resolution video. Auto threads is recommended.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 pt-2 sm:pt-6">
                <label className={`flex items-center space-x-2.5 ${isFastStartSupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={isFastStartSupported && settings.fastStart}
                    disabled={!isFastStartSupported}
                    onChange={(e) => onChange({ fastStart: e.target.checked })}
                    className="w-4 h-4 rounded-sm bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-indigo-400" /> Fast Start (Web Streaming)
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {isFastStartSupported
                        ? `Places moov atom at beginning of ${settings.format.toUpperCase()} for instant web playback`
                        : `Only applicable to MP4 & MOV containers (not needed for ${settings.format.toUpperCase()})`}
                    </span>
                  </div>
                </label>

                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.preserveMetadata}
                    onChange={(e) => onChange({ preserveMetadata: e.target.checked })}
                    className="w-4 h-4 rounded-sm bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-slate-200">Preserve Source Metadata</span>
                    <span className="text-[11px] text-slate-400 block">
                      Keep creation dates and camera tags (unchecking removes tags for privacy)
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
