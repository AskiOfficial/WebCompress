/**
 * Codec string and level resolution for WebCodecs VideoEncoder.
 * Generates RFC 6381 compliant codec strings matching video dimensions and framerate.
 */

export function getCodecCandidateStrings(
  codec: string,
  width = 1280,
  height = 720,
  fps = 30
): string[] {
  const samples = width * height;
  const sampleRate = samples * (fps || 30);

  switch (codec) {
    case 'h265': {
      // ITU-T H.265 / HEVC RFC 6381 syntax:
      // [fourcc].[profile_space][profile_idc].[profile_compatibility_flags].[tier][level].[constraint_flags]
      // FourCCs: 'hvc1' and 'hev1'
      // Profile: Main (1.6) and Main 10 (2.4)
      // Tier: 'L' (Main tier)
      // Constraints:
      //   - 'B0' (progressive, non-packed, frame-only)
      //   - '90' (progressive, frame-only — RFC 6381 standard in Chromium, Windows MFT, Android)
      //   - '' (omitted constraint suffix — 4-part RFC 6381 string)
      //   - '00' (zero constraint)
      
      const validLevels: string[] = [];

      if (samples <= 983_040 && sampleRate <= 33_177_600) {
        validLevels.push('L93');
      }
      if (samples <= 2_228_224 && sampleRate <= 66_846_720) {
        validLevels.push('L120');
      }
      if (samples <= 2_228_224 && sampleRate <= 133_693_440) {
        validLevels.push('L123');
      }
      if (samples <= 8_912_896 && sampleRate <= 267_386_880) {
        validLevels.push('L150');
      }
      if (samples <= 8_912_896 && sampleRate <= 534_773_760) {
        validLevels.push('L153');
      }
      validLevels.push('L156', 'L180', 'L183');

      const candidates: string[] = [];

      // Generate candidates starting with primary RFC 6381 .B0, then .90 (Windows MFT/Chromium),
      // then hev1 variants, 4-part forms without constraint suffix, and Main 10 profile.
      for (const level of validLevels) {
        // Standard .B0
        candidates.push(`hvc1.1.6.${level}.B0`);
        candidates.push(`hev1.1.6.${level}.B0`);
        // Standard .90 (Chromium Windows MFT / Edge)
        candidates.push(`hvc1.1.6.${level}.90`);
        candidates.push(`hev1.1.6.${level}.90`);
        // 4-element form without constraint byte
        candidates.push(`hvc1.1.6.${level}`);
        candidates.push(`hev1.1.6.${level}`);
        // .00 constraint byte
        candidates.push(`hvc1.1.6.${level}.00`);
        candidates.push(`hev1.1.6.${level}.00`);
      }

      // Also add Main 10 profile (2.4) candidates
      for (const level of validLevels) {
        candidates.push(`hvc1.2.4.${level}.B0`);
        candidates.push(`hev1.2.4.${level}.B0`);
        candidates.push(`hvc1.2.4.${level}.90`);
        candidates.push(`hev1.2.4.${level}.90`);
        candidates.push(`hvc1.2.4.${level}`);
        candidates.push(`hev1.2.4.${level}`);
      }

      return Array.from(new Set(candidates));
    }

    case 'h264': {
      // ITU-T H.264 / AVC
      // Level 3.1: 0x1F (up to 720p)
      // Level 4.0: 0x28 (up to 1080p @ 30fps)
      // Level 4.2: 0x2A (up to 1080p @ 60fps)
      // Level 5.1: 0x33 (up to 4K @ 30fps)
      // Level 5.2: 0x34 (up to 4K @ 60fps)
      const candidates: string[] = [];

      let primaryLevel = '28'; // 4.0
      if (samples <= 921_600 && sampleRate <= 27_648_000) {
        primaryLevel = '1F'; // 3.1
      } else if (samples <= 2_073_600 && sampleRate <= 66_846_720) {
        primaryLevel = '28'; // 4.0
      } else if (samples <= 2_073_600 && sampleRate <= 133_693_440) {
        primaryLevel = '2A'; // 4.2
      } else if (samples <= 8_294_400) {
        primaryLevel = '33'; // 5.1
      } else {
        primaryLevel = '34'; // 5.2
      }

      // Constrained Baseline (42E0)
      candidates.push(`avc1.42E0${primaryLevel}`);
      // Main Profile (4D40)
      candidates.push(`avc1.4D40${primaryLevel}`);
      // High Profile (6400)
      candidates.push(`avc1.6400${primaryLevel}`);

      // Fallback levels
      const otherLevels = ['28', '2A', '1F', '33', '34'].filter(l => l !== primaryLevel);
      for (const lvl of otherLevels) {
        candidates.push(`avc1.42E0${lvl}`);
        candidates.push(`avc1.4D40${lvl}`);
        candidates.push(`avc1.6400${lvl}`);
      }

      return Array.from(new Set(candidates));
    }

    case 'vp9': {
      // VP9: vp09.00.<level>.08
      const candidates: string[] = [];

      let primaryLevel = '40';
      if (samples <= 921_600 && sampleRate <= 27_648_000) {
        primaryLevel = '31';
      } else if (samples <= 2_073_600 && sampleRate <= 62_208_000) {
        primaryLevel = '40';
      } else if (samples <= 2_073_600) {
        primaryLevel = '41';
      } else if (samples <= 8_294_400) {
        primaryLevel = '50';
      } else {
        primaryLevel = '51';
      }

      candidates.push(`vp09.00.${primaryLevel}.08`);
      candidates.push('vp09.00.41.08');
      candidates.push('vp09.00.40.08');
      candidates.push('vp09.00.31.08');
      candidates.push('vp09.00.50.08');
      candidates.push('vp09.00.51.08');
      candidates.push('vp09.00.10.08'); // Baseline fallback

      return Array.from(new Set(candidates));
    }

    case 'av1': {
      // AV1: av01.0.<level><tier>.08
      const candidates: string[] = [];

      let primaryLevel = '08M';
      if (samples <= 921_600) {
        primaryLevel = '04M';
      } else if (samples <= 2_073_600) {
        primaryLevel = '08M';
      } else if (samples <= 8_294_400) {
        primaryLevel = '12M';
      } else {
        primaryLevel = '16M';
      }

      candidates.push(`av01.0.${primaryLevel}.08`);
      candidates.push('av01.0.08M.08');
      candidates.push('av01.0.04M.08');
      candidates.push('av01.0.12M.08');
      candidates.push('av01.0.16M.08');

      return Array.from(new Set(candidates));
    }

    default:
      return ['avc1.42E01F'];
  }
}
