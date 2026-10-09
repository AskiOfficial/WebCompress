import type { FC } from 'react';
import { 
  BrowserCapabilities, 
  CompressionPreset, 
  ConversionSettings, 
  FpsOption, 
  OutputFormat, 
  ProcessingMode, 
  ResolutionOption, 
  VideoCodec, 
  VideoMetadata 
} from '../../types';
import { PRESETS, applyPresetToSettings, isPresetModified } from '../../config/presets';
import { VIDEO_CODECS, getCompatibleVideoCodecs, getDefaultVideoCodec } from '../../config/codecs';
import { AdvancedSettings } from './AdvancedSettings';
import { SizeEstimator } from './SizeEstimator';
import { SmartWarnings } from './SmartWarnings';
import { formatFps } from '../../utils/formatters';
import { getEncodingThreads } from '../../services/ffmpeg/threading';
import { useHardwareEncodingSupport } from '../../hooks/useHardwareEncodingSupport';
import { encodingConfigurationLabel } from '../../services/webcodecs/hardwareSupport';
import { Zap, Cpu, Sparkles, Sliders, Lock, Unlock, RotateCcw } from 'lucide-react';

interface SimpleSettingsProps {
  settings: ConversionSettings;
  onChange: (updated: ConversionSettings) => void;
  source?: VideoMetadata;
  capabilities: BrowserCapabilities | null;
  onCompress: () => void;
  isProcessing?: boolean;
}

