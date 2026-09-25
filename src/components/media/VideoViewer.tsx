import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

export function VideoViewer({
  src, poster, fileName, loading, error, onRetry, onClose,
}: {
  src: string | null;
  poster?: string | null;
  fileName?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      videoRef.current?.pause();
    };
  }, [onClose]);

  const enterFullscreen = () => {
    const video = videoRef.current as WebkitVideo | null;
    if (!video) return;
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else if (video.requestFullscreen) void video.requestFullscreen().catch(() => {});
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Video player" onClick={onClose}
      style={css('position:fixed;inset:0;z-index:1100;background:rgba(3,7,18,.97);color:#fff;display:flex;flex-direction:column;overscroll-behavior:contain')}>
      <header onClick={event => event.stopPropagation()} style={css('flex:none;display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px;background:linear-gradient(rgba(0,0,0,.55),transparent)')}>
        <button type="button" onClick={onClose} aria-label="Close video" style={css('width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:26px;cursor:pointer')}>×</button>
        <div title={fileName ?? 'Video'} style={css('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600')}>{fileName ?? 'Video'}</div>
        <button type="button" onClick={enterFullscreen} aria-label="Enter full screen" style={css('width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:19px;cursor:pointer')}>⛶</button>
      </header>
      <div onClick={event => event.stopPropagation()} style={css('position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 12px 18px')}>
        {src && !error ? <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          controls
          playsInline
          autoPlay
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => { setPlaying(false); onRetry?.(); }}
          style={{ width: '100%', height: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        /> : <div role={error ? 'alert' : 'status'} style={css('display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;color:rgba(255,255,255,.8);font-size:14px')}>
          <span>{error ?? (loading ? 'Loading video…' : 'Video is unavailable.')}</span>
          {error && onRetry && <button type="button" onClick={onRetry} style={css('min-height:42px;padding:0 18px;border-radius:12px;background:#fff;color:#111827;font-weight:700')}>Try again</button>}
        </div>}
        {src && !error && !playing && <button type="button" aria-label="Play video" onClick={() => { void videoRef.current?.play().catch(() => {}); }}
          style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:68px;height:68px;border-radius:50%;background:rgba(0,0,0,.58);color:#fff;font-size:27px;padding-left:5px;cursor:pointer')}>▶</button>}
      </div>
      <div style={css('flex:none;padding:0 16px calc(12px + env(safe-area-inset-bottom,0px));font-size:11px;color:rgba(255,255,255,.55);text-align:center')}>
        Use the video controls to pause, seek, and adjust volume where supported.
      </div>
    </div>, document.body,
  );
}
