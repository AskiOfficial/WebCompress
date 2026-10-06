import { useState, type FC } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface ErrorCardProps {
  message: string;
  details?: string | null;
  onReset: () => void;
}

export const ErrorCard: FC<ErrorCardProps> = ({ message, details, onReset }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-rose-950/25 border border-rose-500/30 rounded-3xl p-6 sm:p-8 max-w-xl mx-auto my-6 text-center space-y-5 animate-in fade-in duration-200">
      <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 mx-auto">
        <AlertCircle className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-lg font-bold text-white tracking-tight">
          Processing Failed
        </h3>
        <p className="text-xs sm:text-sm text-rose-300 max-w-md mx-auto leading-relaxed">
          {message}
        </p>
      </div>

      {details && (
        <div className="text-left">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1.5 text-xs text-rose-400/90 hover:text-rose-300 mx-auto font-medium transition cursor-pointer"
          >
            <span>{showDetails ? 'Hide technical details' : 'Show technical details'}</span>
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDetails && (
            <div className="mt-2.5 p-3.5 rounded-xl bg-black/60 border border-rose-900/40 text-[11px] font-mono text-slate-300 break-words whitespace-pre-wrap max-h-48 overflow-y-auto">
              {details}
            </div>
          )}
        </div>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again / Change Settings</span>
        </button>
      </div>
    </div>
  );
};
