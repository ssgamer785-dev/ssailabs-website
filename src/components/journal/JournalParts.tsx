import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { css } from '../../lib/css';
import { ImageViewer } from '../media/ImageViewer';
import { MediaShimmer } from '../media/MediaPicture';
import { screenshotUrl } from '../../lib/journal/api';
import { formatMoney, resultLabel, type Direction, type JournalTrade, type TradeResult } from '../../lib/journal/model';

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

/** The result, with the money where it was recorded: "+$210" over "Profit". */
export function ResultValue({ trade, align = 'right' }: { trade: Pick<JournalTrade, 'result' | 'pnlAmount' | 'pnlCurrency'>; align?: 'left' | 'right' }) {
  const color = resultColor(trade.result);
  const money = trade.pnlAmount !== null && trade.pnlCurrency ? formatMoney(trade.pnlAmount, trade.pnlCurrency) : null;
  return (
    <div style={{ ...css('display:flex;flex-direction:column;gap:2px;min-width:0'), alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <span style={{ ...css('font-size:13px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums'), color }}>{money ?? resultLabel[trade.result]}</span>
      {money && <span style={css('font-size:10px;color:var(--text-faint);white-space:nowrap')}>{resultLabel[trade.result]}</span>}
    </div>
  );
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
 * A trade's chart screenshot at a comfortable size, from a short-lived signed
 * address for the owner's own trade. Tap to open it full screen (pinch/zoom).
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
    screenshotUrl(trade.id, shot.key, attempt > 0)
      .then(next => { if (live) setUrl(next); })
      .catch(error => { if (live) setFailed(error instanceof Error ? error.message : 'Could not load the screenshot.'); });
    return () => { live = false; };
  }, [trade.id, shot.key, attempt]);

  const ratio = shot.width && shot.height ? `${shot.width} / ${shot.height}` : '16 / 10';
  const getUrl = (_key: string, force?: boolean) => screenshotUrl(trade.id, shot.key, !!force);

  return (
    <>
      <div style={{ ...css('position:relative;width:100%;border-radius:14px;overflow:hidden;background:var(--surface-sunken-2);border:1px solid var(--border-4)'),
        aspectRatio: ratio, maxHeight: 'min(420px, 60vh)' }}>
        {failed ? (
          <div role="alert" style={css('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;text-align:center;font-size:12px;color:var(--text-muted)')}>
            {failed}
            <button type="button" onClick={() => setAttempt(n => n + 1)} style={css('font-size:12.5px;font-weight:700;color:var(--accent-ink);cursor:pointer')}>Try again</button>
          </div>
        ) : (
          <button type="button" onClick={() => url && setOpen(true)} aria-label="Open the full screenshot" disabled={!url}
            style={css('position:absolute;inset:0;display:block;width:100%;height:100%;padding:0;border:0;background:transparent;cursor:zoom-in')}>
            {!loaded && <MediaShimmer />}
            {url && <img src={url} alt={`Chart screenshot for ${trade.symbol}`} data-testid="journal-screenshot"
              onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed('Could not load the screenshot.'); }}
              style={{ ...css('width:100%;height:100%;object-fit:contain;display:block'), opacity: loaded ? 1 : 0, transition: 'opacity .2s ease' }} />}
          </button>
        )}
      </div>
      {open && <ImageViewer storageKey={shot.key} fileName={`${trade.symbol}-chart`} getUrl={getUrl} onClose={() => setOpen(false)} />}
    </>
  );
}

/** One labelled fact on the trade page. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={css('display:flex;flex-direction:column;gap:5px;min-width:0;padding:12px 13px;border-radius:13px;background:var(--surface-secondary)')}>
      <div style={css('font-size:10.5px;font-weight:600;color:var(--text-muted);letter-spacing:.02em')}>{label}</div>
      <div style={css('font-size:14px;font-weight:700;color:var(--text-primary);min-width:0;overflow-wrap:anywhere')}>{children}</div>
    </div>
  );
}
