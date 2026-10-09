import { VideoMetadata } from '../../types';
import { readAacEsds } from './aacMetadata';

export interface ProbedContainerInfo {
  audioChannels?: number;
  audioCodec?: string;
  audioBitrate?: number;
  videoCodec?: string;
  fps?: number;
}

/**
 * Normalizes detected raw framerate to standard digital video rates (e.g. 23.976, 24, 29.97, 30, 59.94, 60, etc.)
 */
export function normalizeFps(rawFps: number): number {
  if (!rawFps || isNaN(rawFps) || !isFinite(rawFps) || rawFps <= 0) {
    return 30;
  }

  // Standard frame rates in digital video
  const standardRates = [
    23.976,
    24,
    25,
    29.97,
    30,
    48,
    50,
    59.94,
    60,
    119.88,
    120,
    144,
    240,
  ];

  let closestRate = standardRates[0];
  let minDiff = Math.abs(rawFps - standardRates[0]);

  for (let i = 1; i < standardRates.length; i++) {
    const diff = Math.abs(rawFps - standardRates[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closestRate = standardRates[i];
    }
  }

  // If within 0.01 of the closest standard rate, snap to it
  if (minDiff < 0.01) {
    return closestRate;
  }

  // If very close to any integer (e.g. 15.001)
  const nearestInt = Math.round(rawFps);
  if (Math.abs(rawFps - nearestInt) < 0.01) {
    return nearestInt;
  }

  // Otherwise round to two decimal places
  return Math.round(rawFps * 100) / 100;
}

export async function probeVideoFile(file: File): Promise<VideoMetadata> {
  const objectUrl = URL.createObjectURL(file);
  const containerMeta = await probeContainerMetadata(file);

  return new Promise<VideoMetadata>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    const timeoutId = setTimeout(() => {
      cleanup();
      // If HTML5 video times out (e.g. container like MKV/AVI not supported natively by browser)
      resolve(createBasicMetadata(file, objectUrl, containerMeta));
    }, 6000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = async () => {
      cleanup();
      
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      const duration = video.duration && !isNaN(video.duration) && isFinite(video.duration) ? video.duration : 1;
      const aspectRatio = width / (height || 1);
      
      // Calculate average total bitrate in bps
      const totalBitrate = Math.round((file.size * 8) / duration);
      
      // Guess codec from extension / type for display if not probed from container
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let guessedVideoCodec = containerMeta.videoCodec || 'H.264';
      let guessedAudioCodec = containerMeta.audioCodec || 'AAC';

      if (!containerMeta.videoCodec) {
        if (ext === 'webm') {
          guessedVideoCodec = 'VP9';
        } else if (ext === 'mkv') {
          guessedVideoCodec = 'H.264 / HEVC';
        } else if (ext === 'avi') {
          guessedVideoCodec = 'MPEG-4';
        }
      }

      if (!containerMeta.audioCodec) {
        if (ext === 'webm') {
          guessedAudioCodec = 'Opus';
        } else if (ext === 'mkv') {
          guessedAudioCodec = 'AAC / AC3';
        } else if (ext === 'avi') {
          guessedAudioCodec = 'MP3';
        }
      }

      // Determine framerate from container metadata or video element fallback
      let fps = containerMeta.fps;
      if (!fps && typeof video.requestVideoFrameCallback === 'function') {
        try {
          fps = await detectFpsFromVideoElement(video);
        } catch {
          // Ignore
        }
      }
      if (!fps) {
        fps = 30; // Fallback default
      }

      const metadata: VideoMetadata = {
        name: file.name,
        size: file.size,
        type: file.type || `video/${ext}`,
        duration,
        width,
        height,
        fps,
        videoCodec: guessedVideoCodec,
        videoBitrate: Math.max(100_000, totalBitrate - 192_000),
        audioCodec: guessedAudioCodec,
        audioBitrate: containerMeta.audioBitrate,
        audioChannels: containerMeta.audioChannels,
        aspectRatio,
        objectUrl,
        file,
      };

      resolve(metadata);
    };

    video.onerror = () => {
      cleanup();
      // Even if HTML5 video tag cannot decode MKV or AVI natively,
      // provide basic file info with probed container info so FFmpeg can handle it!
      resolve(createBasicMetadata(file, objectUrl, containerMeta));
    };
  });
}

