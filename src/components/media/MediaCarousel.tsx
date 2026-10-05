import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { MediaActions } from './MediaActions';

export interface CarouselItem {
  key: string;
  kind: 'image' | 'video';
  storageKey: string;
  posterKey: string | null;
  fileName: string | null;
}

type GetUrl = ((key: string, force?: boolean) => Promise<string>) & { prepared?: (key: string) => string | null };

function Slide({ item, active, getUrl }: { item: CarouselItem; active: boolean; getUrl: GetUrl }) {
  // Only the visible slide and its neighbours sign and load their media.
  const media = useLazyMediaUrl(item.storageKey, getUrl, { rootMargin: '100% 100%' });
  const poster = useLazyMediaUrl(item.kind === 'video' ? item.posterKey : null, getUrl, { rootMargin: '100% 100%' });
  // A photo the album tile already shows (its display copy) appears at once; the full original replaces it when it arrives.
  const [preview] = useState(() => (item.kind === 'image' ? getUrl.prepared?.(item.storageKey) ?? null : null));
  const [full, setFull] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!active) videoRef.current?.pause(); }, [active]);
  return (
    <div ref={media.ref} style={css('flex:none;width:100%;height:100%;scroll-snap-align:center;scroll-snap-stop:always;display:flex;align-items:center;justify-content:center;position:relative')}>
      {media.failed ? (
        <div role="alert" style={css('text-align:center;display:flex;flex-direction:column;gap:12px;align-items:center;font-size:13px')}>
          {media.error ?? 'This attachment could not be loaded.'}
          <button type="button" onClick={media.forceRetry} style={css('color:#fff;font-weight:700;border:1px solid rgba(255,255,255,.4);border-radius:10px;padding:8px 16px')}>Try again</button>
        </div>
      ) : !media.url && !preview ? (
        <div aria-label="Loading" style={css('width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:spin 1s linear infinite')} />
      ) : item.kind === 'video' && media.url ? (
        <video ref={videoRef} src={media.url} poster={poster.url ?? undefined} controls playsInline preload="metadata"
          style={css('max-width:100%;max-height:100%;background:#000')} />
      ) : (
        <>
          {preview && !full && <img src={preview} alt="" aria-hidden="true" draggable={false}
            style={css('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none')} />}
          {media.url && <img src={media.url} alt={item.fileName ?? 'Photo'} decoding="async" draggable={false} onLoad={() => setFull(true)}
            style={{ ...css('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none'), opacity: full || !preview ? 1 : 0 }} />}
        </>
      )}
    </div>
  );
}

/**
 * Full-screen viewer for a post's photos and videos: swipe (or arrow keys)
 * between them, a counter, and download for the one on screen. Built on
 * native scroll-snap, so the swipe feels like the phone's own and keeps
 * working with a mouse, a trackpad and the keyboard.
 */
export function MediaCarousel({ items, start, getUrl, onClose }: {
  items: CarouselItem[]; start: number; getUrl: GetUrl; onClose: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(Math.max(0, Math.min(items.length - 1, start)));

  /**
   * The slide a Next/Previous is already scrolling to. `index` only changes once
   * the smooth scroll passes the middle, so stepping from it lost presses made
   * in quick succession; steps count from where the viewer is going instead.
   */
  const target = useRef<number | null>(null);
  const go = useCallback((next: number) => {
    const el = track.current;
    if (!el) return;
    const bounded = Math.max(0, Math.min(items.length - 1, next));
    target.current = bounded;
    el.scrollTo({ left: bounded * el.clientWidth, behavior: 'smooth' });
  }, [items.length]);
  const step = useCallback((delta: number) => go((target.current ?? index) + delta), [go, index]);

  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = index * el.clientWidth;
    // Only on open: later moves come from the member.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, onClose]);

  const current = items[index];
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photos and videos" onClick={event => event.stopPropagation()}
      style={css('position:fixed;inset:0;z-index:1000;background:#080c16;color:#fff;display:flex;flex-direction:column')}>
      <div style={css('flex:none;display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top, 0px)) 16px 12px')}>
        <button type="button" onClick={onClose} aria-label="Close viewer" style={css('color:#fff;font-size:24px;cursor:pointer;min-width:44px;min-height:44px')}>×</button>
        <div aria-live="polite" style={css('flex:1;min-width:0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums')}>{index + 1} / {items.length}</div>
        {current && <div style={css('background:#fff;border-radius:8px;padding:8px')}><MediaActions storageKey={current.storageKey} fileName={current.fileName} getUrl={getUrl} /></div>}
      </div>
      <div ref={track} onScroll={event => {
        const el = event.currentTarget;
        const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        if (next !== index) setIndex(next);
        if (next === target.current && Math.abs(el.scrollLeft - next * el.clientWidth) < 2) target.current = null;
      }}
      // A swipe (or a trackpad scroll) takes over from any Next/Previous still scrolling.
      onPointerDown={() => { target.current = null; }} onTouchStart={() => { target.current = null; }} onWheel={() => { target.current = null; }}
      style={css('flex:1;min-height:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior:contain')}>
        {items.map((item, i) => <Slide key={item.key} item={item} active={i === index} getUrl={getUrl} />)}
      </div>
      {items.length > 1 && (
        <div style={css('flex:none;display:flex;align-items:center;justify-content:center;gap:18px;padding:12px 16px calc(14px + env(safe-area-inset-bottom, 0px))')}>
          <button type="button" onClick={() => step(-1)} disabled={index === 0} aria-label="Previous"
            style={{ ...css('min-width:44px;min-height:44px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:20px;cursor:pointer'), opacity: index === 0 ? 0.35 : 1 }}>‹</button>
          <div aria-hidden="true" style={css('display:flex;gap:6px')}>
            {items.map((item, i) => <span key={item.key} style={{ width: 6, height: 6, borderRadius: '50%', background: i === index ? '#fff' : 'rgba(255,255,255,.35)' }} />)}
          </div>
          <button type="button" onClick={() => step(1)} disabled={index === items.length - 1} aria-label="Next"
            style={{ ...css('min-width:44px;min-height:44px;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font-size:20px;cursor:pointer'), opacity: index === items.length - 1 ? 0.35 : 1 }}>›</button>
        </div>
      )}
    </div>,
    document.body,
  );
}
