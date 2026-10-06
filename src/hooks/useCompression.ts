import { useState, useCallback, useRef } from 'react';
import { 
  CompressionResult, 
  ConversionSettings, 
  ProcessingProgress, 
  ProcessingStage, 
  VideoMetadata 
} from '../types';
import { mediaEngine } from '../services/mediaEngine';
import { MediaProcessingError } from '../services/mediaError';

export function useCompression() {
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [stageMessage, setStageMessage] = useState<string>('');
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  const activeResultUrlRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    if (activeResultUrlRef.current) {
      URL.revokeObjectURL(activeResultUrlRef.current);
      activeResultUrlRef.current = null;
    }
    setStage('idle');
    setStageMessage('');
    setProgress(null);
    setResult(null);
    setError(null);
    setErrorDetails(null);
  }, []);

  const cancelCompression = useCallback(async () => {
    try {
      await mediaEngine.cancel();
    } catch {
      // Ignore
    }
    setStage('cancelled');
    setStageMessage('Compression was cancelled.');
  }, []);

  const startCompression = useCallback(
    async (file: File, settings: ConversionSettings, metadata: VideoMetadata) => {
      // Reset previous result if any
      if (activeResultUrlRef.current) {
        URL.revokeObjectURL(activeResultUrlRef.current);
        activeResultUrlRef.current = null;
      }

      setResult(null);
      setError(null);
      setErrorDetails(null);
      setStage('initializing');
      setStageMessage('Preparing engine...');

      setProgress({
        stage: 'initializing',
        percent: 0,
        elapsedMs: 0,
        activeEngine: settings.processingMode === 'hardware' ? 'webcodecs' : 'ffmpeg-st',
        hardwareAccelerated: false,
      });

      try {
        const compressionResult = await mediaEngine.process(file, settings, metadata, {
          onProgress: (p) => {
            setProgress(p);
            setStage(p.stage);
          },
          onStage: (s, msg) => {
            setStage(s);
            setStageMessage(msg);
          },
        });

        activeResultUrlRef.current = compressionResult.outputUrl;
        setResult(compressionResult);
        setStage('completed');
        setStageMessage('Compression finished successfully!');
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        
        if (errorMsg.includes('cancelled')) {
          setStage('cancelled');
          setStageMessage('Compression was cancelled.');
        } else {
          setStage('error');
          setError(err instanceof MediaProcessingError ? err.message : 'Failed to compress video. Encoding was stopped; the processing engine was not changed.');
          setErrorDetails(err instanceof MediaProcessingError ? err.technicalDetails ?? null : errorMsg);
        }
      }
    },
    []
  );

  return {
    stage,
    stageMessage,
    progress,
    result,
    error,
    errorDetails,
    isProcessing: ['initializing', 'probing', 'demuxing', 'encoding', 'muxing', 'finalizing'].includes(stage),
    startCompression,
    cancelCompression,
    reset,
  };
}
