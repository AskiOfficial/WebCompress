import { useEffect, useState, type FC } from 'react';
import { Film, AlertCircle } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  title?: string;
}

export const VideoPlayer: FC<VideoPlayerProps> = ({
  src,
  poster,
  className = '',
  title = 'Video Player',
}) => {
  const [hasError, setHasError] = useState(false);
  useEffect(() => { setHasError(false); }, [src]);

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-black border border-slate-800 ${className}`}>
      {hasError ? (
        <div className="aspect-video w-full flex flex-col items-center justify-center p-6 text-center bg-slate-950/80 text-slate-400">
          <Film className="w-10 h-10 text-slate-400 mb-2" />
          <div className="flex items-center gap-1.5 text-xs text-amber-400/90 font-medium mb-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Native preview unavailable</span>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xs">
            Your browser cannot preview this codec or container. Preview support is separate from encoding support; downloaded files can be opened in a compatible player.
          </p>
        </div>
      ) : (
        <video
          src={src}
          poster={poster}
          controls
          playsInline
          onError={() => setHasError(true)}
          className="w-full aspect-video object-contain"
          aria-label={title}
        />
      )}
    </div>
  );
};
