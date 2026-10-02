import { css } from '../../lib/css';
import type { UploadItem } from '../../lib/media/upload-queue';
import type { DraftAttachment, UploadedAttachment } from '../../lib/community/multi-media';

type Item = UploadItem<DraftAttachment & { previewUrl: string | null }, UploadedAttachment>;

function sizeLabel(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The attachments picked for a post, before and while it is sent: each one's
 * preview, its own progress, a retry when it failed, remove, and move left /
 * right to choose the order (the first is the one older apps show).
 */
export function AttachmentTray({ items, busy, overall, onRemove, onRetry, onMove, onCancelAll }: {
  items: Item[];
  busy: boolean;
  overall: { total: number; done: number; failed: number; fraction: number };
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onMove: (id: string, to: number) => void;
  onCancelAll: () => void;
}) {
  const sending = items.some(i => i.state === 'uploading');
  return (
    <div style={css('flex:none;padding:18px 20px 0;display:flex;flex-direction:column;gap:10px')}>
      <div style={css('display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text-muted)')}>
        <span style={css('flex:1;min-width:0')} role="status" aria-live="polite">
          {sending || (busy && overall.done < overall.total)
            ? `Uploading ${Math.min(overall.done + 1, overall.total)} of ${overall.total} · ${Math.round(overall.fraction * 100)}%`
            : overall.failed
              ? `${overall.failed} of ${overall.total} did not upload`
              : `${items.length} attachment${items.length === 1 ? '' : 's'}`}
        </span>
        {sending && (
          <button type="button" onClick={onCancelAll} style={css('font-size:12px;font-weight:700;color:var(--danger-ink);background:none;cursor:pointer')}>
            Cancel
          </button>
        )}
      </div>
      {(sending || busy) && (
        <div aria-hidden="true" style={css('height:4px;border-radius:4px;background:var(--surface-secondary);overflow:hidden')}>
          <div style={{ ...css('height:100%;background:var(--accent);transition:width .2s ease'), width: `${Math.round(overall.fraction * 100)}%` }} />
        </div>
      )}
      <div role="list" aria-label="Attachments" style={css('display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;scroll-snap-type:x proximity')}>
        {items.map((item, index) => {
          const { payload } = item;
          const failed = item.state === 'failed';
          const label = `${payload.kind === 'image' ? 'Photo' : payload.kind === 'video' ? 'Video' : payload.kind === 'voice' ? 'Voice message' : 'Document'} ${index + 1}: ${payload.file.name}`;
          return (
            <div role="listitem" key={item.id} aria-label={label}
              style={css('flex:none;width:96px;display:flex;flex-direction:column;gap:5px;scroll-snap-align:start')}>
              <div style={css('position:relative;width:96px;height:96px;border-radius:12px;overflow:hidden;background:var(--surface-sunken-2);box-shadow:0 4px 12px rgba(var(--shadow-rgb),.12)')}>
                {payload.previewUrl && payload.kind !== 'voice'
                  ? <img src={payload.previewUrl} alt="" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
                  : (
                    <div style={css('width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0 8px')}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={1.7} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
                      <div style={css('font-size:9.5px;color:var(--text-faint);text-align:center;line-height:1.3;word-break:break-word;max-height:26px;overflow:hidden')}>{payload.file.name}</div>
                    </div>
                  )}
                {payload.kind === 'video' && (
                  <div aria-hidden="true" style={css('position:absolute;left:6px;bottom:6px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center')}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l12-7.5z" /></svg>
                  </div>
                )}
                {item.state === 'uploading' && (
                  <div style={css('position:absolute;inset:0;background:rgba(var(--shadow-rgb),.35);display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;color:#fff')}>
                    {Math.round(item.progress * 100)}%
                  </div>
                )}
                {item.state === 'done' && (
                  <div aria-label="Uploaded" style={css('position:absolute;left:6px;top:6px;width:20px;height:20px;border-radius:50%;background:var(--success-ink);display:flex;align-items:center;justify-content:center')}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </div>
                )}
                {failed && (
                  <button type="button" onClick={() => onRetry(item.id)} aria-label={`Retry ${label}`}
                    style={css('position:absolute;inset:0;background:rgba(170,30,30,.55);color:#fff;font-size:12px;font-weight:700;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round"><path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3M4.5 18v-5h5" /></svg>
                    Retry
                  </button>
                )}
                {!busy && item.state !== 'uploading' && (
                  <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${label}`}
                    style={css('position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={2.8} strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
                  </button>
                )}
                {item.state === 'uploading' && (
                  <div aria-hidden="true" style={css('position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.35)')}>
                    <div style={{ ...css('height:100%;background:var(--accent)'), width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                )}
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:10px;color:var(--text-faint)')}>
                {items.length > 1 && !busy ? (
                  <button type="button" disabled={index === 0} onClick={() => onMove(item.id, index - 1)} aria-label={`Move ${label} earlier`}
                    style={{ ...css('min-width:26px;min-height:22px;border-radius:6px;background:var(--surface-secondary);cursor:pointer;font-size:13px;line-height:1'), opacity: index === 0 ? 0.35 : 1 }}>‹</button>
                ) : <span />}
                <span>{failed ? <span style={css('color:var(--danger-ink)')}>Failed</span> : sizeLabel(payload.file.size)}</span>
                {items.length > 1 && !busy ? (
                  <button type="button" disabled={index === items.length - 1} onClick={() => onMove(item.id, index + 1)} aria-label={`Move ${label} later`}
                    style={{ ...css('min-width:26px;min-height:22px;border-radius:6px;background:var(--surface-secondary);cursor:pointer;font-size:13px;line-height:1'), opacity: index === items.length - 1 ? 0.35 : 1 }}>›</button>
                ) : <span />}
              </div>
              {failed && item.error && <div title={item.error} style={css('font-size:9.5px;color:var(--danger-ink);line-height:1.3;max-height:25px;overflow:hidden')}>{item.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
