/** AAC channel count comes from AudioSpecificConfig, not the MP4 sample-entry channel field. */
export function readAacChannels(data: Uint8Array): number | undefined {
  let bit = 0;
  const read = (count: number): number => {
    if (bit + count > data.length * 8) throw new Error('Truncated AAC configuration.');
    let value = 0;
    for (let i = 0; i < count; i++, bit++) value = value * 2 + ((data[bit >> 3] >> (7 - (bit & 7))) & 1);
    return value;
  };
  try {
    const object = read(5);
    if (object === 31) read(6);
    if (read(4) === 15) read(24);
    const configuration = read(4);
    // HE-AAC v2 parametric stereo can have a mono core with stereo output.
    if (object === 29 && configuration === 1) return 2;
    return [undefined, 1, 2, 3, 4, 5, 6, 8][configuration];
  } catch { return undefined; }
}

export function readAacEsds(data: Uint8Array): { channels?: number; bitrate?: number } {
  const result: { channels?: number; bitrate?: number } = {};
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const descriptors = (start: number, end: number, depth: number) => {
    if (depth > 4) return;
    let offset = start;
    while (offset + 2 <= end) {
      const tag = data[offset++];
      let length = 0;
      let complete = false;
      for (let i = 0; i < 4 && offset < end; i++) {
        const byte = data[offset++];
        length = length * 128 + (byte & 127);
        if (!(byte & 128)) { complete = true; break; }
      }
      const limit = offset + length;
      if (!complete || limit > end) return;
      if (tag === 3 && length >= 3) {
        const flags = data[offset + 2];
        let child = offset + 3;
        if (flags & 128) child += 2;
        if (flags & 64 && child < limit) child += 1 + data[child];
        if (flags & 32) child += 2;
        descriptors(child, limit, depth + 1);
      } else if (tag === 4 && length >= 13) {
        const bitrate = view.getUint32(offset + 9);
        if (bitrate > 0) result.bitrate = bitrate;
        descriptors(offset + 13, limit, depth + 1);
      } else if (tag === 5) {
        result.channels = readAacChannels(data.subarray(offset, limit));
      }
      offset = limit;
    }
  };
  // esds payload begins with four version/flags bytes.
  descriptors(4, data.length, 0);
  return result;
}