function createBasicMetadata(file: File, objectUrl: string, containerMeta?: ProbedContainerInfo): VideoMetadata {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const fps = containerMeta?.fps || 30;
  return {
    name: file.name,
    size: file.size,
    type: file.type || `video/${ext}`,
    duration: 60, // Fallback duration until FFmpeg probes it
    width: 1920,
    height: 1080,
    fps,
    videoCodec: containerMeta?.videoCodec || ext.toUpperCase(),
    videoBitrate: Math.round((file.size * 8) / 60),
    audioCodec: containerMeta?.audioCodec || 'Unknown',
    audioBitrate: containerMeta?.audioBitrate,
    audioChannels: containerMeta?.audioChannels,
    aspectRatio: 16 / 9,
    objectUrl,
    file,
  };
}

/**
 * Attempts to detect framerate using requestVideoFrameCallback on HTML5 video element
 */
async function detectFpsFromVideoElement(video: HTMLVideoElement): Promise<number | undefined> {
  if (typeof video.requestVideoFrameCallback !== 'function') return undefined;

  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    let isDone = false;

    const cleanup = () => {
      if (isDone) return;
      isDone = true;
      clearTimeout(timer);
      try {
        video.pause();
        video.currentTime = 0;
      } catch {}
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, 500);

    const onFrame = (_now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => {
      if (isDone) return;
      frameTimes.push(metadata.mediaTime);
      if (frameTimes.length >= 3) {
        cleanup();
        const deltas: number[] = [];
        for (let i = 1; i < frameTimes.length; i++) {
          const delta = frameTimes[i] - frameTimes[i - 1];
          if (delta > 0.002 && delta < 0.2) {
            deltas.push(delta);
          }
        }
        if (deltas.length > 0) {
          const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          resolve(normalizeFps(1 / avgDelta));
        } else {
          resolve(undefined);
        }
      } else {
        video.requestVideoFrameCallback(onFrame);
      }
    };

    video.requestVideoFrameCallback(onFrame);
    video.muted = true;
    video.play().catch(() => {
      cleanup();
      resolve(undefined);
    });
  });
}

export async function probeContainerMetadata(file: File): Promise<ProbedContainerInfo> {
  let result: ProbedContainerInfo = {};
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  try {
    // 1. For MP4 / MOV / M4V / QuickTime: scan for moov box and tracks
    if (ext === 'mp4' || ext === 'mov' || ext === 'm4v' || file.type.includes('mp4') || file.type.includes('quicktime')) {
      const moovBuffer = await findAndReadMp4Moov(file);
      if (moovBuffer) {
        result = parseMp4Boxes(moovBuffer);
      }
    }
    // 2. For WebM / MKV: scan EBML
    else if (ext === 'webm' || ext === 'mkv' || file.type.includes('webm') || file.type.includes('matroska')) {
      const sliceSize = Math.min(file.size, 2 * 1024 * 1024);
      const buffer = await file.slice(0, sliceSize).arrayBuffer();
      result = parseEbmlMetadata(buffer);
    }
    // 3. For AVI: scan RIFF / hdrl
    else if (ext === 'avi' || file.type.includes('avi')) {
      const sliceSize = Math.min(file.size, 256 * 1024);
      const buffer = await file.slice(0, sliceSize).arrayBuffer();
      result = parseAviMetadata(buffer);
    }
  } catch (err) {
    console.debug('Container metadata probe non-fatal notice:', err);
  }

  // 4. Fallback: Web Audio API decodeAudioData if still undefined and file is small enough
  if (result.audioChannels === undefined && file.size <= 32 * 1024 * 1024 && typeof window !== 'undefined') {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        try {
          const buf = await file.slice(0).arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(buf);
          if (audioBuf.numberOfChannels > 0) result.audioChannels = audioBuf.numberOfChannels;
        } finally { await ctx.close(); }
      }
    } catch {
      // Ignore non-fatal audio probe failures
    }
  }

  return result;
}

/**
 * Accurately finds and reads the moov box from an MP4/MOV file,
 * whether it is at the start, middle, or end of the file.
 */
