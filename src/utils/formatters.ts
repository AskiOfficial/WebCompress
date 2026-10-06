export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  if (isNaN(bytes) || bytes < 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';

  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function formatBitrate(bps: number): string {
  if (!bps || isNaN(bps) || bps <= 0) return 'Auto';

  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  return `${Math.round(bps / 1000)} kbps`;
}

export function formatFps(fps: number): string {
  if (!fps || isNaN(fps) || fps <= 0) return 'Original';
  const val = Number.isInteger(fps) ? fps : parseFloat(fps.toFixed(2));
  return `${val} FPS`;
}

export function formatResolution(width: number, height: number): string {
  if (!width || !height) return 'Original';
  return `${width} × ${height}`;
}

export function formatAudioChannels(channels?: number, detailed = false): string {
  if (!channels || channels <= 0) return detailed ? 'Original' : '';
  if (channels === 1) return detailed ? 'Original (Mono - 1 channel)' : 'Mono';
  if (channels === 2) return detailed ? 'Original (Stereo - 2 channels)' : 'Stereo';
  if (channels === 6) return detailed ? 'Original (5.1 Surround - 6 channels)' : '5.1';
  return detailed ? `Original (${channels} channels)` : `${channels} ch`;
}

