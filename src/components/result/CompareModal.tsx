import { useState, type FC } from 'react';
import { CompressionResult, VideoMetadata } from '../../types';
import { formatBytes, formatDuration } from '../../utils/formatters';
import { VideoPlayer } from '../video/VideoPlayer';
import { X, Layers } from 'lucide-react';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: VideoMetadata;
  result: CompressionResult;
}

export const CompareModal: FC<CompareModalProps> = ({
  isOpen,
  onClose,
  metadata,
  result,
}) => {
  const [activeTab, setActiveTab] = useState<'both' | 'original' | 'compressed'>('both');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl overflow-y-auto max-h-[92vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 id="compare-modal-title" className="text-base sm:text-lg font-bold text-white">
                Quality Comparison
              </h2>
              <p className="text-xs text-slate-400">
                Inspect visual fidelity between original and compressed output
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switcher */}
            <div className="hidden sm:flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('both')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'both' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Side by Side
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('original')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'original' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('compressed')}
                className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
                  activeTab === 'compressed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Compressed
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Comparison Grid */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Original Video */}
          {(activeTab === 'both' || activeTab === 'original') && (
            <div className={`space-y-2.5 ${activeTab === 'original' ? 'col-span-2' : ''}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span> Original Video
                </span>
                <span className="text-slate-400 font-mono">
                  {formatBytes(result.originalSizeBytes)} • {metadata.width}×{metadata.height}
                </span>
              </div>
              <VideoPlayer src={metadata.objectUrl} title="Original video" />
            </div>
          )}

          {/* Compressed Video */}
          {(activeTab === 'both' || activeTab === 'compressed') && (
            <div className={`space-y-2.5 ${activeTab === 'compressed' ? 'col-span-2' : ''}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Compressed Output
                </span>
                <span className="text-emerald-400/90 font-mono font-medium">
                  {formatBytes(result.compressedSizeBytes)} • Saved {result.compressionRatioPercent}%
                </span>
              </div>
              <VideoPlayer src={result.outputUrl} title="Compressed video" />
            </div>
          )}
        </div>

        {/* Summary Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Processed locally in{' '}
            <span className="text-slate-200 font-semibold font-mono">
              {formatDuration(result.elapsedTimeMs / 1000)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition cursor-pointer"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
