import { describe, expect, it } from 'vitest';
import { readAacChannels, readAacEsds } from '../src/services/media/aacMetadata';
import { parseMp4Boxes } from '../src/services/media/mediaProbe';

function descriptor(tag: number, payload: Uint8Array) { return Buffer.concat([Buffer.from([tag, payload.length]), payload]); }
function esds(channels: number) {
  const config = Buffer.from([0x12, channels << 3]); // AAC LC, 44.1 kHz.
  const decoder = Buffer.alloc(13); decoder[0] = 0x40; decoder.writeUInt32BE(128_000, 9);
  const es = Buffer.concat([Buffer.from([0, 1, 0]), descriptor(4, Buffer.concat([decoder, descriptor(5, config)]))]);
  return Buffer.concat([Buffer.alloc(4), descriptor(3, es)]);
}
function box(type: string, payload: Uint8Array) {
  const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(type, 4);
  return Buffer.concat([header, payload]);
}
function arrayBuffer(bytes: Buffer): ArrayBuffer { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer; }

describe('AAC audio metadata', () => {
  it.each([1, 2, 6])('reads %i channels from AAC configuration', (channels) => {
    expect(readAacChannels(new Uint8Array([0x12, channels << 3]))).toBe(channels);
    expect(readAacEsds(esds(channels))).toEqual({ channels, bitrate: 128_000 });
  });

  it.each([1, 6])('overrides the nominal MP4 stereo field for %i-channel AAC', (channels) => {
    const entry = Buffer.alloc(28); entry.writeUInt16BE(2, 16); // Audio sample entry always says stereo.
    const audio = box('mp4a', Buffer.concat([entry, box('esds', esds(channels))]));
    const stsdHeader = Buffer.alloc(8); stsdHeader.writeUInt32BE(1, 4);
    const data = box('stsd', Buffer.concat([stsdHeader, audio]));
    expect(parseMp4Boxes(arrayBuffer(data))).toMatchObject({ audioChannels: channels, audioCodec: 'AAC', audioBitrate: 128_000 });
  });

  it('recognizes a video-only MP4 as having no audio', () => {
    const header = Buffer.alloc(8); header.writeUInt32BE(1, 4);
    const data = box('stsd', Buffer.concat([header, box('hvc1', Buffer.alloc(24))]));
    expect(parseMp4Boxes(arrayBuffer(data)).audioChannels).toBe(0);
  });

  it('does not guess channels from truncated configurations or descriptors', () => {
    expect(readAacChannels(new Uint8Array([0x12]))).toBeUndefined();
    expect(readAacEsds(new Uint8Array([0, 0, 0, 0, 3, 127, 1]))).toEqual({});
  });
});
