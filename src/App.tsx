import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { DropZone } from './components/dropzone/DropZone';
import { VideoInfoCard } from './components/video/VideoInfoCard';
import { SimpleSettings } from './components/settings/SimpleSettings';
import { ProcessingScreen } from './components/processing/ProcessingScreen';
import { ResultScreen } from './components/result/ResultScreen';
import { ErrorCard } from './components/common/ErrorCard';
import { useCapabilities } from './hooks/useCapabilities';
import { useCompression } from './hooks/useCompression';
import { ConversionSettings, VideoMetadata } from './types';
import { createDefaultSettings } from './config/presets';
import { probeVideoFile } from './services/media/mediaProbe';
import { Loader2 } from 'lucide-react';

export default function App() {
  const { capabilities } = useCapabilities();
  const {
    stage,
    stageMessage,
    progress,
    result,
    error,
    errorDetails,
    isProcessing,
    startCompression,
    cancelCompression,
    reset: resetCompression,
  } = useCompression();

  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [settings, setSettings] = useState<ConversionSettings>(() => createDefaultSettings());

  // Handle file selection
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    resetCompression();
    setFile(selectedFile);
    setIsProbing(true);

    try {
      const probedMetadata = await probeVideoFile(selectedFile);
      setMetadata(probedMetadata);
      // Auto configure smart defaults based on source media properties
      setSettings(createDefaultSettings(probedMetadata));
    } catch (err) {
      console.error('Error probing video file:', err);
    } finally {
      setIsProbing(false);
    }
  }, [resetCompression]);

  // Clean up object URLs on metadata change or component unmount
  useEffect(() => {
    return () => {
      if (metadata?.objectUrl) {
        URL.revokeObjectURL(metadata.objectUrl);
      }
    };
  }, [metadata]);

  const handleStartCompression = () => {
    if (!file || !metadata) return;
    startCompression(file, settings, metadata);
  };

  const handleAdjustSettings = () => {
    resetCompression();
  };

  const handleCompressAnother = () => {
    setFile(null);
    setMetadata(null);
    resetCompression();
    setSettings(createDefaultSettings());
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 selection:bg-indigo-600 selection:text-white">
      {/* Top Header */}
      <Header capabilities={capabilities} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Step 1: No file selected */}
        {!file && !isProbing && (
          <div className="max-w-3xl mx-auto space-y-8 my-auto">
            <div className="text-center space-y-3">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                Private, in-browser <br />
                <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent">
                  video compression & conversion
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-400 max-w-xl mx-auto leading-relaxed">
                Compress, resize, and convert your videos without uploading anything to the internet. Powered entirely by WebCodecs hardware acceleration and FFmpeg.wasm.
              </p>
            </div>

            <DropZone onFileSelected={handleFileSelected} />
          </div>
        )}

        {/* Step 2: Probing Media Metadata */}
        {isProbing && (
          <div className="max-w-md mx-auto my-24 p-8 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-4 shadow-xl">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
            <div>
              <h3 className="text-base font-semibold text-white">Inspecting video file...</h3>
              <p className="text-xs text-slate-400 mt-1">
                Reading resolution, framerate, and audio tracks locally
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Compression in progress */}
        {isProcessing && metadata && (
          <ProcessingScreen
            progress={progress}
            stageMessage={stageMessage}
            settings={settings}
            metadata={metadata}
            onCancel={cancelCompression}
          />
        )}

        {/* Step 4: Compression completed */}
        {!isProcessing && stage === 'completed' && result && metadata && (
          <ResultScreen
            result={result}
            metadata={metadata}
            onAdjustSettings={handleAdjustSettings}
            onCompressAnother={handleCompressAnother}
          />
        )}

        {/* Step 5: Error or Cancellation Screen */}
        {!isProcessing && (stage === 'error' || stage === 'cancelled') && (
          <ErrorCard
            message={
              stage === 'cancelled'
                ? 'Compression was successfully cancelled.'
                : error || 'An error occurred during compression.'
            }
            details={errorDetails}
            onReset={resetCompression}
          />
        )}

        {/* Step 6: File Loaded & Configurable (Idle state) */}
        {!isProcessing && stage !== 'completed' && stage !== 'error' && stage !== 'cancelled' && file && metadata && !isProbing && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-baseline justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Configure Compression
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Select a preset or customize parameters below. Files never leave your browser.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Ready for local encode</span>
              </div>
            </div>

            {/* Desktop Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Input Video & Info */}
              <div className="lg:col-span-5 space-y-6">
                <VideoInfoCard
                  metadata={metadata}
                  onChangeVideo={handleCompressAnother}
                  isProcessing={isProcessing}
                />
              </div>

              {/* Right Column: Compression Controls */}
              <div className="lg:col-span-7 space-y-6">
                <SimpleSettings
                  settings={settings}
                  onChange={setSettings}
                  source={metadata}
                  capabilities={capabilities}
                  onCompress={handleStartCompression}
                  isProcessing={isProcessing}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
}
