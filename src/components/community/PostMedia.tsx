import { useEffect, useRef, useState } from 'react';
import { css } from '../../lib/css';
import { getPostMediaUrl } from '../../lib/community/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import type { FeedPost } from '../../lib/community/useFeed';
import { MediaActions } from '../media/MediaActions';
import { ImageViewer } from '../media/ImageViewer';
import { DocumentViewer } from '../media/DocumentViewer';
import { useAudioPlayer } from '../../lib/chat/useAudioPlayer';
import { formatDuration } from '../../lib/chat/types';
import { VideoViewer } from '../media/VideoViewer';
import { clampVideoPosition, snapshotVideoPlayback, type VideoPlaybackSnapshot } from '../../lib/media/video-playback-state';

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A WhatsApp-style circular community clip; full-screen viewing is a separate action. */
function PostVideo({ post }: { post: FeedPost }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStart, setViewerStart] = useState<VideoPlaybackSnapshot>({ currentTime: 0, playing: false });
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [duration, setDuration] = useState(0);
  const poster = useLazyMediaUrl(post.posterKey, getPostMediaUrl);
  // Resolve a signed URL when the circle approaches the viewport; preload=none
  // keeps the large video body idle until the member taps Play.
  const media = useLazyMediaUrl(post.storageKey, getPostMediaUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingPlay = useRef(false);
  const lastPosition = useRef(0);
  const playIntent = useRef(false);
  const previousUrl = useRef<string | null>(null);
  const resumeInline = useRef(false);
  const wasViewerOpen = useRef(false);

  function playInline() {
    playIntent.current = true;
    const video = videoRef.current;
    if (!video || !media.url) {
      pendingPlay.current = true;
      return;
    }
    pendingPlay.current = false;
    setBlocked(false);
    void video.play().then(() => setBlocked(false)).catch(() => {
      // Some browsers need another direct tap after the signed URL resolves.
      setBlocked(true);
    });
  }

  function toggleInline() {
    const video = videoRef.current;
    if (video && !video.paused) {
      pendingPlay.current = false;
      playIntent.current = false;
      video.pause();
      return;
    }
    if (media.failed) {
      pendingPlay.current = true;
      media.forceRetry();
      return;
    }
    playInline();
  }

  // The signed URL is normally ready by the time the visible bubble is tapped.
  // If signing is still in flight, finish the original play request as soon as
  // it arrives instead of requiring a second tap.
  useEffect(() => {
    const video = videoRef.current;
    if (!media.url || !video) return;
    const previous = previousUrl.current;
    previousUrl.current = media.url;

    if (pendingPlay.current) {
      playInline();
      return;
    }
    if (previous && previous !== media.url) {
      const position = lastPosition.current;
      const resume = playIntent.current;
      const restore = () => {
        video.currentTime = clampVideoPosition(position, video.duration);
        if (resume) video.addEventListener('seeked', () => { void video.play().catch(() => setBlocked(true)); }, { once: true });
      };
      if (video.readyState >= 1) restore();
      else video.addEventListener('loadedmetadata', restore, { once: true });
    }
  }, [media.url]);

  // Return from the viewer to the same point in the inline bubble. If the
  // viewer was paused before closing, leave the inline clip paused too.
  useEffect(() => {
    if (viewerOpen) {
      wasViewerOpen.current = true;
      return;
    }
    if (!wasViewerOpen.current) return;
    wasViewerOpen.current = false;
    const video = videoRef.current;
    if (!video) return;
    if (lastPosition.current > 0 && video.readyState >= 1) {
      video.currentTime = clampVideoPosition(lastPosition.current, video.duration);
    }
    if (resumeInline.current) {
      resumeInline.current = false;
      void video.play().catch(() => setBlocked(true));
    }
  }, [viewerOpen]);

  function openViewer(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const state = snapshotVideoPlayback(videoRef.current);
    lastPosition.current = state.currentTime;
    playIntent.current = state.playing;
    resumeInline.current = state.playing;
    setViewerStart(state);
    videoRef.current?.pause();
    setViewerOpen(true);
  }

  function closeViewer(state?: VideoPlaybackSnapshot) {
    if (state) {
      lastPosition.current = state.currentTime;
      playIntent.current = state.playing;
      resumeInline.current = state.playing;
    }
    setViewerOpen(false);
  }

  function retryVideo() {
    const video = videoRef.current;
    const state = snapshotVideoPlayback(video);
    lastPosition.current = state.currentTime;
    playIntent.current = state.playing || playIntent.current || pendingPlay.current;
    pendingPlay.current = playIntent.current;
    media.forceRetry();
  }

  const failed = media.failed;

  return (
    <div
      onClick={event => event.stopPropagation()}
      role="group"
      aria-label={`${post.fileName ?? 'Community video'} controls`}
      style={css('position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;flex:none')}
    >
      <div
      ref={node => { poster.ref(node); media.ref(node); }}
      onClick={event => { event.stopPropagation(); toggleInline(); }}
      role="button"
      aria-label={`${playing ? 'Pause' : 'Play'} ${post.fileName ?? 'community video'}`}
      aria-pressed={playing}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleInline(); }
      }}
      tabIndex={0}
      style={{
        position: 'relative', width: 184, height: 184, maxWidth: '68vw', maxHeight: '68vw',
        borderRadius: '50%', overflow: 'hidden', background: 'var(--ink-chip)', cursor: 'pointer',
        flex: 'none', boxShadow: '0 4px 16px rgba(var(--shadow-rgb),.16)', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <video
        ref={videoRef}
        src={media.url ?? undefined}
        poster={poster.url ?? undefined}
        playsInline
        preload="none"
        onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={event => { lastPosition.current = snapshotVideoPlayback(event.currentTarget).currentTime; }}
        onPlay={() => { setPlaying(true); playIntent.current = true; pendingPlay.current = false; setBlocked(false); }}
        onPause={() => { setPlaying(false); }}
        onEnded={() => { setPlaying(false); playIntent.current = false; lastPosition.current = 0; }}
        onError={() => {
          const video = videoRef.current;
          lastPosition.current = snapshotVideoPlayback(video).currentTime || lastPosition.current;
          pendingPlay.current = playIntent.current;
          media.retry();
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
      />
      {(!playing || media.loading || failed || blocked) && (
        <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.12);pointer-events:none')}>
          {failed ? (
            <div role="alert" style={css('font-size:11px;color:var(--on-accent);background:rgba(0,0,0,.68);padding:8px 11px;border-radius:10px')}>
              Tap to retry
            </div>
          ) : media.loading && !media.url ? (
            <div role="status" aria-label="Loading video" style={css('width:32px;height:32px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:var(--border-on-accent);animation:tp-community-video-spin .8s linear infinite')}>
              <style>{'@keyframes tp-community-video-spin{to{transform:rotate(360deg)}}'}</style>
            </div>
          ) : (
            <div aria-hidden="true" style={css('width:48px;height:48px;border-radius:50%;background:rgba(var(--shadow-rgb),.6);color:var(--on-accent);font-size:20px;display:flex;align-items:center;justify-content:center')}>
              {playing ? 'Ⅱ' : '▶'}
            </div>
          )}
        </div>
      )}
      {!poster.url && !playing && !media.loading && !failed && (
        <div style={css('position:absolute;left:0;right:0;bottom:48px;text-align:center;font-size:10.5px;color:rgba(255,255,255,.75);pointer-events:none')}>VIDEO</div>
      )}
      {duration > 0 && (
        <div style={css('position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;pointer-events:none')}>
          <div style={css('padding:2px 9px;border-radius:999px;background:rgba(var(--shadow-rgb),.62);font-size:10.5px;font-weight:600;color:var(--on-accent)')}>
            {formatDuration(duration)}
          </div>
        </div>
      )}
      </div>
      <button type="button" aria-label="Open video full screen" title="Open full screen" onClick={openViewer}
        style={css('position:absolute;top:9px;right:9px;z-index:2;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:19px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25)')}>
        ⛶
      </button>
      {!post.mediaPurged && <div style={css('min-height:20px')}>
        <MediaActions storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} />
      </div>}
      {viewerOpen && <VideoViewer
        src={media.url}
        poster={poster.url}
        fileName={post.fileName}
        loading={media.loading}
        error={media.failed ? media.error ?? 'Could not load this video.' : null}
        onRetry={retryVideo}
        initialTime={viewerStart.currentTime}
        autoPlay={viewerStart.playing}
        onPlaybackUpdate={state => {
          lastPosition.current = state.currentTime;
          playIntent.current = state.playing;
          resumeInline.current = state.playing;
        }}
        onClose={closeViewer}
      />}
    </div>
  );
}

