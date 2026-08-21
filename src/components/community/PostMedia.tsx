import { useEffect, useRef, useState } from 'react';
import { css } from '../../lib/css';
import { getPostMediaUrl } from '../../lib/community/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { CandleChart } from '../CandleChart';
import type { FeedPost } from '../../lib/community/useFeed';

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
      style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: '#0F172A', cursor: showVideo ? 'default' : 'pointer' }}
    >
      {poster.url && !showVideo && (
        <img src={poster.url} alt={post.fileName ?? 'Video'} decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
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
          style={css('width:100%;height:100%;object-fit:cover;display:block')}
        />
      )}
      {!showVideo && (
        <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
          {wanted && !media.failed ? (
            <div style={css('width:34px;height:34px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#FFFFFF;animation:tp-spin .8s linear infinite')}>
              <style>{'@keyframes tp-spin{to{transform:rotate(360deg)}}'}</style>
            </div>
          ) : media.failed ? (
            <div style={css('font-size:11.5px;color:#FCA5A5')}>Could not load this video</div>
          ) : (
            <div style={css('width:52px;height:52px;border-radius:50%;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:2px')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
            </div>
          )}
        </div>
      )}
      {!playing && !poster.url && !showVideo && (
        <div style={css('position:absolute;left:10px;bottom:10px;font-size:10.5px;color:rgba(255,255,255,.75)')}>Video</div>
      )}
    </div>
  );
}

/**
 * The attachment area of a post card. Falls back to the generated candlestick
 * placeholder when a post carries no uploaded media, which is what the original
 * design showed.
 */
export function PostMedia({ post, height }: { post: FeedPost; height: number }) {
  const isImage = post.attachment === 'image';
  const isVideo = post.attachment === 'video';
  const image = useLazyMediaUrl(
    isImage && !post.mediaPurged ? post.storageKey : null,
    getPostMediaUrl,
  );

  if (post.attachment === 'pdf' && post.storageKey) {
    return <PdfRow post={post} />;
  }

  // No uploaded media: keep the design's chart placeholder.
  if ((!isImage && !isVideo) || !post.storageKey || post.mediaPurged) {
    return (
      <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden' }}>
        <CandleChart seed={post.chartSeed ?? 4} />
      </div>
    );
  }

  if (isVideo) return <PostVideo post={post} height={height} />;

  return (
    <div ref={image.ref} style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: '#EDF0F5' }}>
      {image.failed || !image.url ? (
        <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:#94A3B8')}>
          {image.failed ? 'Could not load attachment' : 'Loading…'}
        </div>
      ) : (
        <img src={image.url} alt={post.fileName ?? 'Attachment'} loading="lazy" decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
      )}
    </div>
  );
}

/** PDF attachment, styled like the chat screen's document card. */
export function PdfRow({ post }: { post: FeedPost }) {
  const { ref, url } = useLazyMediaUrl(
    post.mediaPurged ? null : post.storageKey,
    getPostMediaUrl,
  );

  return (
    <div ref={ref} style={css('background:#FFFFFF;border:1px solid #EDF0F6;border-radius:12px;padding:11px 12px;display:flex;align-items:center;gap:11px')}>
      <div style={css('width:34px;height:38px;border-radius:8px;background:#FEF1F1;display:flex;align-items:center;justify-content:center;flex:none')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
      </div>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
        <div style={css('font-size:12.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {post.fileName ?? 'Document.pdf'}
        </div>
        <div style={css('font-size:11px;color:#94A3B8')}>
          {post.mediaPurged ? 'Removed (6-month retention)' : bytes(post.sizeBytes ?? 0)}
        </div>
      </div>
      {url && !post.mediaPurged && (
        <a href={url} target="_blank" rel="noreferrer" style={css('display:flex;flex:none')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer')}><path d="M12 4v11M7.6 11l4.4 4.4L16.4 11M5 19.6h14" /></svg>
        </a>
      )}
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
