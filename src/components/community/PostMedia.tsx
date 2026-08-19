import { useEffect, useState } from 'react';
import { css } from '../../lib/css';
import { getPostMediaUrl } from '../../lib/community/media-api';
import { CandleChart } from '../CandleChart';
import type { FeedPost } from '../../lib/community/useFeed';

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The attachment area of a post card. Falls back to the generated candlestick
 * placeholder when a post carries no uploaded media, which is what the original
 * design showed.
 */
export function PostMedia({ post, height }: { post: FeedPost; height: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const key = post.storageKey;
  const isFile = post.attachment === 'image' || post.attachment === 'video';

  useEffect(() => {
    if (!key || !isFile || post.mediaPurged) return;
    let active = true;
    getPostMediaUrl(key)
      .then(u => { if (active) setUrl(u); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [key, isFile, post.mediaPurged]);

  if (post.attachment === 'pdf' && key) {
    return <PdfRow post={post} />;
  }

  // No uploaded media: keep the design's chart placeholder.
  if (!isFile || !key || post.mediaPurged) {
    return (
      <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden' }}>
        <CandleChart seed={post.chartSeed ?? 4} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: '#EDF0F5' }}>
      {failed || !url ? (
        <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11.5px;color:#94A3B8')}>
          {failed ? 'Could not load attachment' : 'Loading…'}
        </div>
      ) : post.attachment === 'video' ? (
        <video src={url} controls playsInline preload="metadata" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
      ) : (
        <img src={url} alt={post.fileName ?? 'Attachment'} loading="lazy" decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
      )}
    </div>
  );
}

/** PDF attachment, styled like the chat screen's document card. */
export function PdfRow({ post }: { post: FeedPost }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = post.storageKey;

  useEffect(() => {
    if (!key || post.mediaPurged) return;
    let active = true;
    getPostMediaUrl(key).then(u => { if (active) setUrl(u); }).catch(() => {});
    return () => { active = false; };
  }, [key, post.mediaPurged]);

  return (
    <div style={css('background:#FFFFFF;border:1px solid #EDF0F6;border-radius:12px;padding:11px 12px;display:flex;align-items:center;gap:11px')}>
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