export const SimpleSettings: FC<SimpleSettingsProps> = ({
  settings,
  onChange,
  source,
  capabilities,
  onCompress,
  isProcessing,
}) => {
  const detectedCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const autoThreads = getEncodingThreads(settings, capabilities?.multithreadWasm ?? true);
  const h265CpuUnavailable = settings.videoCodec === 'h265' && capabilities !== null && !capabilities.multithreadWasm;
  const hardwareSupport = useHardwareEncodingSupport(settings, source);
  const configurationLabel = encodingConfigurationLabel(settings, source);
  const hardwareBlocked = settings.processingMode === 'hardware' && !hardwareSupport?.supported;

  const isHardwareAvailableForCodec = (codec: VideoCodec, format: OutputFormat = settings.format): boolean => {
    if (!capabilities?.webCodecs || !capabilities?.videoEncoder) return false;
    if (!getCompatibleVideoCodecs(format).includes(codec)) return false;
    if (codec === 'h264') return !!capabilities.h264Hardware;
    if (codec === 'h265') return !!capabilities.h265Hardware;
    if (codec === 'vp9') return !!capabilities.vp9Hardware;
    if (codec === 'av1') return !!capabilities.av1Hardware;
    return false;
  };

  const handlePresetSelect = (preset: CompressionPreset) => {
    const updated = applyPresetToSettings(settings, preset, source);
    if (updated.processingMode === 'hardware' && capabilities && !isHardwareAvailableForCodec(updated.videoCodec, updated.format)) {
      updated.processingMode = 'auto';
    }
    onChange(updated);
  };

  const handleFormatChange = (format: OutputFormat) => {
    const compatibleCodecs = getCompatibleVideoCodecs(format);
    let nextCodec = settings.videoCodec;
    if (!compatibleCodecs.includes(nextCodec)) {
      nextCodec = getDefaultVideoCodec(format);
    }
    let nextMode = settings.processingMode;
    if (nextMode === 'hardware' && capabilities && !isHardwareAvailableForCodec(nextCodec, format)) {
      nextMode = 'auto';
    }
    onChange({
      ...settings,
      format,
      videoCodec: nextCodec,
      processingMode: nextMode,
    });
  };

  const handleCodecChange = (videoCodec: VideoCodec) => {
    let nextMode = settings.processingMode;
    if (nextMode === 'hardware' && capabilities && !isHardwareAvailableForCodec(videoCodec, settings.format)) {
      nextMode = 'auto';
    }
    onChange({
      ...settings,
      videoCodec,
      processingMode: nextMode,
    });
  };

  const handleResolutionChange = (resolution: ResolutionOption) => {
    onChange({
      ...settings,
      resolution,
    });
  };

  const handleCustomWidthChange = (w: number) => {
    const origW = source?.width || 1920;
    const origH = source?.height || 1080;
    let newH = settings.customHeight || origH;
    if (settings.lockAspectRatio) {
      newH = Math.round((w / (origW || 1)) * origH);
      newH = Math.round(newH / 2) * 2;
    }
    onChange({
      ...settings,
      customWidth: Math.round(w / 2) * 2,
      customHeight: newH,
    });
  };

  const handleCustomHeightChange = (h: number) => {
    const origW = source?.width || 1920;
    const origH = source?.height || 1080;
    let newW = settings.customWidth || origW;
    if (settings.lockAspectRatio) {
      newW = Math.round((h / (origH || 1)) * origW);
      newW = Math.round(newW / 2) * 2;
    }
    onChange({
      ...settings,
      customHeight: Math.round(h / 2) * 2,
      customWidth: newW,
    });
  };

  const handleFpsChange = (fps: FpsOption) => {
    onChange({
      ...settings,
      fps,
    });
  };

  const handleProcessingModeChange = (processingMode: ProcessingMode) => {
    onChange({
      ...settings,
      processingMode,
    });
  };

  // Quality description label
  const getQualityLabel = (val: number) => {
    if (val >= 95) return 'Maximum Quality (Near-lossless, pristine)';
    if (val >= 75) return 'High Quality (Crisp visual detail)';
    if (val >= 50) return 'Balanced (Optimal for sharing)';
    if (val >= 25) return 'Medium (Noticeable compression)';
    return 'Maximum Compression (Smallest file)';
  };

  const availableCodecs = getCompatibleVideoCodecs(settings.format);

  const isModified = isPresetModified(settings, source);
  const selectedPresetDef = PRESETS.find((p) => p.id === settings.preset);

  return (
    <div className="bg-slate-900/60 border border-slate-800/90 rounded-3xl p-5 sm:p-7 shadow-xl space-y-6">
      {/* Presets Bar */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Compression Preset
            </label>
            {isModified && selectedPresetDef && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {selectedPresetDef.name} (Modified)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isModified && selectedPresetDef && (
              <button
                type="button"
                onClick={() => handlePresetSelect(settings.preset)}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/20"
                title={`Reset ${selectedPresetDef.name} to pristine default values`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to {selectedPresetDef.name} defaults</span>
              </button>
            )}
            {!isModified && (
              <span className="text-[11px] text-slate-400">Select or fine-tune below</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map((p) => {
            const isSelected = settings.preset === p.id;
            const showModified = isSelected && isModified;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetSelect(p.id)}
                className={`p-2.5 rounded-xl border text-left transition relative cursor-pointer ${
                  isSelected
                    ? showModified
                      ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-xs shadow-amber-500/10 ring-1 ring-amber-500/30'
                      : 'bg-indigo-600/20 border-indigo-500 text-white shadow-xs shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold truncate min-w-0">{p.name}</span>
                  {showModified ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold shrink-0">
                      Modified
                    </span>
                  ) : (
                    p.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium shrink-0">
                        {p.badge}
                      </span>
                    )
                  )}
                </div>
                <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                  {showModified ? `Custom parameters applied over ${p.name}. Click to reset.` : p.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="space-y-4">
        {/* Output Container Format */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Output Format
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {(['mp4', 'webm', 'mkv', 'mov', 'avi'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => handleFormatChange(fmt)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold uppercase transition cursor-pointer text-center ${
                  settings.format === fmt
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>

        {/* Video Codec */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Video Codec
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {availableCodecs.map((codecId) => {
              const info = VIDEO_CODECS[codecId];
              const isSelected = settings.videoCodec === codecId;
              const isAv1 = codecId === 'av1';
              const av1Supported = !!(capabilities?.av1Hardware || capabilities?.av1Software);

              return (
                <button
                  key={codecId}
                  type="button"
                  onClick={() => handleCodecChange(codecId)}
                  className={`py-2.5 px-3 rounded-xl border text-left transition cursor-pointer relative ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-xs shadow-indigo-500/10'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold block">{info.name}</span>
                    {isAv1 && !av1Supported && (
                      <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">
                        WebCodecs
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block truncate mt-0.5">{info.badge}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resolution & FPS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Resolution */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-300">Resolution</label>
            {source && (
              <span className="text-[11px] text-slate-400">
                Source: {source.width}×{source.height}
              </span>
            )}
          </div>
          <select
            value={settings.resolution}
            onChange={(e) => handleResolutionChange(e.target.value as ResolutionOption)}
            className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
          >
            <option value="original">Original (Preserve source resolution)</option>
            <option value="2160p">2160p / 4K (3840×2160)</option>
            <option value="1440p">1440p / 2K (2560×1440)</option>
            <option value="1080p">1080p / Full HD (1920×1080)</option>
            <option value="720p">720p / HD (1280×720)</option>
            <option value="480p">480p / SD (854×480)</option>
            <option value="custom">Custom Dimensions</option>
          </select>

          {/* Custom dimensions if selected */}
          {settings.resolution === 'custom' && (
            <div className="mt-3 p-3 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Width (px)</label>
                  <input
                    type="number"
                    value={settings.customWidth || source?.width || 1280}
                    onChange={(e) => handleCustomWidthChange(parseInt(e.target.value, 10) || 2)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    step="2"
                    min="16"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Height (px)</label>
                  <input
                    type="number"
                    value={settings.customHeight || source?.height || 720}
                    onChange={(e) => handleCustomHeightChange(parseInt(e.target.value, 10) || 2)}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    step="2"
                    min="16"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...settings, lockAspectRatio: !settings.lockAspectRatio })}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer pt-1"
              >
                {settings.lockAspectRatio ? (
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <Unlock className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Lock aspect ratio</span>
              </button>
            </div>
          )}
        </div>

        {/* Framerate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-slate-300">Framerate (FPS)</label>
            {source && (
              <span className="text-[11px] text-slate-400">
                Source: {formatFps(source.fps)}
              </span>
            )}
          </div>
          <select
            value={settings.fps}
            onChange={(e) => {
              const val = e.target.value;
              handleFpsChange(val === 'original' || val === 'custom' ? (val as any) : Number(val));
            }}
            className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
          >
            <option value="original">
              Original {source?.fps ? `(${formatFps(source.fps)})` : '(Keep source framerate)'}
            </option>
            <option value={60}>60 FPS</option>
            <option value={50}>50 FPS</option>
            <option value={30}>30 FPS</option>
            <option value={25}>25 FPS</option>
            <option value={24}>24 FPS (Cinema)</option>
            <option value={15}>15 FPS</option>
            <option value="custom">Custom FPS</option>
          </select>

          {settings.fps === 'custom' && (
            <div className="mt-3">
              <label className="text-[10px] text-slate-400 block mb-1">Target FPS</label>
              <input
                type="number"
                value={settings.customFps || (source?.fps ? Math.round(source.fps) : 30)}
                onChange={(e) => onChange({ ...settings, customFps: parseInt(e.target.value, 10) || 30 })}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                min="1"
                max="240"
              />
            </div>
          )}
        </div>
      </div>

      {/* Quality / Compression Target Mode */}
      <div className="p-4 sm:p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Compression Mode
          </label>

          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              type="button"
              onClick={() => onChange({ ...settings, qualityMode: 'quality' })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                settings.qualityMode === 'quality'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Visual Quality
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...settings, qualityMode: 'target_size' })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                settings.qualityMode === 'target_size'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Target File Size
            </button>
          </div>
        </div>

        {/* Quality Mode: Slider */}
        {settings.qualityMode === 'quality' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Smaller file</span>
              <span className="text-indigo-400 font-semibold">{getQualityLabel(settings.qualityValue)}</span>
              <span className="text-slate-400 font-medium">Better quality</span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={settings.qualityValue}
              onChange={(e) =>
                onChange({
                  ...settings,
                  qualityValue: Number(e.target.value),
                })
              }
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
              aria-label="Compression quality slider"
            />

            <div className="flex justify-between text-[11px] text-slate-400 pt-1">
              <span>Smallest file</span>
              <span>Medium</span>
              <span>High Quality</span>
              <span>Near-Lossless (Max)</span>
            </div>
          </div>
        ) : (
          /* Target File Size Mode */
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Target Output File Size (MB)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="4000"
                  value={settings.targetSizeMb || 25}
                  onChange={(e) =>
                    onChange({
                      ...settings,
                      targetSizeMb: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm font-bold text-white focus:outline-hidden focus:border-indigo-500"
                />
                <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">
                  MB
                </span>
              </div>
            </div>

            {/* Quick target presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Quick sizes:</span>
              {[8, 15, 25, 50, 100].map((mb) => (
                <button
                  key={mb}
                  type="button"
                  onClick={() => onChange({ ...settings, targetSizeMb: mb })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                    settings.targetSizeMb === mb
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mb} MB {mb === 25 ? '(Discord)' : mb === 8 ? '(Discord Free)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Processing Engine Mode */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Processing Mode
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Auto */}
          <button
            type="button"
            onClick={() => handleProcessingModeChange('auto')}
            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
              settings.processingMode === 'auto'
                ? 'bg-indigo-600/20 border-indigo-500 text-white'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-bold">Auto</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              Chooses WebCodecs or CPU before encoding starts
            </span>
          </button>

          {/* Hardware */}
          {(() => {
            const isDisabled = !hardwareSupport?.supported;

            return (
              <button
                type="button"
                disabled={isDisabled}
                aria-label="Hardware processing mode"
                aria-pressed={settings.processingMode === 'hardware'}
                aria-describedby={hardwareSupport && !hardwareSupport.supported ? 'hardware-support-message' : undefined}
                onClick={() => !isDisabled && handleProcessingModeChange('hardware')}
                title={
                  isDisabled
                    ? hardwareSupport === null ? 'Checking the selected encoder configuration...'
                      : `Hardware encoding is unavailable for ${configurationLabel}. Choose Auto/CPU or a supported resolution.`
                    : 'WebCodecs preferred (accelerated if supported)'
                }
                className={`p-3 rounded-xl border text-left transition ${
                  isDisabled
                    ? 'bg-slate-950/20 border-slate-800/40 text-slate-500 cursor-not-allowed opacity-60'
                    : settings.processingMode === 'hardware'
                    ? 'bg-amber-600/20 border-amber-500 text-white cursor-pointer ring-1 ring-amber-500/30'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className={`w-3.5 h-3.5 ${isDisabled ? 'text-slate-600' : 'text-amber-400'}`} />
                    <span className="text-xs font-bold">Hardware</span>
                  </div>
                  {isDisabled && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                      {hardwareSupport === null ? 'Checking...' : 'Unavailable'}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {isDisabled
                    ? hardwareSupport === null ? 'Checking resolution, FPS and bitrate...'
                      : `Unavailable for ${configurationLabel}`
                    : 'WebCodecs preferred (accelerated if supported)'}
                </span>
              </button>
            );
          })()}

          {/* CPU */}
          <button
            type="button"
            onClick={() => handleProcessingModeChange('cpu')}
            disabled={h265CpuUnavailable}
            className={`p-3 rounded-xl border text-left transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              settings.processingMode === 'cpu'
                ? 'bg-indigo-600/20 border-indigo-500 text-white'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-bold">{h265CpuUnavailable ? 'CPU unavailable' : `CPU (${autoThreads} ${autoThreads === 1 ? 'thread' : 'threads'})`}</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              {h265CpuUnavailable ? 'H.265 requires browser isolation and shared memory' : 'FFmpeg.wasm local CPU encoding'}
            </span>
          </button>
        </div>
        {hardwareSupport && !hardwareSupport.supported && settings.processingMode !== 'cpu' && (
          <div id="hardware-support-message" className="mt-3 p-3 rounded-xl border border-amber-500/25 bg-amber-500/10 text-xs text-amber-200 space-y-2" role="status">
            <p>Your browser does not expose hardware-preferred encoding for {configurationLabel}. Choose Auto or CPU to keep these settings, or change to a supported resolution.</p>
            {settings.videoCodec !== 'h265' && getCompatibleVideoCodecs(settings.format).includes('h265') && capabilities?.h265Hardware && (
              <button
                type="button"
                className="underline font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 block text-amber-300 hover:text-amber-100"
                onClick={() => onChange({ ...settings, videoCodec: 'h265', processingMode: 'hardware' })}
              >
                Use H.265 / HEVC with Hardware (preserves full resolution & framerate)
              </button>
            )}
            {hardwareSupport.suggestion && (
              <button type="button" className="underline font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4"
                onClick={() => onChange({ ...settings, resolution: hardwareSupport.suggestion!.resolution, processingMode: 'hardware' })}>
                Use {hardwareSupport.suggestion.resolution} ({hardwareSupport.suggestion.width}×{hardwareSupport.suggestion.height}) with Hardware
              </button>
            )}
          </div>
        )}
      </div>

      {/* Advanced Settings Accordion */}
      <AdvancedSettings
        settings={settings}
        onChange={(partial) => onChange({ ...settings, ...partial })}
        source={source}
      />

      {/* Contextual Smart Warnings */}
      <SmartWarnings
        settings={settings}
        source={source}
        capabilities={capabilities}
      />

      {/* Estimated Output Size Card */}
      <SizeEstimator settings={settings} source={source} />

      {/* Primary Action Button */}
      <button
        type="button"
        disabled={isProcessing || hardwareBlocked || (h265CpuUnavailable && settings.processingMode === 'cpu')}
        onClick={onCompress}
        className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-bold text-base transition shadow-xl shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
      >
        <Sparkles className="w-5 h-5" />
        <span>Compress Video</span>
      </button>
    </div>
  );
};
