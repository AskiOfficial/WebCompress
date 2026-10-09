import type { FC } from 'react';
import { ConversionSettings, ProcessingProgress, VideoMetadata } from '../../types';
import { formatDuration, formatFps } from '../../utils/formatters';
import { getTargetDimensions, getTargetFps } from '../../services/media/bitrateCalc';
import { Loader2, XCircle, Zap, Cpu } from 'lucide-react';

interface ProcessingScreenProps {
  progress: ProcessingProgress | null;
  stageMessage?: string;
  settings: ConversionSettings;
  metadata: VideoMetadata;
  onCancel: () => void;
}

export const ProcessingScreen: FC<ProcessingScreenProps> = ({
  progress,
  stageMessage,
  settings,
  metadata,
  onCancel,
}) => {
  const percent = progress?.percent ?? 0;
  const elapsedSec = (progress?.elapsedMs ?? 0) / 1000;
  const remainingSec = progress?.estimatedRemainingMs ? progress.estimatedRemainingMs / 1000 : undefined;

  const targetDim = getTargetDimensions(settings, metadata);
  const targetFps = getTargetFps(settings, metadata);
  const codecName = settings.videoCodec.toUpperCase();

  const isHardware = progress?.hardwareAccelerated || progress?.activeEngine === 'webcodecs';
  const cpuLabel = progress?.stage === 'initializing' || !progress
    ? 'Preparing CPU engine'
    : settings.videoCodec === 'h265' && progress.encoderThreads !== undefined
    ? `CPU · x265: ${progress.encoderThreads} ${progress.encoderThreads === 1 ? 'encoding thread' : 'worker threads'}`
    : progress.activeEngine === 'ffmpeg-mt' ? 'CPU Multi-Thread' : 'CPU Single-Thread';

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl max-w-2xl mx-auto my-8 space-y-6 text-center animate-in fade-in duration-200">
      {/* Header icon and title */}
      <div className="flex flex-col items-center justify-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>

        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Processing Video
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md">
            {stageMessage || 'Encoding frames locally on your computer...'}
          </p>
        </div>
      </div>

      {/* Progress Bar & Percentage */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs sm:text-sm">
          <span className="font-semibold text-slate-300 capitalize">
            {progress?.stage || 'Encoding'} video
          </span>
          <span className="font-bold text-indigo-400 text-lg sm:text-xl font-mono">
            {percent}%
          </span>
        </div>

        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Technical parameters badge */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
        <span className="px-3 py-1 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300 font-mono">
          {codecName} • {targetDim.width}×{targetDim.height} • {formatFps(targetFps)}
        </span>

        {isHardware ? (
          <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 font-medium">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{progress?.hardwarePreferred ? 'Hardware preferred' : 'Browser encoding (WebCodecs)'}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 font-medium">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              {cpuLabel}
            </span>
          </span>
        )}
      </div>

      {/* Processing Statistics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left pt-2">
        <StatCard label="Elapsed Time" value={formatDuration(elapsedSec)} />
        <StatCard
          label="Est. Remaining"
          value={remainingSec !== undefined ? formatDuration(remainingSec) : 'Calculating...'}
        />
        <StatCard
          label="Processing Speed"
          value={progress?.speed || (progress?.fps ? `${progress.fps} FPS` : 'Normal')}
        />
        <StatCard
          label="Processed Media"
          value={`${formatDuration(progress?.processedSeconds || 0)} / ${formatDuration(metadata.duration)}`}
        />
      </div>

      {/* Cancel button */}
      <div className="pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-semibold transition cursor-pointer"
        >
          <XCircle className="w-4 h-4 text-rose-400" />
          <span>Cancel Compression</span>
        </button>
      </div>
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
      <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
        {label}
      </div>
      <div className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5 truncate font-mono">
        {value}
      </div>
    </div>
  );
}
