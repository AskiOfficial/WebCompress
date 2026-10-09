import { useState, type FC } from 'react';
import { ShieldCheck, Cpu, Film } from 'lucide-react';
import { BrowserCapabilities } from '../../types';
import { SystemSupportModal } from '../system/SystemSupportModal';

interface HeaderProps {
  capabilities: BrowserCapabilities | null;
}

export const Header: FC<HeaderProps> = ({ capabilities }) => {
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  return (
    <>
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Product Title */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">
                  WebCompress
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Local
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Browser-based HandBrake alternative
              </p>
            </div>
          </div>

          {/* Privacy badge and Capabilities trigger */}
          <div className="flex items-center space-x-3">
            {/* Privacy Badge */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-medium shadow-xs">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="font-semibold">100% local processing</span>
              <span className="text-emerald-500/60 hidden md:inline">•</span>
              <span className="text-emerald-400/90 hidden md:inline text-[11px]">
                Your videos never leave your device
              </span>
            </div>

            {/* System Support modal button */}
            <button
              onClick={() => setIsSupportModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
              title="Inspect browser processing capabilities"
              aria-label="System support"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">System Support</span>
            </button>
          </div>
        </div>
      </header>

      <SystemSupportModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        capabilities={capabilities}
      />
    </>
  );
};
