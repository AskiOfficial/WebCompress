import { useState, type FC } from 'react';
import { CompressionResult, VideoMetadata } from '../../types';
import { formatBytes, formatDuration } from '../../utils/formatters';
import { VideoPlayer } from '../video/VideoPlayer';
import { CompareModal } from './CompareModal';
import { CheckCircle2, Download, RefreshCw, Layers, Sparkles, Zap, Cpu, Sliders } from 'lucide-react';

interface ResultScreenProps {
  result: CompressionResult;
  metadata: VideoMetadata;
  onAdjustSettings: () => void;
  onCompressAnother: () => void;
}

export const ResultScreen: FC<ResultScreenProps> = ({
  result,
  metadata,
  onAdjustSettings,
  onCompressAnother,
}) => {
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const savedBytes = Math.max(0, result.originalSizeBytes - result.compressedSizeBytes);
  const isHardware = result.hardwareAccelerated || result.engineUsed === 'webcodecs';

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = result.outputUrl;
    a.download = result.outputFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-9 shadow-2xl space-y-7 max-w-4xl mx-auto my-6 animate-in fade-in duration-200">
        {/* Success Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Compression Complete
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Ready
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Successfully processed 100% locally on your computer.
              </p>
            </div>
          </div>

          {/* Engine indicator */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
            {isHardware ? (
              <>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-medium">{result.hardwarePreferred ? 'Hardware preferred' : 'Browser encoding (WebCodecs)'}</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-medium">
                  {result.engineUsed === 'ffmpeg-mt' ? 'CPU Multi-Thread' : 'CPU Single-Thread'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Compression Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
              Original Size
            </span>
            <span className="text-lg sm:text-xl font-bold text-slate-300 font-mono mt-1 block">
              {formatBytes(result.originalSizeBytes)}
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
              Compressed Size
            </span>
            <span className="text-lg sm:text-xl font-bold text-white font-mono mt-1 block">
              {formatBytes(result.compressedSizeBytes)}
            </span>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4">
            <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider block">
              Storage Saved
            </span>
            <span className="text-lg sm:text-xl font-bold text-emerald-300 font-mono mt-1 block">
              {formatBytes(savedBytes)} ({result.compressionRatioPercent}%)
            </span>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
              Processing Time
            </span>
            <span className="text-lg sm:text-xl font-bold text-slate-300 font-mono mt-1 block">
              {formatDuration(result.elapsedTimeMs / 1000)}
            </span>
          </div>
        </div>

        {/* Compressed Video Player Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Output Preview
            </span>
            <button
              type="button"
              onClick={() => setIsCompareOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Compare with Original</span>
            </button>
          </div>

          <VideoPlayer src={result.outputUrl} title="Compressed Output Preview" />
        </div>

        {/* Action Buttons: Download, Adjust same file, or Pick new file */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white font-bold text-base transition shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Download className="w-5 h-5" />
            <span>Download Video</span>
          </button>

          <button
            type="button"
            onClick={onAdjustSettings}
            className="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer border border-slate-700/60"
            title="Keep this video and adjust compression parameters"
          >
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Adjust Settings / Re-compress</span>
          </button>

          <button
            type="button"
            onClick={onCompressAnother}
            className="w-full sm:w-auto py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-medium text-xs transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-800"
            title="Start fresh with a different video file"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>New File</span>
          </button>
        </div>
      </div>

      <CompareModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        metadata={metadata}
        result={result}
      />
    </>
  );
};
