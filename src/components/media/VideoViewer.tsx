import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { clampVideoPosition, shouldRestoreVideoSource, snapshotVideoPlayback, type VideoPlaybackSnapshot } from '../../lib/media/video-playback-state';

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

export function VideoViewer({
  src, poster, fileName, loading, error, onRetry, onClose,
  initialTime = 0, autoPlay = true, onPlaybackUpdate,
}: {
  src: string | null;
  poster?: string | null;
  fileName?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClose: (playback?: VideoPlaybackSnapshot) => void;
  initialTime?: number;
  autoPlay?: boolean;
  onPlaybackUpdate?: (playback: VideoPlaybackSnapshot) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);
  const [playing, setPlaying] = useState(false);
  const previousSrc = useRef(src);
  const initialSeekPending = useRef(initialTime > 0);
  const playbackRef = useRef<VideoPlaybackSnapshot>({ currentTime: initialTime, playing: autoPlay });
  onCloseRef.current = onClose;

  const close = () => {
    const current = snapshotVideoPlayback(videoRef.current);
    const video = videoRef.current;
    const playback = video && video.readyState === 0 && current.currentTime === 0
      ? playbackRef.current
      : current;
    onCloseRef.current(playback);
  };

  useEffect(() => {
    // Keep the previous signed URL while the retry hook temporarily clears src,
    // so a fresh signature can restore the current playback position.
    if (!src) return;
    const hadSource = shouldRestoreVideoSource(previousSrc.current, src);
    if (previousSrc.current === src) return;
    previousSrc.current = src;
    const video = videoRef.current;
    if (!hadSource || !src || !video) return;

    const saved = playbackRef.current;
    const restore = () => {
      if (video.readyState < 1) return;
      const position = clampVideoPosition(saved.currentTime, video.duration);
      if (position > 0) {
        video.currentTime = position;
        if (saved.playing) video.addEventListener('seeked', () => { void video.play().catch(() => {}); }, { once: true });
      } else if (saved.playing) {
        void video.play().catch(() => {});
      }
    };
    if (video.readyState >= 1) restore();
    else video.addEventListener('loadedmetadata', restore, { once: true });
    return () => video.removeEventListener('loadedmetadata', restore);
  }, [src]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      videoRef.current?.pause();
    };
  }, []);

  const enterFullscreen = () => {
    const video = videoRef.current as WebkitVideo | null;
    if (!video) return;
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else if (video.requestFullscreen) void video.requestFullscreen().catch(() => {});
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Video player" onClick={close}
      style={css('position:fixed;inset:0;z-index:1100;background:rgba(3,7,18,.97);color:#fff;display:flex;flex-direction:column;overscroll-behavior:contain')}>
      <header onClick={event => event.stopPropagation()} style={css('flex:none;display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 10px;background:linear-gradient(rgba(0,0,0,.55),transparent)')}>
        <button type="button" onClick={close} aria-label="Close video" style={css('width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:26px;cursor:pointer')}>×</button>
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
          autoPlay={autoPlay && initialTime <= 0}
          preload="metadata"
          onLoadedMetadata={event => {
            if (!initialSeekPending.current) return;
            initialSeekPending.current = false;
            const video = event.currentTarget;
            const position = clampVideoPosition(initialTime, video.duration);
            if (position <= 0) {
              if (autoPlay) void video.play().catch(() => {});
              return;
            }
            video.currentTime = position;
            if (autoPlay) video.addEventListener('seeked', () => { void video.play().catch(() => {}); }, { once: true });
          }}
          onTimeUpdate={event => {
            const state = snapshotVideoPlayback(event.currentTarget);
            playbackRef.current = state;
            onPlaybackUpdate?.(state);
          }}
          onPlay={event => {
            setPlaying(true);
            const state = snapshotVideoPlayback(event.currentTarget);
            playbackRef.current = state;
            onPlaybackUpdate?.(state);
          }}
          onPause={event => {
            setPlaying(false);
            const state = snapshotVideoPlayback(event.currentTarget);
            playbackRef.current = state;
            onPlaybackUpdate?.(state);
          }}
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
