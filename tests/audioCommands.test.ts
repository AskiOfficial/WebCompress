import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../src/config/presets';
import { buildAudioArgs, buildFinalizeArgs } from '../src/services/ffmpeg/audioCommands';
import { VideoMetadata } from '../src/types';

describe('audio and browser-encoded video assembly', () => {
  const settings = { ...createDefaultSettings(), videoCodec: 'h265' as const };
  const source = { audioCodec: 'AAC', audioChannels: 6 } as VideoMetadata;

  it('keeps compatible source audio without another lossy encode', () => {
    expect(buildAudioArgs({ ...settings, audioAction: 'keep' }, source)).toEqual(['-c:a', 'copy']);
  });

  it('transcodes incompatible audio to AAC without altering original channel count', () => {
    const args = buildAudioArgs({ ...settings, audioAction: 'keep' }, { ...source, audioCodec: 'Opus' });
    expect(args).toContain('aac');
    expect(args).not.toContain('-ac');
  });

  it('honors 320 kbps instead of silently limiting audio to 192 kbps', () => {
    expect(buildAudioArgs({ ...settings, audioBitrateKbps: 320 }, source)).toContain('320k');
  });

  it('removes audio only when requested', () => {
    const args = buildFinalizeArgs({ ...settings, audioAction: 'remove' }, source);
    expect(args).toContain('-an');
    expect(args).not.toContain('1:a:0?');
  });

  it.each([['mono', '1'], ['stereo', '2'], ['surround51', '6']] as const)('honors %s channels', (audioChannels, channels) => {
    const args = buildAudioArgs({ ...settings, audioChannels }, source);
    expect(args[args.indexOf('-ac') + 1]).toBe(channels);
  });

  it('copies browser-encoded HEVC, retains source audio timing and does not truncate tracks', () => {
    const args = buildFinalizeArgs(settings, source);
    expect(args[args.indexOf('-c:v') + 1]).toBe('copy');
    expect(args).toContain('hvc1');
    expect(args).toContain('1:a:0?');
    expect(args).not.toContain('libx265');
    expect(args).not.toContain('-shortest');
    expect(args).toContain('-xerror');
  });
});
