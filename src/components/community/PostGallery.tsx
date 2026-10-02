import { useState } from 'react';
import { css } from '../../lib/css';
import { getPostMediaUrl } from '../../lib/community/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { feedAspectRatio } from '../../lib/media/dimensions';
import { mosaicLayout } from '../../lib/media/gallery-layout';
import type { FeedPost } from '../../lib/community/useFeed';
import { MediaCarousel, type CarouselItem } from '../media/MediaCarousel';
import { MediaActions } from '../media/MediaActions';
import { DocumentViewer } from '../media/DocumentViewer';

/** One attachment of a post, the first (from the post) or an extra one. */
interface GalleryEntry {
  key: string;
  kind: 'image' | 'video' | 'pdf' | 'file';
  storageKey: string | null;
  posterKey: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  purged: boolean;
}

function entries(post: FeedPost): GalleryEntry[] {
  const list: GalleryEntry[] = [];
  if (post.attachment === 'image' || post.attachment === 'video' || post.attachment === 'pdf' || post.attachment === 'file') {
    list.push({
      key: `${post.id}:0`, kind: post.attachment, storageKey: post.storageKey, posterKey: post.posterKey,
      fileName: post.fileName, sizeBytes: post.sizeBytes, width: post.firstMediaSize?.width ?? null,
      height: post.firstMediaSize?.height ?? null, purged: post.mediaPurged,
    });
  }
  for (const item of post.extraMedia ?? []) {
    list.push({
      key: item.id, kind: item.kind, storageKey: item.storageKey, posterKey: item.posterKey, fileName: item.fileName,
      sizeBytes: item.sizeBytes, width: item.width, height: item.height, purged: item.mediaPurged,
    });
  }
  return list;
}

function bytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Tile({ entry, onOpen, more, label }: { entry: GalleryEntry; onOpen: () => void; more: number; label: string }) {
  // A video tile shows its poster frame; the video itself loads only in the viewer.
  const picture = useLazyMediaUrl(entry.purged ? null : entry.kind === 'video' ? entry.posterKey : entry.storageKey, getPostMediaUrl);
  const [loaded, setLoaded] = useState(false);
  return (
    <button type="button" ref={picture.ref} onClick={event => { event.stopPropagation(); onOpen(); }} aria-label={label}
      style={css('position:relative;display:block;width:100%;height:100%;padding:0;border:0;overflow:hidden;background:var(--surface-sunken-2);cursor:zoom-in')}>
      {entry.purged ? (
        <span style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-faint);padding:8px;text-align:center')}>Removed (6-month retention)</span>
      ) : picture.url && !picture.failed ? (
        <img src={picture.url} alt="" decoding="async" loading="lazy" onLoad={() => setLoaded(true)}
          style={{ ...css('width:100%;height:100%;object-fit:cover;display:block;transition:opacity .25s ease'), opacity: loaded ? 1 : 0 }} />
      ) : picture.failed ? (
        <span style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text-faint)')}>Could not load</span>
      ) : null}
      {entry.kind === 'video' && !entry.purged && (
        <span aria-hidden="true" style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l12-7.5z" /></svg>
        </span>
      )}
      {more > 0 && (
        <span style={css('position:absolute;inset:0;background:rgba(8,12,22,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700')}>+{more}</span>
      )}
    </button>
  );
}

function DocumentRow({ entry }: { entry: GalleryEntry }) {
  const [open, setOpen] = useState(false);
  const isPdf = entry.kind === 'pdf';
  return (
    <div onClick={entry.storageKey && !entry.purged ? event => { event.stopPropagation(); setOpen(true); } : undefined}
      style={css('background:var(--surface);border:1px solid var(--border-2);border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:11px;cursor:pointer')}>
      <div style={{ ...css('width:32px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:none'), background: isPdf ? 'var(--danger-soft)' : 'var(--accent-tint)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isPdf ? 'var(--danger-ink)' : 'var(--accent-ink)'} strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
      </div>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <div style={css('font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{entry.fileName ?? (isPdf ? 'Document.pdf' : 'Attachment')}</div>
        <div style={css('font-size:11px;color:var(--text-faint)')}>{entry.purged ? 'Removed (6-month retention)' : bytes(entry.sizeBytes)}</div>
      </div>
      {!entry.purged && <MediaActions storageKey={entry.storageKey} fileName={entry.fileName} getUrl={getPostMediaUrl} />}
      {open && entry.storageKey && <DocumentViewer storageKey={entry.storageKey} fileName={entry.fileName} isPdf={isPdf} getUrl={getPostMediaUrl} onClose={() => setOpen(false)} />}
    </div>
  );
}

/**
 * A post with several attachments: its photos and videos as an album mosaic
 * (tap for the full-screen swipe viewer), its documents as rows below.
 * Every tile reserves its space before anything loads.
 */
export function PostGallery({ post }: { post: FeedPost }) {
  const all = entries(post);
  const visual = all.filter(e => (e.kind === 'image' || e.kind === 'video') && (e.storageKey || e.purged));
  const documents = all.filter(e => e.kind === 'pdf' || e.kind === 'file');
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const first = visual[0];
  const layout = mosaicLayout(visual.length, feedAspectRatio(first?.width && first?.height ? { width: first.width, height: first.height } : null));
  const carousel: CarouselItem[] = visual.filter(e => e.storageKey && !e.purged)
    .map(e => ({ key: e.key, kind: e.kind as 'image' | 'video', storageKey: e.storageKey!, posterKey: e.posterKey, fileName: e.fileName }));

  return (
    <div style={css('display:flex;flex-direction:column;gap:8px')}>
      {layout && (
        <div role="group" aria-label={`${visual.length} photo${visual.length === 1 ? '' : 's'} and video${visual.length === 1 ? '' : 's'}`}
          style={{ display: 'grid', gridTemplateColumns: layout.columns, gridTemplateRows: layout.rows, gap: 3, aspectRatio: String(layout.aspectRatio), borderRadius: 12, overflow: 'hidden', width: '100%' }}>
          {layout.tiles.map(tile => {
            const entry = visual[tile.index];
            const at = carousel.findIndex(c => c.key === entry.key);
            return (
              <div key={entry.key} style={{ gridColumn: tile.column, gridRow: tile.row, minWidth: 0, minHeight: 0 }}>
                <Tile entry={entry} more={tile.more} onOpen={() => { if (at >= 0) setViewerAt(at); }}
                  label={`Open ${entry.kind === 'video' ? 'video' : 'photo'} ${tile.index + 1} of ${visual.length}`} />
              </div>
            );
          })}
        </div>
      )}
      {documents.map(entry => <DocumentRow key={entry.key} entry={entry} />)}
      {viewerAt !== null && carousel.length > 0 && (
        <MediaCarousel items={carousel} start={viewerAt} getUrl={getPostMediaUrl} onClose={() => setViewerAt(null)} />
      )}
    </div>
  );
}

/** Whether a post needs the gallery (more than one attachment). */
export function hasGallery(post: Pick<FeedPost, 'extraMedia'>): boolean {
  return (post.extraMedia?.length ?? 0) > 0;
}
