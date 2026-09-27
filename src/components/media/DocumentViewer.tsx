import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { MediaActions } from './MediaActions';

/**
 * Whether this browser can draw a PDF inside the page. Chrome for Android has
 * no built-in PDF viewer, so an inline frame stays blank there (TP-054); the
 * browser says so through navigator.pdfViewerEnabled where it supports it.
 */
export function canShowPdfInline(nav: Pick<Navigator, 'userAgent'> & { pdfViewerEnabled?: boolean } = navigator): boolean {
  if (typeof nav.pdfViewerEnabled === 'boolean') return nav.pdfViewerEnabled;
  return !/Android/i.test(nav.userAgent);
}

export function DocumentViewer({ storageKey, fileName, isPdf, getUrl, onClose }: {
  storageKey: string; fileName: string | null; isPdf: boolean;
  getUrl: (key: string, force: boolean) => Promise<string>; onClose: () => void;
}) {
  const media = useLazyMediaUrl(storageKey, getUrl);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Document viewer" onClick={event => event.stopPropagation()}
    style={css('position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:#080c16;color:#fff')}>
    <div style={css('display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top, 0px)) 16px 12px')}>
      <button type="button" aria-label="Close document" onClick={onClose} style={css('color:#fff;font-size:24px;min-width:44px;min-height:44px')}>×</button>
      <span style={css('flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px')}>{fileName ?? 'Document'}</span>
      <div style={css('background:#fff;border-radius:8px;padding:8px')}><MediaActions storageKey={storageKey} fileName={fileName} getUrl={getUrl} /></div>
    </div>
    <div ref={media.ref} style={css('flex:1;min-height:0;display:flex;align-items:center;justify-content:center')}>
      {media.failed ? <div role="alert" style={css('padding:24px;text-align:center')}>
        <div>{media.error ?? 'Could not load document.'}</div>
        <button type="button" onClick={media.forceRetry} style={css('margin-top:12px;background:#fff;color:#0b172b;border-radius:8px;padding:10px 18px')}>Try again</button>
      </div> : !media.url ? 'Loading document…' : isPdf && canShowPdfInline() ?
        <iframe title={fileName ?? 'PDF'} src={media.url} style={css('width:100%;height:100%;border:0;background:#fff')} /> :
        isPdf ? <div style={css('padding:24px;text-align:center;font-size:13px;line-height:1.5;display:flex;flex-direction:column;align-items:center;gap:14px')}>
          <div>This phone shows PDFs in its own viewer.</div>
          <a href={media.url} target="_blank" rel="noopener noreferrer"
            style={css('min-height:44px;display:inline-flex;align-items:center;padding:0 22px;border-radius:12px;background:#fff;color:#0b172b;font-weight:700;text-decoration:none')}>Open PDF</a>
        </div> :
        <div style={css('padding:24px;text-align:center;font-size:13px;line-height:1.5')}>This file type has no built-in preview. Use Download to open it in a compatible app.</div>}
    </div>
  </div>, document.body);
}
