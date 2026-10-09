import { useEffect, useState } from 'react';
import type { ConversionSettings, VideoMetadata } from '../types';
import { calculateBitratesAndEstimates, getTargetDimensions, getTargetFps } from '../services/media/bitrateCalc';
import { checkHardwareEncodingSupport, HardwareEncodingSupport } from '../services/webcodecs/hardwareSupport';

export function useHardwareEncodingSupport(settings: ConversionSettings, source?: VideoMetadata) {
  const { width, height } = getTargetDimensions(settings, source);
  const fps = getTargetFps(settings, source);
  const bitrate = calculateBitratesAndEstimates(settings, source).videoBitrateBps;
  const key = JSON.stringify([
    settings.videoCodec,
    settings.format,
    width,
    height,
    fps,
    bitrate,
    settings.qualityValue,
    settings.qualityMode,
    settings.targetSizeMb,
    settings.customVideoBitrateKbps,
    source?.width,
    source?.height,
    source?.duration,
  ]);
  const [checked, setChecked] = useState<{ key: string; result: HardwareEncodingSupport } | null>(null);

  useEffect(() => {
    let active = true;
    // Debounce slider changes, and discard stale async checks when settings change.
    const timer = setTimeout(() => {
      void checkHardwareEncodingSupport(settings, source).then(
        (result) => {
          if (active) setChecked({ key, result });
        },
        () => {
          if (active) setChecked({ key, result: { supported: false } });
        }
      );
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key]);

  return checked?.key === key ? checked.result : null;
}
