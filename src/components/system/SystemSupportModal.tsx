import type { FC } from 'react';
import { BrowserCapabilities } from '../../types';
import { CheckCircle2, XCircle, AlertCircle, X, Cpu, Zap, HardDrive } from 'lucide-react';

interface SystemSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  capabilities: BrowserCapabilities | null;
}

export const SystemSupportModal: FC<SystemSupportModalProps> = ({
  isOpen,
  onClose,
  capabilities,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h2 id="modal-title" className="text-lg font-semibold text-slate-100">
              System & Browser Support
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <div>
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> Hardware Acceleration (WebCodecs)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <CapabilityRow 
                label="H.264 / AVC" 
                supported={capabilities?.h264Hardware ?? false} 
                note={capabilities?.h264Hardware ? 'Hardware preferred' : 'Not supported'}
              />
              <CapabilityRow 
                label="H.265 / HEVC" 
                supported={capabilities?.h265Hardware ?? false} 
                note={capabilities?.h265Hardware ? 'Hardware preferred' : 'Not supported'}
              />
              <CapabilityRow 
                label="VP9" 
                supported={capabilities?.vp9Hardware ?? false} 
                note={capabilities?.vp9Hardware ? 'Hardware preferred' : 'Not supported'}
              />
              <CapabilityRow 
                label="AV1" 
                supported={capabilities?.av1Hardware ?? false} 
                note={capabilities?.av1Hardware ? 'Hardware preferred' : 'Not supported'}
              />
              <CapabilityRow 
                label="WebCodecs API" 
                supported={capabilities?.webCodecs ?? false} 
              />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-2 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" /> CPU / WASM Processing (FFmpeg)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <CapabilityRow 
                label="WebAssembly (WASM)" 
                supported={capabilities?.webAssembly ?? true} 
              />
              <CapabilityRow 
                label="Web Workers" 
                supported={capabilities?.webWorkers ?? true} 
              />
              <CapabilityRow 
                label="Multi-Thread WASM" 
                supported={capabilities?.multithreadWasm ?? false} 
                note={capabilities?.multithreadWasm ? 'Enabled' : 'Single-thread fallback'}
              />
              <CapabilityRow 
                label="CPU Logical Cores" 
                supported={true} 
                note={`${capabilities?.hardwareConcurrency || 4} threads`}
              />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-2 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> Security & Isolation
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <CapabilityRow 
                label="Cross-Origin Isolated" 
                supported={capabilities?.crossOriginIsolated ?? false} 
              />
              <CapabilityRow 
                label="SharedArrayBuffer" 
                supported={capabilities?.sharedArrayBuffer ?? false} 
              />
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 leading-relaxed flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p>
              <strong>Auto</strong> selects the browser encoder when supported, otherwise CPU before encoding starts. Encoding errors stop the operation; they never switch video encoding to CPU. Hardware preference does not guarantee GPU use.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

function CapabilityRow({ 
  label, 
  supported, 
  note 
}: { 
  label: string; 
  supported: boolean; 
  note?: string; 
}) {
  return (
    <div className="flex items-center justify-between p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/80">
      <span className="text-xs text-slate-300 font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        {note && <span className="text-[11px] text-slate-400">{note}</span>}
        {supported ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="w-4 h-4 text-slate-500 shrink-0" />
        )}
      </div>
    </div>
  );
}
