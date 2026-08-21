import { css } from '../../lib/css';
import { formatTime, type ChatMessage } from '../../lib/chat/types';

/** sending → clock, sent → single check, read → the design's blue double-check. */
export function StatusTick({ message }: { message: ChatMessage }) {
  if (message.status === 'sending' || message.status === 'uploading') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.6" /><path d="M12 7.6V12l3 1.8" />
      </svg>
    );
  }
  if (message.status === 'failed') {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2.2} strokeLinecap="round">
        <circle cx="12" cy="12" r="8.6" /><path d="M12 7.8v5M12 16.2h.01" />
      </svg>
    );
  }
  if (message.readAt) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12.6l3.6 3.6L12.4 9" /><path d="M9.6 12.6l3.6 3.6L19.5 9" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.6l4 4L19 7.4" />
    </svg>
  );
}

export function MetaRow({ message, out }: { message: ChatMessage; out: boolean }) {
  return (
    <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:5px')}>
      <div style={css('font-size:10px;color:#64748B;white-space:nowrap')}>{formatTime(message.createdAt)}</div>
      {out && <StatusTick message={message} />}
    </div>
  );
}

/** Thin blue bar across the bottom of a bubble while its attachment uploads. */
export function UploadBar({ message }: { message: ChatMessage }) {
  if (message.status !== 'uploading') return null;
  return (
    <div style={css('height:3px;border-radius:2px;background:rgba(11,95,239,.16);overflow:hidden')}>
      <div style={{ height: '100%', width: `${Math.round((message.progress ?? 0) * 100)}%`, background: '#0B5FEF', transition: 'width .15s linear' }} />
    </div>
  );
}

export function FailedNote({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  if (message.status !== 'failed') return null;
  return (
    <div style={css('display:flex;flex-direction:column;gap:3px')}>
      <div onClick={onRetry} style={css('display:flex;align-items:center;gap:5px;cursor:pointer')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 11.5a8 8 0 1 1-2.4-5.7M20 4.2v4.6h-4.6" />
        </svg>
        <div style={css('font-size:10.5px;font-weight:600;color:#EF4444;white-space:nowrap')}>Tap to retry</div>
      </div>
      {message.error && (
        <div style={css('font-size:10px;color:#94A3B8;line-height:1.35')}>{message.error}</div>
      )}
    </div>
  );
}
