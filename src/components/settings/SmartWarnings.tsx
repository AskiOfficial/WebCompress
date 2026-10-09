import type { FC } from 'react';
import { BrowserCapabilities, ConversionSettings, VideoMetadata } from '../../types';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps } from '../../services/media/bitrateCalc';
import { formatFps } from '../../utils/formatters';
import { AlertTriangle, Info } from 'lucide-react';

interface SmartWarningsProps {
  settings: ConversionSettings;
  source?: VideoMetadata;
  capabilities: BrowserCapabilities | null;
}

export const SmartWarnings: FC<SmartWarningsProps> = ({
  settings,
  source,
  capabilities,
}) => {
  const warnings: { id: string; type: 'warning' | 'info'; text: string }[] = [];

  const targetDim = getTargetDimensions(settings, source);
  const targetFps = getTargetFps(settings, source);
  const sourceHeight = source?.height || 1080;
  const sourceWidth = source?.width || 1920;
  const sourceFps = source?.fps ? source.fps : 30;

  // 1. Upscaling warning
  if (targetDim.height > sourceHeight || targetDim.width > sourceWidth) {
    warnings.push({
      id: 'upscale',
      type: 'warning',
      text: `Selected resolution (${targetDim.width}×${targetDim.height}) is larger than source (${sourceWidth}×${sourceHeight}). Upscaling increases file size without creating new detail.`,
    });
  }

  // 2. Already low-res warning
  if (sourceHeight <= 720 && targetDim.height < sourceHeight && targetDim.height <= 480) {
    warnings.push({
      id: 'low-res',
      type: 'info',
      text: 'Source is already 720p or lower — reducing resolution further to 480p will noticeably blur visual detail.',
    });
  }

  // 3. Framerate increase warning
  if (targetFps > Math.round(sourceFps) + 1 && settings.fps !== 'original') {
    warnings.push({
      id: 'fps-increase',
      type: 'warning',
      text: `Increasing FPS from ${formatFps(sourceFps)} to ${formatFps(targetFps)} creates duplicated frames and increases file size without adding real motion detail.`,
    });
  }

  // 4. Target size bitrate calculation warning
  if (settings.qualityMode === 'target_size') {
    const calc = calculateBitratesAndEstimates(settings, source);
    if (calc.isTooLow && calc.warningMessage) {
      warnings.push({
        id: 'target-too-low',
        type: 'warning',
        text: calc.warningMessage,
      });
    }
  }

  // 5. AV1 encoding support & speed note
  if (settings.videoCodec === 'av1') {
    const hasAv1 = capabilities?.av1Hardware || capabilities?.av1Software;
    if (!hasAv1) {
      warnings.push({
        id: 'av1-no-encoder',
        type: 'warning',
        text: 'Your browser/device lacks WebCodecs AV1 encoder support (and FFmpeg WASM cannot encode AV1 in CPU mode). Please select H.264, H.265, or VP9 for guaranteed local encoding.',
      });
    } else {
      warnings.push({
        id: 'av1-speed',
        type: 'info',
        text: 'AV1 provides cutting-edge compression efficiency and will encode via your browser’s WebCodecs engine.',
      });
    }
  }

  // 6. Hardware mode unsupported warning
  if (settings.processingMode === 'hardware') {
    const isH264Hw = settings.videoCodec === 'h264' && !capabilities?.h264Hardware;
    const isH265Hw = settings.videoCodec === 'h265' && !capabilities?.h265Hardware;
    const isVp9Hw = settings.videoCodec === 'vp9' && !capabilities?.vp9Hardware;
    const isAv1Hw = settings.videoCodec === 'av1' && !capabilities?.av1Hardware;

    if (isH264Hw || isH265Hw || isVp9Hw || isAv1Hw) {
      warnings.push({
        id: 'hw-unsupported',
        type: 'warning',
        text: `Hardware acceleration is not supported for ${settings.videoCodec.toUpperCase()} on this browser. Auto mode or CPU mode is recommended.`,
      });
    }
  }

  // 7. Explicit single-thread selection applies to all CPU codecs.
  if (settings.cpuThreads === 1 && settings.processingMode !== 'hardware') {
    warnings.push({
      id: 'one-thread-warning',
      type: 'warning',
      text: 'CPU threads is explicitly set to 1. Single-threaded WASM encoding is very slow for high-resolution video. Auto threads is recommended.',
    });
  }

  // 8. Single thread fallback notice if isolation is inactive
  if (
    settings.processingMode !== 'hardware' &&
    (settings.cpuThreads !== 1 || settings.videoCodec === 'h265') &&
    capabilities &&
    !capabilities.multithreadWasm
  ) {
    warnings.push({
      id: 'single-thread',
      type: settings.videoCodec === 'h265' ? 'warning' : 'info',
      text: settings.videoCodec === 'h265'
        ? 'H.265 CPU encoding requires browser isolation and shared memory. Select H.264 or VP9, or use a supported browser encoder.'
        : 'Shared memory or browser isolation is unavailable; CPU encoding will use the single-thread engine.',
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      {warnings.map((w) => (
        <div
          key={w.id}
          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs leading-relaxed ${
            w.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
              : 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300'
          }`}
        >
          {w.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
          )}
          <span>{w.text}</span>
        </div>
      ))}
    </div>
  );
};
