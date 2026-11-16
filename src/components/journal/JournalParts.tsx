import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { ImageViewer } from '../media/ImageViewer';
import { MediaShimmer } from '../media/MediaPicture';
import { screenshotUrl } from '../../lib/journal/api';
import type { Direction, JournalTrade, TradeResult } from '../../lib/journal/model';
import { previewRatio } from '../../lib/journal/screenshot';
import { symbolLabel } from '../../lib/journal/symbols';

/** BUY / SELL, in the colours a trader expects. */
export function DirectionBadge({ direction, size = 'small' }: { direction: Direction; size?: 'small' | 'large' }) {
  const buy = direction === 'buy';
  return (
    <span data-testid="direction-badge" style={{
      ...css('display:inline-flex;align-items:center;gap:3px;border-radius:6px;font-weight:700;letter-spacing:.04em;line-height:1;white-space:nowrap'),
      padding: size === 'large' ? '5px 8px' : '3px 6px', fontSize: size === 'large' ? 11.5 : 9.5,
      background: buy ? 'var(--success-soft)' : 'var(--danger-soft)', color: buy ? 'var(--success-ink)' : 'var(--danger-ink)',
    }}>
      <span aria-hidden="true">{buy ? '↑' : '↓'}</span>{buy ? 'BUY' : 'SELL'}
    </span>
  );
}

export function resultColor(result: TradeResult): string {
  return result === 'profit' ? 'var(--success-ink)' : result === 'loss' ? 'var(--danger-ink)' : 'var(--text-muted)';
}

/** A small dialog over the page: a question and two answers. */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', danger, busy, error, onConfirm, onCancel }: {
  title: string; body: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean; busy?: boolean; error?: string | null;
  onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return createPortal(
    <div onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}
      style={css('position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(7,15,31,.52);backdrop-filter:blur(4px)')}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="journal-dialog-title" aria-describedby="journal-dialog-body"
        style={css('width:100%;max-width:360px;padding:22px;border:1px solid var(--border);border-radius:20px;background:var(--surface);box-shadow:0 20px 60px rgba(0,0,0,.24);display:flex;flex-direction:column;gap:14px')}>
        <div id="journal-dialog-title" style={css('font-size:16px;font-weight:700;letter-spacing:-.25px;color:var(--text-primary)')}>{title}</div>
        <div id="journal-dialog-body" style={css('font-size:13px;color:var(--text-muted);line-height:1.5')}>{body}</div>
        {error && <div role="alert" style={css('font-size:12px;color:var(--danger-ink);line-height:1.45')}>{error}</div>}
        <div style={css('display:flex;justify-content:flex-end;gap:10px')}>
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}
            style={css('min-height:42px;padding:0 15px;border:1px solid var(--border);border-radius:11px;background:var(--surface-secondary);color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer')}>
            {cancelLabel}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm}
            style={{ ...css('min-height:42px;padding:0 15px;border:0;border-radius:11px;color:white;font-size:13px;font-weight:700;cursor:pointer'),
              background: danger ? 'var(--danger-solid)' : 'var(--accent)', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * The frame a chart screenshot sits in: the picture's own proportions (very
 * tall or very wide ones letterboxed, never cropped), shown whole with
 * object-fit: contain, and a tap opens it full screen.
 */
export function ScreenshotFrame({ src, alt, width, height, onOpen, loaded, onLoad, onError, testId, children }: {
  src: string | null; alt: string; width: number | null; height: number | null; onOpen?: () => void; loaded: boolean;
  onLoad?: () => void; onError?: () => void; testId?: string; children?: ReactNode;
}) {
  return (
    <div data-testid="screenshot-frame" style={{ ...css('position:relative;width:100%;border-radius:14px;overflow:hidden;background:var(--surface-sunken-2);border:1px solid var(--border-4)'),
      aspectRatio: String(previewRatio(width, height)) }}>
      <button type="button" onClick={onOpen} disabled={!onOpen || !src} aria-label="Open the full screenshot"
        style={css('position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:zoom-in;display:block')}>
        {!loaded && <MediaShimmer />}
        {src && <img src={src} alt={alt} data-testid={testId} draggable={false} onLoad={onLoad} onError={onError}
          style={{ ...css('position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;-webkit-touch-callout:none;user-select:none'),
            opacity: loaded ? 1 : 0, transition: 'opacity .2s ease' }} />}
      </button>
      {src && loaded && onOpen && (
        <span aria-hidden="true" style={css('position:absolute;right:8px;bottom:8px;width:30px;height:30px;border-radius:9px;background:rgba(7,15,31,.55);color:#fff;display:flex;align-items:center;justify-content:center;pointer-events:none')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></svg>
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * A saved trade's chart screenshot, from a short-lived signed address issued
 * for the owner's own trade only. Tap to open it full screen (pinch and zoom).
 */
export function JournalScreenshot({ trade }: { trade: JournalTrade }) {
  const shot = trade.screenshot!;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(null);
    setLoaded(false);
    screenshotUrl(trade.id, shot.key, attempt > 0)
      .then(next => { if (live) setUrl(next); })
      .catch(error => { if (live) setFailed(error instanceof Error ? error.message : 'Could not load the screenshot.'); });
    return () => { live = false; };
  }, [trade.id, shot.key, attempt]);

  const getUrl = (_key: string, force?: boolean) => screenshotUrl(trade.id, shot.key, !!force);

  if (failed) {
    return (
      <div role="alert" style={{ ...css('width:100%;border-radius:14px;background:var(--surface-sunken-2);border:1px solid var(--border-4);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;font-size:12.5px;color:var(--text-muted)'),
        aspectRatio: String(previewRatio(shot.width, shot.height)) }}>
        {failed}
        <button type="button" onClick={() => { setUrl(null); setAttempt(n => n + 1); }} className="jr-chip pressable">Try again</button>
      </div>
    );
  }
  return (
    <>
      <ScreenshotFrame src={url} alt={`Chart screenshot for ${symbolLabel(trade.symbol)}`} width={shot.width} height={shot.height} loaded={loaded}
        testId="journal-screenshot" onOpen={() => setOpen(true)} onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(false); setFailed('Could not load the screenshot.'); }} />
      {open && <ImageViewer storageKey={shot.key} fileName={`${trade.symbol}-chart`} getUrl={getUrl} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A short confirmation over the screen ("Trade saved"), above the bottom bar; it goes by itself. */
export function JournalToast({ message, tone = 'good', aboveNav }: { message: string | null; tone?: 'good' | 'neutral'; aboveNav?: boolean }) {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" data-testid="journal-toast"
      style={{ ...css('position:absolute;left:16px;right:16px;z-index:30;display:flex;justify-content:center;pointer-events:none'),
        bottom: aboveNav ? 'calc(var(--nav-space) + 12px)' : 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
      <span style={css('display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:11px 16px;border-radius:999px;background:var(--text-primary);color:var(--surface);font-size:13px;font-weight:600;box-shadow:0 10px 30px rgba(var(--shadow-rgb),.25)')}>
        <span aria-hidden="true" style={{ ...css('width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:none'),
          background: tone === 'good' ? 'var(--success)' : 'var(--text-muted)', color: '#fff' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d={tone === 'good' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6 12h12'} /></svg>
        </span>
        {message}
      </span>
    </div>
  );
}