/**
 * The honest answer when there is no real media to show: the attachment never
 * arrived, or it was purged by the 6-month retention sweep. Matches PdfRow's
 * own wording for the same situation, rather than inventing a second one.
 *
 * This is what used to be a generated candlestick chart — every purged photo
 * or screen recording rendered as if the post had always been a trading
 * chart. A post's real content going away is not a reason to replace it with
 * placeholder trading imagery; it is a reason to say it is gone.
 */
function NoMedia({ height, purged }: { height: number; purged: boolean }) {
  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-sunken-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={css('font-size:11.5px;color:var(--text-faint);text-align:center;padding:0 16px')}>
        {purged ? 'Removed (6-month retention)' : 'Attachment unavailable'}
      </div>
    </div>
  );
}

/**
 * The attachment area of a post card: the real image, the real video, or the
 * real document — never a stand-in for one that is not there.
 */
export function PostMedia({ post, height }: { post: FeedPost; height: number }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const isImage = post.attachment === 'image';
  const isVideo = post.attachment === 'video';
  const image = useLazyMediaUrl(
    isImage && !post.mediaPurged ? post.storageKey : null,
    getPostMediaUrl,
  );

  if (post.attachment === 'voice') return <VoicePost post={post} />;

  // A PDF and a generic document render the same card; only the icon differs,
  // which PdfRow decides from the post's own attachment kind. PdfRow already
  // degrades gracefully with no storage key — same layout, just no download
  // link — so a document is routed there unconditionally rather than ever
  // falling through to the placeholder below.
  if (post.attachment === 'pdf' || post.attachment === 'file') {
    return <PdfRow post={post} />;
  }

  if (isVideo && post.storageKey && !post.mediaPurged) {
    return <PostVideo post={post} />;
  }

  if (isImage && post.storageKey && !post.mediaPurged) {
    return (
      <div ref={image.ref} onClick={e => e.stopPropagation()} style={{ position: 'relative', minHeight: image.url && !image.failed ? undefined : height, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-sunken-2)' }}>
        {image.failed || !image.url ? (
          <div style={{ ...css('width:100%;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;font-size:11.5px;color:var(--text-faint);text-align:center;padding:16px'), minHeight: height }}>
            {image.failed ? <><span role="alert">{image.error ?? 'Could not load attachment'}</span><button type="button" onClick={image.forceRetry} disabled={image.loading} style={css('color:var(--accent-ink);font-weight:700;padding:8px')}>Try again</button></> : 'Loading…'}
          </div>
        ) : (
          <button type="button" onClick={() => setViewerOpen(true)} aria-label="View full image" style={css('display:block;width:100%;cursor:zoom-in;padding:0;border:0;background:transparent')}>
            <img src={image.url} onError={image.retry} alt={post.fileName ?? 'Attachment'} loading="lazy" decoding="async" style={css('width:100%;max-height:70vh;height:auto;object-fit:contain;display:block;background:var(--surface-sunken-2)')} />
          </button>
        )}
        <div style={css('position:absolute;right:8px;bottom:8px;background:var(--surface);padding:6px 8px;border-radius:8px')}>
          <MediaActions storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} />
        </div>
        {viewerOpen && <ImageViewer storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} onClose={() => setViewerOpen(false)} />}
      </div>
    );
  }

  // Nothing left to render for real: the attachment never arrived, its media
  // was purged, or PostMedia was called for a post that carries none at all.
  // Say so, rather than filling the space with a generated chart.
  return <NoMedia height={height} purged={post.mediaPurged} />;
}
function VoicePost({ post }: { post: FeedPost }) {
  const { playing, loading, progress, elapsed, duration, error, toggle, seek } = useAudioPlayer(
    `post:${post.id}`, async () => post.storageKey ? getPostMediaUrl(post.storageKey, true) : null,
  );
  return <div onClick={event => event.stopPropagation()} style={css('background:var(--surface);border:1px solid var(--border-2);border-radius:12px;padding:13px;display:flex;flex-direction:column;gap:8px')}>
    <div style={css('font-size:12px;font-weight:700;color:var(--text-primary)')}>Voice message</div>
    {post.mediaPurged ? <span style={css('font-size:11px;color:var(--text-faint)')}>Removed (6-month retention)</span> : <>
      <div style={css('display:flex;align-items:center;gap:10px')}>
        <button type="button" aria-label={playing ? 'Pause voice message' : 'Play voice message'} onClick={() => void toggle()}
          style={css('width:44px;height:44px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:18px;flex:none')}>
          {loading ? '…' : playing ? 'Ⅱ' : '▶'}
        </button>
        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <input type="range" min={0} max={100} value={Math.round(progress * 100)} aria-label="Voice message progress"
            onChange={event => seek(Number(event.target.value) / 100)} style={css('width:100%;accent-color:var(--accent)')} />
          <span style={css('font-size:11px;color:var(--text-muted)')}>{formatDuration(elapsed)} / {formatDuration(duration)}</span>
        </div>
      </div>
      {error && <span role="alert" style={css('font-size:11px;color:var(--danger-ink)')}>{error}</span>}
    </>}
  </div>;
}

