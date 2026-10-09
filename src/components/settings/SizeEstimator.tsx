import type { FC } from 'react';
import { ConversionSettings, VideoMetadata } from '../../types';
import { calculateBitratesAndEstimates } from '../../services/media/bitrateCalc';
import { formatBytes } from '../../utils/formatters';
import { TrendingDown, Sparkles } from 'lucide-react';

interface SizeEstimatorProps {
  settings: ConversionSettings;
  source?: VideoMetadata;
}

export const SizeEstimator: FC<SizeEstimatorProps> = ({ settings, source }) => {
  const calc = calculateBitratesAndEstimates(settings, source);
  const originalSize = source?.size || 100 * 1024 * 1024;
  const estimatedSize = calc.estimatedSizeBytes;

  const savedBytes = Math.max(0, originalSize - estimatedSize);
  const reductionPercent = Math.min(99, Math.max(0, Math.round((savedBytes / originalSize) * 100)));

  return (
    <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Estimated Output
        </span>
        {settings.qualityMode === 'quality' && (
          <span className="text-[11px] text-slate-400 italic">Actual size may differ</span>
        )}
      </div>

      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            ≈ {formatBytes(estimatedSize)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            Original: <span className="text-slate-300 font-medium">{formatBytes(originalSize)}</span>
          </div>
        </div>

        {reductionPercent > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <TrendingDown className="w-4 h-4 shrink-0" />
            <div className="text-right">
              <span className="text-sm font-bold">{reductionPercent}%</span>
              <span className="text-[10px] block text-emerald-400/80 -mt-0.5">reduction</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