export async function findAndReadMp4Moov(file: File): Promise<ArrayBuffer | null> {
  const headSize = Math.min(file.size, 512 * 1024);
  const headBuffer = await file.slice(0, headSize).arrayBuffer();
  const headView = new DataView(headBuffer);

  let offset = 0;
  let moovOffset: number | null = null;
  let moovSize: number | null = null;

  while (offset + 8 <= headBuffer.byteLength) {
    const size = headView.getUint32(offset);
    let type = '';
    for (let i = 0; i < 4; i++) {
      type += String.fromCharCode(headView.getUint8(offset + 4 + i));
    }

    let actualSize = size;
    if (size === 1 && offset + 16 <= headBuffer.byteLength) {
      actualSize = Number(headView.getBigUint64(offset + 8));
    }

    if (type === 'moov') {
      moovOffset = offset;
      moovSize = actualSize === 0 ? file.size - offset : actualSize;
      break;
    }

    if (actualSize === 0 || size === 0) {
      break;
    }

    if (type === 'mdat') {
      const nextOffset = offset + actualSize;
      if (nextOffset + 8 <= file.size) {
        try {
          const nextHeaderBuf = await file.slice(nextOffset, nextOffset + 16).arrayBuffer();
          const nextView = new DataView(nextHeaderBuf);
          if (nextView.byteLength >= 8) {
            let nextType = '';
            for (let i = 0; i < 4; i++) {
              nextType += String.fromCharCode(nextView.getUint8(4 + i));
            }
            if (nextType === 'moov') {
              let nextSize = nextView.getUint32(0);
              if (nextSize === 1 && nextView.byteLength >= 16) {
                nextSize = Number(nextView.getBigUint64(8));
              }
              moovOffset = nextOffset;
              moovSize = nextSize === 0 ? file.size - nextOffset : nextSize;
              break;
            }
          }
        } catch {
          // Ignore
        }
      }
    }

    offset += actualSize;
  }

  if (moovOffset !== null && moovSize !== null) {
    const readSize = Math.min(moovSize, 16 * 1024 * 1024);
    return await file.slice(moovOffset, moovOffset + readSize).arrayBuffer();
  }

  // If moov was not found in head or via mdat offset, search file tail (last 4MB)
  if (file.size > headSize) {
    const tailReadSize = Math.min(file.size, 4 * 1024 * 1024);
    const tailStart = file.size - tailReadSize;
    const tailBuffer = await file.slice(tailStart, file.size).arrayBuffer();
    const u8 = new Uint8Array(tailBuffer);

    for (let i = 4; i < u8.length - 4; i++) {
      if (u8[i] === 0x6d && u8[i + 1] === 0x6f && u8[i + 2] === 0x6f && u8[i + 3] === 0x76) {
        const foundMoovFileOffset = tailStart + (i - 4);
        return await file.slice(foundMoovFileOffset, file.size).arrayBuffer();
      }
    }
  }

  return headBuffer;
}

