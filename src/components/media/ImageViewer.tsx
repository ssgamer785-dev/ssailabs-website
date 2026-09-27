import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { MediaActions } from './MediaActions';

export function ImageViewer({ storageKey, fileName, getUrl, onClose }: {
  storageKey: string; fileName: string | null; getUrl: (key: string, force: boolean) => Promise<string>; onClose: () => void;
}) {
  const media = useLazyMediaUrl(storageKey, getUrl);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; fromX: number; fromY: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const zoom = (next: number) => {
    const bounded = Math.min(4, Math.max(1, next));
    setScale(bounded);
    if (bounded === 1) setOffset({ x: 0, y: 0 });
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Image viewer" onClick={event => event.stopPropagation()}
      style={css('position:fixed;inset:0;z-index:1000;background:#080c16;color:#fff;display:flex;flex-direction:column')}>
      <div style={css('flex:none;display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top, 0px)) 16px 12px')}>
        <button type="button" onClick={onClose} aria-label="Close image" style={css('color:#fff;font-size:24px;cursor:pointer;min-width:44px;min-height:44px')}>×</button>
        <div style={css('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px')}>{fileName ?? 'Image'}</div>
        <div style={css('background:#fff;border-radius:8px;padding:8px')}><MediaActions storageKey={storageKey} fileName={fileName} getUrl={getUrl} /></div>
      </div>
      <div ref={media.ref} onPointerDown={event => {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        event.currentTarget.setPointerCapture(event.pointerId);
        if (pointers.current.size === 1 && scale > 1) drag.current = { x: event.clientX, y: event.clientY, fromX: offset.x, fromY: offset.y };
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
          drag.current = null;
        }
      }} onPointerMove={event => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2 && pinch.current) {
          const [a, b] = [...pointers.current.values()];
          zoom(pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.current.distance));
          return;
        }
        if (!drag.current) return;
        setOffset({ x: drag.current.fromX + event.clientX - drag.current.x, y: drag.current.fromY + event.clientY - drag.current.y });
      }} onPointerUp={event => { pointers.current.delete(event.pointerId); drag.current = null; pinch.current = null; }} onPointerCancel={event => { pointers.current.delete(event.pointerId); drag.current = null; pinch.current = null; }}
        onDoubleClick={() => zoom(scale === 1 ? 2 : 1)}
        onWheel={event => { if (event.ctrlKey) { event.preventDefault(); zoom(scale + (event.deltaY < 0 ? .25 : -.25)); } }}
        style={css('flex:1;min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center;touch-action:none')}>
        {media.failed ? <div role="alert" style={css('text-align:center;padding:24px;display:flex;flex-direction:column;gap:14px;align-items:center')}>
          <span>{media.error ?? 'Could not load image.'}</span>
          <button type="button" onClick={media.forceRetry} style={css('background:#fff;color:#0b172b;border-radius:9px;padding:10px 18px;font-weight:700')}>Try again</button>
        </div> : media.url ? <img src={media.url} alt={fileName ?? 'Image'} onError={media.retry} draggable={false}
          style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, userSelect: 'none' }} />
          : <div aria-live="polite">Loading image…</div>}
      </div>
      <div style={css('flex:none;display:flex;justify-content:center;align-items:center;gap:14px;padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px))')}>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(scale - .5)} style={css('color:#fff;font-size:22px;min-width:44px;min-height:44px')}>−</button>
        <span style={css('font-size:12px;min-width:45px;text-align:center')}>{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoom(scale + .5)} style={css('color:#fff;font-size:22px;min-width:44px;min-height:44px')}>+</button>
        <button type="button" onClick={() => zoom(1)} style={css('color:#fff;font-size:12px;min-height:44px')}>Reset</button>
      </div>
    </div>, document.body,
  );
}
