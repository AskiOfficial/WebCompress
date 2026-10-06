import { describe, it, expect } from 'vitest';
import { 
  getCompatibleVideoCodecs, 
  getDefaultVideoCodec, 
  getCompatibleAudioCodecs, 
  getDefaultAudioCodec,
  CONTAINER_FORMATS 
} from '../src/config/codecs';
import { 
  getResolutionForPreset, 
  getFpsForPreset, 
  applyPresetToSettings, 
  createDefaultSettings,
  isPresetModified,
  PRESETS 
} from '../src/config/presets';
import { VideoMetadata } from '../src/types';

describe('Codecs and Presets configuration', () => {
  it('enforces container and video/audio codec compatibility and rejects invalid combinations', () => {
    // 1. MP4 container
    const mp4Codecs = getCompatibleVideoCodecs('mp4');
    expect(mp4Codecs).toContain('h264');
    expect(mp4Codecs).toContain('h265');
    expect(mp4Codecs).toContain('av1');
    expect(mp4Codecs).not.toContain('vp9');
    expect(getDefaultVideoCodec('mp4')).toBe('h264');
    expect(getDefaultAudioCodec('mp4')).toBe('aac');
    expect(getCompatibleAudioCodecs('mp4')).not.toContain('opus');

    // 2. WebM container
    const webmCodecs = getCompatibleVideoCodecs('webm');
    expect(webmCodecs).toContain('vp9');
    expect(webmCodecs).toContain('av1');
    expect(webmCodecs).not.toContain('h264');
    expect(webmCodecs).not.toContain('h265');
    expect(getDefaultVideoCodec('webm')).toBe('vp9');
    expect(getDefaultAudioCodec('webm')).toBe('opus');
    expect(getCompatibleAudioCodecs('webm')).not.toContain('aac');

    // 3. MKV and MOV containers
    const mkvCodecs = getCompatibleVideoCodecs('mkv');
    expect(mkvCodecs).toContain('h265');
    expect(mkvCodecs).toContain('h264');

    const movCodecs = getCompatibleVideoCodecs('mov');
    expect(movCodecs).toContain('h264');
    expect(movCodecs).toContain('h265');
    expect(movCodecs).not.toContain('vp9');
    expect(getDefaultAudioCodec('mov')).toBe('aac');

    // 4. AVI container
    expect(getDefaultAudioCodec('avi')).toBe('mp3');
  });

  it('defaults to original resolution and original framerate for every profile', () => {
    const mockSource: VideoMetadata = {
      name: 'video.mp4',
      size: 50 * 1024 * 1024,
      type: 'video/mp4',
      duration: 30,
      width: 3840,
      height: 2160,
      fps: 60,
      aspectRatio: 16 / 9,
      objectUrl: 'blob:test',
      file: new File([], 'video.mp4'),
    };

    // Every profile must preserve original resolution and framerate by default
    for (const preset of PRESETS) {
      expect(getResolutionForPreset(preset.id, mockSource)).toBe('original');
      expect(getFpsForPreset(preset.id, mockSource)).toBe('original');

      const initialSettings = createDefaultSettings(mockSource);
      const applied = applyPresetToSettings(initialSettings, preset.id, mockSource);
      expect(applied.resolution).toBe('original');
      expect(applied.fps).toBe('original');
    }
  });

  it('applies presets correctly according to product specifications (Discord, Email, Small, Balanced, High Quality, Web)', () => {
    const defaults = createDefaultSettings();

    // 1. Discord preset
    const discord = applyPresetToSettings(defaults, 'discord');
    expect(discord.preset).toBe('discord');
    expect(discord.qualityMode).toBe('target_size');
    expect(discord.targetSizeMb).toBe(25);
    expect(discord.resolution).toBe('original');
    expect(discord.fps).toBe('original');

    // 2. Email preset
    const email = applyPresetToSettings(defaults, 'email');
    expect(email.preset).toBe('email');
    expect(email.qualityMode).toBe('target_size');
    expect(email.targetSizeMb).toBe(20);
    expect(email.audioBitrateKbps).toBe(96);

    // 3. Small preset
    const small = applyPresetToSettings(defaults, 'small');
    expect(small.preset).toBe('small');
    expect(small.qualityMode).toBe('quality');
    expect(small.qualityValue).toBe(35);
    expect(small.audioBitrateKbps).toBe(128);

    // 4. Balanced preset (Recommended default)
    const balanced = applyPresetToSettings(defaults, 'balanced');
    expect(balanced.preset).toBe('balanced');
    expect(balanced.qualityMode).toBe('quality');
    expect(balanced.qualityValue).toBe(65);
    expect(balanced.audioBitrateKbps).toBe(192);

    // 5. High Quality preset
    const hq = applyPresetToSettings(defaults, 'high_quality');
    expect(hq.preset).toBe('high_quality');
    expect(hq.qualityMode).toBe('quality');
    expect(hq.qualityValue).toBe(85);
    expect(hq.audioAction).toBe('keep');
    expect(hq.audioBitrateKbps).toBe(256);

    // 6. Web streaming preset
    const web = applyPresetToSettings(defaults, 'web');
    expect(web.preset).toBe('web');
    expect(web.fastStart).toBe(true);
    expect(web.qualityValue).toBe(60);
  });

  it('detects when settings diverge from a clean preset (HandBrake Modified pattern)', () => {
    const mockSource: VideoMetadata = {
      name: 'video.mp4',
      size: 50 * 1024 * 1024,
      type: 'video/mp4',
      duration: 30,
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: 16 / 9,
      objectUrl: 'blob:test',
      file: new File([], 'video.mp4'),
    };

    const cleanBalanced = applyPresetToSettings(createDefaultSettings(mockSource), 'balanced', mockSource);
    // Baseline preset must NOT be modified
    expect(isPresetModified(cleanBalanced, mockSource)).toBe(false);

    // Modifying quality slider marks preset as modified
    const modifiedQuality = { ...cleanBalanced, qualityValue: 80 };
    expect(isPresetModified(modifiedQuality, mockSource)).toBe(true);

    // Modifying resolution marks preset as modified
    const modifiedRes = { ...cleanBalanced, resolution: '720p' as const };
    expect(isPresetModified(modifiedRes, mockSource)).toBe(true);

    // Modifying format marks preset as modified
    const modifiedFormat = { ...cleanBalanced, format: 'webm' as const };
    expect(isPresetModified(modifiedFormat, mockSource)).toBe(true);

    // Modifying audio action marks preset as modified
    const modifiedAudio = { ...cleanBalanced, audioAction: 'remove' as const };
    expect(isPresetModified(modifiedAudio, mockSource)).toBe(true);

    // Re-applying clean preset clears the modified flag
    const reset = applyPresetToSettings(modifiedQuality, 'balanced', mockSource);
    expect(isPresetModified(reset, mockSource)).toBe(false);

    // Resetting when multiple fields are modified (format, codec, channels)
    const heavilyModified = {
      ...cleanBalanced,
      format: 'webm' as const,
      videoCodec: 'vp9' as const,
      audioChannels: 'mono' as const,
      bitrateMode: 'cbr' as const,
    };
    expect(isPresetModified(heavilyModified, mockSource)).toBe(true);
    const resetFromHeavy = applyPresetToSettings(heavilyModified, 'balanced', mockSource);
    expect(isPresetModified(resetFromHeavy, mockSource)).toBe(false);
    expect(resetFromHeavy.format).toBe('mp4');
    expect(resetFromHeavy.videoCodec).toBe('h264');
    expect(resetFromHeavy.audioChannels).toBe('original');

    // Preset 'custom' is never considered 'modified' (it is configured from scratch)
    const customSettings = { ...cleanBalanced, preset: 'custom' as const };
    expect(isPresetModified(customSettings, mockSource)).toBe(false);
  });

  it('provides clean preset names and badges without overlapping limit texts', () => {
    const discordDef = PRESETS.find(p => p.id === 'discord');
    expect(discordDef?.name).toBe('Discord');
    expect(discordDef?.badge).toBe('25 MB');

    const emailDef = PRESETS.find(p => p.id === 'email');
    expect(emailDef?.name).toBe('Email');
    expect(emailDef?.badge).toBe('20 MB');
  });
});