export function parseMp4Boxes(buffer: ArrayBuffer): ProbedContainerInfo {
  const view = new DataView(buffer);
  let audioChannels: number | undefined;
  let audioCodec: string | undefined;
  let audioBitrate: number | undefined;
  let videoCodec: string | undefined;
  let fps: number | undefined;

  function readString(offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      if (offset + i < view.byteLength) {
        str += String.fromCharCode(view.getUint8(offset + i));
      }
    }
    return str;
  }

  let currentHandler = '';
  let currentTimescale = 0;
  let currentDuration = 0;

  function scanAtoms(start: number, end: number) {
    let offset = start;
    while (offset + 8 <= end) {
      const size = view.getUint32(offset);
      const type = readString(offset + 4, 4);
      const atomEnd = size === 1 && offset + 16 <= end
        ? offset + Number(view.getBigUint64(offset + 8))
        : (size === 0 ? end : offset + size);

      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) {
        if (type === 'trak') {
          currentHandler = '';
          currentTimescale = 0;
          currentDuration = 0;
        }
        const headerSize = size === 1 ? 16 : 8;
        scanAtoms(offset + headerSize, Math.min(atomEnd, end));
      } else if (type === 'hdlr') {
        if (offset + 20 <= atomEnd) {
          currentHandler = readString(offset + 16, 4).toLowerCase();
        }
      } else if (type === 'mdhd') {
        if (offset + 12 <= atomEnd) {
          const version = view.getUint8(offset + 8);
          if (version === 0 && offset + 28 <= atomEnd) {
            currentTimescale = view.getUint32(offset + 20);
            currentDuration = view.getUint32(offset + 24);
          } else if (version === 1 && offset + 40 <= atomEnd) {
            currentTimescale = view.getUint32(offset + 28);
            currentDuration = Number(view.getBigUint64(offset + 32));
          }
        }
      } else if (type === 'stts') {
        // Time to Sample: gives framerate for video track
        if ((currentHandler === 'vide' || !currentHandler) && !fps) {
          if (offset + 16 <= atomEnd) {
            const entryCount = view.getUint32(offset + 12);
            let totalSamples = 0;
            let totalDelta = 0;
            const maxEntries = Math.min(entryCount, 10000);
            for (let i = 0; i < maxEntries; i++) {
              const entryOffset = offset + 16 + i * 8;
              if (entryOffset + 8 <= atomEnd) {
                const sampleCount = view.getUint32(entryOffset);
                const sampleDelta = view.getUint32(entryOffset + 4);
                totalSamples += sampleCount;
                totalDelta += sampleCount * sampleDelta;
              }
            }
            if (totalDelta > 0 && currentTimescale > 0) {
              const rawFps = (totalSamples * currentTimescale) / totalDelta;
              fps = normalizeFps(rawFps);
            }
          }
        }
      } else if (type === 'stsz') {
        // Fallback for FPS if stts was empty/missing
        if ((currentHandler === 'vide' || !currentHandler) && !fps) {
          if (offset + 20 <= atomEnd) {
            const sampleCount = view.getUint32(offset + 16);
            if (sampleCount > 0 && currentDuration > 0 && currentTimescale > 0) {
              const durationSec = currentDuration / currentTimescale;
              if (durationSec > 0) {
                const rawFps = sampleCount / durationSec;
                fps = normalizeFps(rawFps);
              }
            }
          }
        }
      } else if (type === 'trex') {
        // Fragmented MP4 default sample duration
        if (!fps && offset + 28 <= atomEnd && currentTimescale > 0) {
          const defaultSampleDuration = view.getUint32(offset + 24);
          if (defaultSampleDuration > 0) {
            fps = normalizeFps(currentTimescale / defaultSampleDuration);
          }
        }
      } else if (type === 'stsd') {
        const headerSize = 16;
        let entryOffset = offset + headerSize;
        while (entryOffset + 8 <= Math.min(atomEnd, end)) {
          const entrySize = view.getUint32(entryOffset);
          if (entrySize < 8) break;
          const entryType = readString(entryOffset + 4, 4);
          const lower = entryType.toLowerCase();

          if (['mp4a', 'ac-3', 'ec-3', 'opus', 'alac', 'flac', 'samr', 'sawb'].includes(lower)) {
            audioCodec = lower === 'mp4a' ? 'AAC' : entryType.toUpperCase();
            if (entryOffset + 26 <= end) {
              const channels = view.getUint16(entryOffset + 24);
              if (channels > 0 && channels <= 16) {
                audioChannels = channels;
              }
            }
            if (lower === 'mp4a' && entryOffset + 36 <= Math.min(atomEnd, end)) {
              const version = view.getUint16(entryOffset + 16);
              const scanAudioBoxes = (start: number, limit: number) => {
                for (let child = start; child + 8 <= limit;) {
                  const size = view.getUint32(child);
                  if (size < 8 || child + size > limit) break;
                  const type = readString(child + 4, 4);
                  if (type === 'esds') {
                    const aac = readAacEsds(new Uint8Array(buffer, child + 8, size - 8));
                    audioChannels = aac.channels ?? audioChannels;
                    audioBitrate = aac.bitrate;
                  } else if (type === 'wave') scanAudioBoxes(child + 8, child + size);
                  child += size;
                }
              };
              scanAudioBoxes(entryOffset + (version === 1 ? 52 : version === 2 ? 72 : 36), Math.min(entryOffset + entrySize, atomEnd, end));
            }
          } else if (['avc1', 'avc3', 'hvc1', 'hev1', 'vp09', 'av01', 'mp4v'].includes(lower)) {
            if (lower === 'avc1' || lower === 'avc3') videoCodec = 'H.264';
            else if (lower === 'hvc1' || lower === 'hev1') videoCodec = 'H.265 / HEVC';
            else if (lower === 'vp09') videoCodec = 'VP9';
            else if (lower === 'av01') videoCodec = 'AV1';
            else if (lower === 'mp4v') videoCodec = 'MPEG-4';
          }
          entryOffset += entrySize;
        }
      }

      if (atomEnd <= offset || size === 0) break;
      offset = atomEnd;
    }
  }

  scanAtoms(0, buffer.byteLength);
  return { audioChannels: audioChannels ?? (videoCodec && !audioCodec ? 0 : undefined), audioCodec, audioBitrate, videoCodec, fps };
}

