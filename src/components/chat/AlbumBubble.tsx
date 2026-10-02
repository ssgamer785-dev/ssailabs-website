import { useState } from 'react';
import { css } from '../../lib/css';
import { getMediaUrl } from '../../lib/chat/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { mosaicLayout } from '../../lib/media/gallery-layout';
import type { ChatMessage } from '../../lib/chat/types';
import { MediaCarousel, type CarouselItem } from '../media/MediaCarousel';
import { MetaRow } from './bubble-parts';
import { Avatar } from '../ui/Avatar';
import logo from '../../assets/traders-planet-mark.png';

function AlbumTile({ message, more, onOpen, onRetry, onCancel, out, label }: {
  message: ChatMessage; more: number; onOpen: () => void; onRetry: () => void; onCancel: () => void; out: boolean; label: string;
}) {
  const isVideo = message.kind === 'video';
  const local = isVideo ? message.localPosterUrl : message.localPreviewUrl;
  const remote = useLazyMediaUrl(local ? null : (isVideo ? message.posterKey : message.storageKey), getMediaUrl);
  const url = local ?? remote.url;
  const uploading = message.status === 'uploading' || message.status === 'sending';
  const failed = message.status === 'failed';
  return (
    <div ref={remote.ref} style={css('position:relative;width:100%;height:100%;overflow:hidden;background:var(--surface-sunken-2)')}>
      <button type="button" onClick={onOpen} disabled={uploading || failed || message.mediaPurged} aria-label={label}
        style={css('display:block;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:zoom-in')}>
        {message.mediaPurged ? (
          <span style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10.5px;color:var(--text-faint);text-align:center;padding:6px')}>Removed</span>
        ) : url ? (
          <img src={url} alt="" decoding="async" loading="lazy" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
        ) : null}
        {isVideo && !uploading && !failed && !message.mediaPurged && (
          <span aria-hidden="true" style={css('position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l12-7.5z" /></svg>
          </span>
        )}
        {more > 0 && (
          <span style={css('position:absolute;inset:0;background:rgba(8,12,22,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700')}>+{more}</span>
        )}
      </button>
      {uploading && (
        <div style={css('position:absolute;inset:0;background:rgba(8,12,22,.35);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff')}>
          <span style={css('font-size:12px;font-weight:700')}>{Math.round((message.progress ?? 0) * 100)}%</span>
          {out && <button type="button" onClick={onCancel} aria-label={`Cancel ${label}`}
            style={css('width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
          </button>}
          <div aria-hidden="true" style={css('position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.3)')}>
            <div style={{ ...css('height:100%;background:var(--accent)'), width: `${Math.round((message.progress ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}
      {failed && out && (
        <button type="button" onClick={onRetry} aria-label={`Retry ${label}`}
          style={css('position:absolute;inset:0;background:rgba(170,30,30,.5);color:#fff;font-size:11.5px;font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3M4.5 18v-5h5" /></svg>
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Photos and videos sent together, as one album: a mosaic in the bubble,
 * each item with its own upload progress, cancel and retry, and the
 * full-screen swipe viewer on tap.
 */
export function AlbumBubble({ messages, out, incomingIsAdmin, incomingName, incomingAvatarKey, onRetry, onCancel, onDeleteAll }: {
  messages: ChatMessage[];
  out: boolean;
  incomingIsAdmin: boolean;
  incomingName: string;
  incomingAvatarKey: string | null;
  onRetry: (clientId: string) => void;
  onCancel: (clientId: string) => void;
  onDeleteAll: () => Promise<void>;
}) {
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const layout = mosaicLayout(messages.length)!;
  const last = messages[messages.length - 1];
  const viewable: CarouselItem[] = messages.filter(m => m.storageKey && !m.mediaPurged && m.status === 'sent')
    .map(m => ({ key: m.clientId, kind: m.kind === 'video' ? 'video' : 'image', storageKey: m.storageKey!, posterKey: m.posterKey, fileName: m.fileName }));
  const kindLabel = messages.every(m => m.kind === 'image') ? 'photos' : messages.every(m => m.kind === 'video') ? 'videos' : 'photos and videos';

  return (
    <div style={out ? css('display:flex;justify-content:flex-end') : css('display:flex;align-items:flex-end;gap:9px')}>
      {!out && (incomingIsAdmin
        ? <div style={css('width:30px;height:30px;border-radius:50%;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;flex:none')}><img src={logo} alt="Admin" style={css('width:24px;height:24px;object-fit:contain')} /></div>
        : <Avatar name={incomingName} avatarKey={incomingAvatarKey} size={30} fontSize={12} />)}
      <div style={css('display:flex;flex-direction:column;gap:5px;align-items:flex-end')}>
        <div role="group" aria-label={`${messages.length} ${kindLabel}`}
          style={{ width: 236, display: 'grid', gridTemplateColumns: layout.columns, gridTemplateRows: layout.rows, gap: 2,
            aspectRatio: String(layout.aspectRatio), borderRadius: out ? '16px 16px 5px 16px' : '16px 16px 16px 5px', overflow: 'hidden',
            border: `3px solid ${out ? 'var(--accent-soft-2)' : 'var(--surface-secondary-2)'}` }}>
          {layout.tiles.map(tile => {
            const message = messages[tile.index];
            const at = viewable.findIndex(v => v.key === message.clientId);
            return (
              <div key={message.clientId} id={`message-${message.id}`} style={{ gridColumn: tile.column, gridRow: tile.row, minWidth: 0, minHeight: 0 }}>
                <AlbumTile message={message} more={tile.more} out={out}
                  label={`${message.kind === 'video' ? 'Video' : 'Photo'} ${tile.index + 1} of ${messages.length}`}
                  onOpen={() => setViewerAt(Math.max(0, at))}
                  onRetry={() => onRetry(message.clientId)}
                  onCancel={() => onCancel(message.clientId)} />
              </div>
            );
          })}
        </div>
        <MetaRow message={last} out={out} />
        {out && !confirming && messages.every(m => m.status === 'sent') && (
          <button type="button" aria-label="Album options" onClick={() => setConfirming(true)} style={css('color:var(--text-faint);font-size:15px;padding:0 5px;line-height:1')}>⋯</button>
        )}
        {confirming && (
          <div style={css('display:flex;align-items:center;gap:8px;padding:2px 4px')}>
            <button type="button" disabled={deleting} onClick={() => {
              setDeleting(true);
              void onDeleteAll().then(() => setConfirming(false)).catch(() => {}).finally(() => setDeleting(false));
            }} style={css('font-size:11px;font-weight:700;color:var(--danger-ink);cursor:pointer;white-space:nowrap')}>{deleting ? 'Working…' : `Delete all ${messages.length}`}</button>
            <button type="button" onClick={() => setConfirming(false)} style={css('font-size:11px;color:var(--text-muted)')}>Cancel</button>
          </div>
        )}
      </div>
      {viewerAt !== null && viewable.length > 0 && (
        <MediaCarousel items={viewable} start={viewerAt} getUrl={getMediaUrl} onClose={() => setViewerAt(null)} />
      )}
    </div>
  );
}
