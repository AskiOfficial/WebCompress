import { ShieldCheck, HardDrive, Cpu } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-slate-800/80 bg-slate-950 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero network uploads. All video rendering and compression happens strictly inside your browser sandbox.</span>
        </div>

        <div className="flex items-center space-x-4 text-slate-400">
          <span className="flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" /> FFmpeg.wasm (WASM/CPU)
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <HardDrive className="w-3.5 h-3.5 text-amber-400" /> WebCodecs (Hardware)
          </span>
        </div>
      </div>
    </footer>
  );
};