export function parseEbmlMetadata(buffer: ArrayBuffer): ProbedContainerInfo {
  const result: ProbedContainerInfo = {};
  const u8 = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const len = u8.length;

  for (let i = 0; i < len - 4; i++) {
    // 1. DefaultDuration (EBML ID: 0x23, 0xE3, 0x83) - Frame duration in nanoseconds
    if (!result.fps && u8[i] === 0x23 && u8[i + 1] === 0xe3 && u8[i + 2] === 0x83) {
      const sizeByte = u8[i + 3];
      const size = sizeByte & 0x7f;
      if (size > 0 && size <= 8 && i + 4 + size <= len) {
        let dur = 0;
        for (let j = 0; j < size; j++) {
          dur = (dur * 256) + u8[i + 4 + j];
        }
        if (dur > 0) {
          result.fps = normalizeFps(1_000_000_000 / dur);
        }
      }
    }

    // 2. FrameRate (EBML ID: 0x23, 0x83, 0xE3) - Float
    if (!result.fps && u8[i] === 0x23 && u8[i + 1] === 0x83 && u8[i + 2] === 0xe3) {
      const sizeByte = u8[i + 3];
      const size = sizeByte & 0x7f;
      if (size === 4 && i + 8 <= len) {
        result.fps = normalizeFps(view.getFloat32(i + 4));
      } else if (size === 8 && i + 12 <= len) {
        result.fps = normalizeFps(view.getFloat64(i + 4));
      }
    }

    // 3. Audio Channels (EBML ID: 0x9F)
    if (!result.audioChannels && u8[i] === 0x9f) {
      const sizeByte = u8[i + 1];
      const size = sizeByte & 0x7f;
      if (size === 1 && i + 3 <= len) {
        const ch = u8[i + 2];
        if (ch >= 1 && ch <= 16) result.audioChannels = ch;
      } else if (size === 2 && i + 4 <= len) {
        const ch = (u8[i + 2] << 8) | u8[i + 3];
        if (ch >= 1 && ch <= 16) result.audioChannels = ch;
      }
    }

    // 4. CodecID (EBML ID: 0x86)
    if (u8[i] === 0x86) {
      const sizeByte = u8[i + 1];
      const size = sizeByte & 0x7f;
      if (size > 0 && size <= 64 && i + 2 + size <= len) {
        let codecStr = '';
        for (let j = 0; j < size; j++) {
          codecStr += String.fromCharCode(u8[i + 2 + j]);
        }
        if (codecStr.startsWith('V_')) {
          if (codecStr.includes('VP9')) result.videoCodec = 'VP9';
          else if (codecStr.includes('VP8')) result.videoCodec = 'VP8';
          else if (codecStr.includes('AV1')) result.videoCodec = 'AV1';
          else if (codecStr.includes('AVC')) result.videoCodec = 'H.264';
          else if (codecStr.includes('HEVC')) result.videoCodec = 'H.265 / HEVC';
        } else if (codecStr.startsWith('A_')) {
          if (codecStr.includes('OPUS')) result.audioCodec = 'Opus';
          else if (codecStr.includes('VORBIS')) result.audioCodec = 'Vorbis';
          else if (codecStr.includes('AAC')) result.audioCodec = 'AAC';
        }
      }
    }
  }

  return result;
}

export function parseAviMetadata(buffer: ArrayBuffer): ProbedContainerInfo {
  const result: ProbedContainerInfo = {};
  if (buffer.byteLength < 56) return result;
  const view = new DataView(buffer);

  function readString(offset: number, length: number): string {
    let str = '';
    for (let i = 0; i < length; i++) {
      if (offset + i < buffer.byteLength) {
        str += String.fromCharCode(view.getUint8(offset + i));
      }
    }
    return str;
  }

  const riff = readString(0, 4);
  const form = readString(8, 4);
  if (riff !== 'RIFF' || (form !== 'AVI ' && form !== 'AVIX')) return result;

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readString(offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'LIST') {
      const listType = readString(offset + 8, 4);
      if (listType === 'hdrl' || listType === 'strl') {
        offset += 12;
        continue;
      }
    } else if (chunkId === 'avih') {
      const dataOffset = offset + 8;
      if (dataOffset + 4 <= buffer.byteLength) {
        const microSecPerFrame = view.getUint32(dataOffset, true);
        if (microSecPerFrame > 0) {
          result.fps = normalizeFps(1_000_000 / microSecPerFrame);
        }
      }
    } else if (chunkId === 'strh') {
      const dataOffset = offset + 8;
      if (dataOffset + 32 <= buffer.byteLength) {
        const fccType = readString(dataOffset, 4);
        if (fccType === 'vids') {
          const scale = view.getUint32(dataOffset + 20, true);
          const rate = view.getUint32(dataOffset + 24, true);
          if (scale > 0 && rate > 0) {
            result.fps = normalizeFps(rate / scale);
          }
          const handler = readString(dataOffset + 4, 4).trim().toUpperCase();
          if (handler) result.videoCodec = handler;
        } else if (fccType === 'auds') {
          result.audioCodec = 'MP3 / Audio';
        }
      }
    }

    offset += 8 + ((chunkSize + 1) & ~1);
  }

  return result;
}
