import type { FC } from 'react';
import { VideoMetadata } from '../../types';
import { VideoPlayer } from './VideoPlayer';
import { formatAudioChannels, formatBitrate, formatBytes, formatDuration, formatFps, formatResolution } from '../../utils/formatters';
import { FileVideo, RefreshCw } from 'lucide-react';

interface VideoInfoCardProps {
  metadata: VideoMetadata;
  onChangeVideo: () => void;
  isProcessing?: boolean;
}

export const VideoInfoCard: FC<VideoInfoCardProps> = ({
  metadata,
  onChangeVideo,
  isProcessing,
}) => {
  const ext = metadata.name.split('.').pop()?.toUpperCase() || 'VIDEO';

  return (
    <div className="bg-slate-900/60 border border-slate-800/90 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <FileVideo className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-sm sm:text-base truncate" title={metadata.name}>
                {metadata.name}
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                {ext}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {formatBytes(metadata.size)} • {formatDuration(metadata.duration)}
            </p>
          </div>
        </div>

        <button
          onClick={onChangeVideo}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition disabled:opacity-50 cursor-pointer shrink-0"
          title="Choose a different video file"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Change</span>
        </button>
      </div>

      {/* Mini Video Player Preview */}
      <VideoPlayer src={metadata.objectUrl} title={metadata.name} />

      {/* Media Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
        <DetailItem
          label="Resolution"
          value={formatResolution(metadata.width, metadata.height)}
        />
        <DetailItem
          label="Framerate"
          value={formatFps(metadata.fps)}
        />
        <DetailItem
          label="Duration"
          value={formatDuration(metadata.duration)}
        />
        <DetailItem
          label="Video Codec"
          value={metadata.videoCodec || 'H.264'}
        />
        <DetailItem
          label="Video Bitrate"
          value={formatBitrate(metadata.videoBitrate || 0)}
        />
        <DetailItem
          label="Audio"
          value={[
            metadata.audioCodec || 'AAC',
            formatAudioChannels(metadata.audioChannels),
            formatBitrate(metadata.audioBitrate || 0),
          ].filter(Boolean).join(' • ')}
        />
      </div>
    </div>
  );
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="text-xs font-semibold text-slate-200 mt-0.5 truncate font-mono">
        {value}
      </div>
    </div>
  );
}
