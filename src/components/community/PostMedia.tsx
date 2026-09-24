import { useEffect, useRef, useState } from 'react';
import { css } from '../../lib/css';
import { getPostMediaUrl } from '../../lib/community/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import type { FeedPost } from '../../lib/community/useFeed';
import { MediaActions } from '../media/MediaActions';

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A video attachment in the feed.
 *
 * Rectangular on purpose: the circular treatment belongs to short clips in a
 * private thread, and would crop a chart or a screen recording to uselessness
 * in a post card. What it borrows from the chat side is the loading discipline
 * — a poster frame until someone taps, and no video bytes before that.
 */
function PostVideo({ post, height }: { post: FeedPost; height: number }) {
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const poster = useLazyMediaUrl(post.posterKey, getPostMediaUrl);
  const media = useLazyMediaUrl(post.storageKey, getPostMediaUrl, { armed: wanted });

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !wanted || !media.url) return;
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [wanted, media.url]);

  const showVideo = wanted && !!media.url;

  return (
    <div
      // One element, two observers: the poster loads on approach, the video
      // waits for a tap.
      ref={node => { poster.ref(node); media.ref(node); }}
      // Stop here: the card around this opens the post, and a tap on the video
      // means "play it", not "take me somewhere else". Everywhere else on the
      // card still navigates exactly as it did before.
      onClick={e => { e.stopPropagation(); if (!wanted) setWanted(true); }}
      style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: 'var(--ink-chip)', cursor: showVideo ? 'default' : 'pointer' }}
    >
      {poster.url && !showVideo && (
        <img src={poster.url} onError={poster.retry} alt={post.fileName ?? 'Video'} decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
      )}
      {showVideo && (
        <video
          ref={videoRef}
          src={media.url ?? undefined}
          poster={poster.url ?? undefined}
          controls
          playsInline
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={media.retry}
          style={css('width:100%;height:100%;object-fit:cover;display:block')}
        />
      )}
      {!showVideo && (
        <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
          {wanted && !media.failed ? (
            <div style={css('width:34px;height:34px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:var(--border-on-accent);animation:tp-spin .8s linear infinite')}>
              <style>{'@keyframes tp-spin{to{transform:rotate(360deg)}}'}</style>
            </div>
          ) : media.failed ? (
            <div style={css('font-size:11.5px;color:var(--danger-ink-2)')}>Could not load this video</div>
          ) : (
            <div style={css('width:52px;height:52px;border-radius:50%;background:rgba(var(--shadow-rgb),.55);display:flex;align-items:center;justify-content:center')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--on-accent)" style={css('margin-left:2px')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
            </div>
          )}
        </div>
      )}
      {!playing && !poster.url && !showVideo && (
        <div style={css('position:absolute;left:10px;bottom:10px;font-size:10.5px;color:rgba(255,255,255,.75)')}>Video</div>
      )}
      <div style={css('position:absolute;right:8px;bottom:8px;z-index:2;background:var(--surface);padding:6px 8px;border-radius:8px')}>
        <MediaActions storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} />
      </div>
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
    return <PostVideo post={post} height={height} />;
  }

  if (isImage && post.storageKey && !post.mediaPurged) {
    return (
      <div ref={image.ref} style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: 'var(--surface-sunken-2)' }}>
        {image.failed || !image.url ? (
          <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:var(--text-faint)')}>
            {image.failed ? 'Could not load attachment' : 'Loading…'}
          </div>
        ) : (
          <img src={image.url} onError={image.retry} alt={post.fileName ?? 'Attachment'} loading="lazy" decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
        )}
        <div style={css('position:absolute;right:8px;bottom:8px;background:var(--surface);padding:6px 8px;border-radius:8px')}>
          <MediaActions storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} />
        </div>
      </div>
    );
  }

  // Nothing left to render for real: the attachment never arrived, its media
  // was purged, or PostMedia was called for a post that carries none at all.
  // Say so, rather than filling the space with a generated chart.
  return <NoMedia height={height} purged={post.mediaPurged} />;
}

function VoicePost({ post }: { post: FeedPost }) {
  const { ref, url, failed, retry } = useLazyMediaUrl(post.mediaPurged ? null : post.storageKey, getPostMediaUrl);
  return <div ref={ref} style={css('background:var(--surface);border:1px solid var(--border-2);border-radius:12px;padding:13px;display:flex;flex-direction:column;gap:8px')}>
    <div style={css('font-size:12px;font-weight:700;color:var(--text-primary)')}>Voice message</div>
    {post.mediaPurged ? <span style={css('font-size:11px;color:var(--text-faint)')}>Removed (6-month retention)</span>
      : failed ? <span style={css('font-size:11px;color:var(--danger-ink)')}>Could not load voice message</span>
      : url ? <audio controls preload="metadata" src={url} onError={retry} style={css('width:100%;height:38px')} />
      : <span style={css('font-size:11px;color:var(--text-faint)')}>Loading…</span>}
    {!post.mediaPurged && <MediaActions storageKey={post.storageKey} fileName={post.fileName} getUrl={getPostMediaUrl} />}
  </div>;
}

/** A document attachment — PDF or one of the office formats. */
export function PdfRow({ post }: { post: FeedPost }) {
  const { ref } = useLazyMediaUrl(
    post.mediaPurged ? null : post.storageKey,
    getPostMediaUrl,
  );
  const isPdf = post.attachment === 'pdf';

  return (
    <div ref={ref} style={css('background:var(--surface);border:1px solid var(--border-2);border-radius:12px;padding:11px 12px;display:flex;align-items:center;gap:11px')}>
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
    </div>
  );
}

/** "2h ago" / "3d ago" — the relative stamp the cards already used. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