/** A document attachment — PDF or one of the office formats. */
export function PdfRow({ post }: { post: FeedPost }) {
  const [open, setOpen] = useState(false);
  const isPdf = post.attachment === 'pdf';

  return (
    <div onClick={post.storageKey && !post.mediaPurged ? event => { event.stopPropagation(); setOpen(true); } : undefined} style={css('background:var(--surface);border:1px solid var(--border-2);border-radius:12px;padding:11px 12px;display:flex;align-items:center;gap:11px;cursor:pointer')}>
      <div style={{
        ...css('width:34px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none'),
        background: isPdf ? 'var(--danger-soft)' : 'var(--accent-tint)',
      }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={isPdf ? 'var(--danger-ink)' : 'var(--accent-ink)'} strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
      </div>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
        <div style={css('font-size:12.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {post.fileName ?? (isPdf ? 'Document.pdf' : 'Attachment')}
        </div>
        <div style={css('font-size:11px;color:var(--text-faint)')}>
          {post.mediaPurged ? 'Removed (6-month retention)' : bytes(post.sizeBytes ?? 0)}
        </div>
      </div>
      {!post.mediaPurged && <MediaActions storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} />}
      {open && post.storageKey && <DocumentViewer storageKey={post.storageKey} fileName={post.fileName} isPdf={isPdf} getUrl={getPostMediaUrl} onClose={() => setOpen(false)} />}
    </div>
  );
}
