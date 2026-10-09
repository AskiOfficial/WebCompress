import { useState, useRef, type DragEvent, type ChangeEvent, type FC } from 'react';
import { UploadCloud, Shield, FileVideo } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  isProcessing?: boolean;
}

export const DropZone: FC<DropZoneProps> = ({ onFileSelected, isProcessing }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelected(file);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelected(file);
      // Reset input value so re-selecting the same file triggers change
      e.target.value = '';
    }
  };

  const openFileDialog = () => {
    if (!isProcessing) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={openFileDialog}
      className={`relative group rounded-3xl border-2 border-dashed transition-all duration-200 cursor-pointer p-8 sm:p-14 text-center flex flex-col items-center justify-center ${
        isDragOver
          ? 'border-indigo-500 bg-indigo-500/10 scale-[1.005]'
          : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/70'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v"
        onChange={handleFileInputChange}
        className="hidden"
        aria-label="Upload video file"
      />

      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 group-hover:scale-105 group-hover:bg-indigo-600/25 transition duration-200 mb-5 shadow-lg shadow-indigo-500/10">
        <UploadCloud className="w-8 h-8" />
      </div>

      {/* Main Text */}
      <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
        Drop a video here
      </h3>
      <p className="text-sm text-slate-400 max-w-md mb-6">
        Drag and drop your file into this box or click the button below to browse from your device.
      </p>

      {/* Action button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openFileDialog();
        }}
        className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/25 cursor-pointer flex items-center gap-2 mb-6"
      >
        <FileVideo className="w-4 h-4" />
        <span>Choose video</span>
      </button>

      {/* Privacy guarantee */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6">
        <Shield className="w-3.5 h-3.5 shrink-0" />
        <span>Your video never leaves your device • 100% local processing</span>
      </div>

      {/* Supported formats */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-slate-400">
        <span className="text-slate-400">Supported formats:</span>
        {['MP4', 'MOV', 'MKV', 'WebM', 'AVI', 'M4V'].map((fmt) => (
          <span
            key={fmt}
            className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700/60"
          >
            {fmt}
          </span>
        ))}
      </div>
    </div>
  );
};
