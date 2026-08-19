import { useRef, useState, type ReactNode } from 'react';
import { css } from '../../lib/css';
import { makeRand } from '../../lib/rng';
import { useAudioPlayer } from '../../lib/chat/useAudioPlayer';
import { getMediaUrl } from '../../lib/chat/media-api';
import { formatBytes, formatDuration, formatTime, type ChatMessage } from '../../lib/chat/types';
import { useMediaUrl } from './useMediaUrl';

/** Static waveform, seeded off the message id so a clip always looks the same. */
function Wave({ bars, color, height, gap, seed, progress = 0 }: {
  bars: number; color: string; height: number; gap: number; seed: number; progress?: number;
}) {
  const rand = makeRand(seed);
  const els: ReactNode[] = [];
  for (let i = 0; i < bars; i++) {
    const h = Math.max(3, Math.round((0.28 + rand() * 0.72) * height));
    // Bars behind the playhead take the accent colour.
    const played = progress > 0 && i / bars <= progress;
    els.push(<div key={i} style={{ width: 2, height: h, borderRadius: 2, background: played ? '#0B5FEF' : color, flex: 'none' }} />);
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap, height, flex: 1, overflow: 'hidden' }}>{els}</div>;
}

function seedFrom(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 9999 || 17;
}

/** sending → clock, sent → single check, read → the design's blue double-check. */
function StatusTick({ message }: { message: ChatMessage }) {
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

function MetaRow({ message, out }: { message: ChatMessage; out: boolean }) {
  return (
    <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:5px')}>
      <div style={css('font-size:10px;color:#64748B;white-space:nowrap')}>{formatTime(message.createdAt)}</div>
      {out && <StatusTick message={message} />}
    </div>
  );
}

/** Thin blue bar across the bottom of a bubble while its attachment uploads. */
function UploadBar({ message }: { message: ChatMessage }) {
  if (message.status !== 'uploading') return null;
  return (
    <div style={css('height:3px;border-radius:2px;background:rgba(11,95,239,.16);overflow:hidden')}>
      <div style={{ height: '100%', width: `${Math.round((message.progress ?? 0) * 100)}%`, background: '#0B5FEF', transition: 'width .15s linear' }} />
    </div>
  );
}

function FailedNote({ message, onRetry }: { message: ChatMessage; onRetry: () => void }) {
  if (message.status !== 'failed') return null;
  return (
    <div onClick={onRetry} style={css('display:flex;align-items:center;gap:5px;cursor:pointer')}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11.5a8 8 0 1 1-2.4-5.7M20 4.2v4.6h-4.6" />
      </svg>
      <div style={css('font-size:10.5px;font-weight:600;color:#EF4444;white-space:nowrap')}>Tap to retry</div>
    </div>
  );
}

const AVATAR = css('width:30px;height:30px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none');

function VoiceBubble({ message, out, onRetry }: { message: ChatMessage; out: boolean; onRetry: () => void }) {
  const { playing, progress, elapsed, toggle } = useAudioPlayer(
    message.id,
    async () => message.localPreviewUrl ?? (message.storageKey ? getMediaUrl(message.storageKey) : null),
  );
  const total = message.voiceDurationSeconds ?? 0;

  return (
    <div style={{ maxWidth: 250, background: out ? '#DCE9FF' : '#F4F6FA', borderRadius: out ? '16px 16px 5px 16px' : '16px 16px 16px 5px', padding: '10px 13px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={css('display:flex;align-items:center;gap:10px')}>
        <div onClick={toggle} style={css('width:30px;height:30px;border-radius:50%;background:#0B5FEF;display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer')}>
          {playing
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFFFFF"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:1px')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>}
        </div>
        <Wave bars={26} color={out ? 'rgba(11,95,239,.45)' : 'rgba(100,116,139,.45)'} height={20} gap={2.4} seed={seedFrom(message.id)} progress={progress} />
        <div style={css('font-size:10.5px;font-weight:600;color:#64748B;flex:none;white-space:nowrap')}>
          {formatDuration(playing || progress > 0 ? elapsed : total)}
        </div>
      </div>
      <UploadBar message={message} />
      <FailedNote message={message} onRetry={onRetry} />
      <MetaRow message={message} out={out} />
    </div>
  );
}

function ImageBubble({ message, out, onRetry }: { message: ChatMessage; out: boolean; onRetry: () => void }) {
  const { url, failed } = useMediaUrl(message);
  const isVideo = message.kind === 'video';

  return (
    <div style={{ maxWidth: 250, background: out ? '#DCE9FF' : '#F4F6FA', borderRadius: out ? '16px 16px 5px 16px' : '16px 16px 16px 5px', padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={css('position:relative;width:236px;height:150px;border-radius:10px;overflow:hidden;background:#EDF0F5')}>
        {message.mediaPurged ? (
          <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94A3B8;text-align:center;padding:0 14px;line-height:1.4')}>
            Removed to stay within your 100 MB storage limit
          </div>
        ) : failed || !url ? (
          <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94A3B8')}>
            {failed ? 'Could not load' : 'Loading…'}
          </div>
        ) : isVideo ? (
          <video src={url} controls playsInline preload="metadata" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
        ) : (
          <img src={url} alt={message.fileName ?? 'Photo'} loading="lazy" decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
        )}
        {message.status === 'uploading' && (
          <div style={css('position:absolute;inset:0;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff')}>
            {Math.round((message.progress ?? 0) * 100)}%
          </div>
        )}
      </div>
      <div style={css('padding:0 6px')}>
        <UploadBar message={message} />
        <FailedNote message={message} onRetry={onRetry} />
        <MetaRow message={message} out={out} />
      </div>
    </div>
  );
}

function PdfBubble({ message, out, onRetry }: { message: ChatMessage; out: boolean; onRetry: () => void }) {
  const { url } = useMediaUrl(message);

  return (
    <div style={{ maxWidth: 260, background: '#FFFFFF', border: '1px solid #EDF0F6', borderRadius: 14, boxShadow: '0 2px 10px rgba(15,23,42,.05)', padding: '12px 13px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={css('display:flex;align-items:center;gap:11px')}>
        <div style={css('width:36px;height:40px;border-radius:8px;background:#FEF1F1;display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
        </div>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
          <div style={css('font-size:13px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {message.fileName ?? 'Document.pdf'}
          </div>
          <div style={css('font-size:11px;color:#94A3B8')}>
            {message.mediaPurged ? 'Removed (storage limit)' : formatBytes(message.sizeBytes ?? 0)}
          </div>
        </div>
        {url && !message.mediaPurged && (
          <a href={url} target="_blank" rel="noreferrer" style={css('display:flex;flex:none')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer')}><path d="M12 4v11M7.6 11l4.4 4.4L16.4 11M5 19.6h14" /></svg>
          </a>
        )}
      </div>
      <UploadBar message={message} />
      <FailedNote message={message} onRetry={onRetry} />
      <MetaRow message={message} out={out} />
    </div>
  );
}

function TextBubble({ message, out, onRetry }: { message: ChatMessage; out: boolean; onRetry: () => void }) {
  const deleted = !!message.deletedAt;
  return (
    <div style={{ maxWidth: 250, background: out ? '#DCE9FF' : '#F4F6FA', borderRadius: out ? '16px 16px 5px 16px' : '16px 16px 16px 5px', padding: '11px 13px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: deleted ? '#94A3B8' : out ? '#12203C' : '#0F172A', fontStyle: deleted ? 'italic' : 'normal' }}>
        {deleted ? 'This message was deleted' : message.body}
      </div>
      <FailedNote message={message} onRetry={onRetry} />
      <MetaRow message={message} out={out} />
    </div>
  );
}

export function MessageBubble({ message, out, onRetry, onDelete }: {
  message: ChatMessage;
  out: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const deleted = !!message.deletedAt;
  const canDelete = out && !deleted;

  // Long-press on touch, right-click on desktop — both open the same confirm.
  const startPress = () => {
    if (!canDelete) return;
    pressTimer.current = setTimeout(() => setConfirming(true), 500);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);

  const body = deleted
    ? <TextBubble message={message} out={out} onRetry={onRetry} />
    : message.kind === 'voice'
      ? <VoiceBubble message={message} out={out} onRetry={onRetry} />
      : message.kind === 'image' || message.kind === 'video'
        ? <ImageBubble message={message} out={out} onRetry={onRetry} />
        : message.kind === 'pdf'
          ? <PdfBubble message={message} out={out} onRetry={onRetry} />
          : <TextBubble message={message} out={out} onRetry={onRetry} />;

  return (
    <div
      style={out ? css('display:flex;justify-content:flex-end') : css('display:flex;align-items:flex-end;gap:9px')}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onContextMenu={e => { if (canDelete) { e.preventDefault(); setConfirming(true); } }}
    >
      {!out && <div style={AVATAR}>A</div>}
      <div style={css('display:flex;flex-direction:column;gap:5px;align-items:flex-end')}>
        {body}
        {confirming && (
          <div style={css('display:flex;align-items:center;gap:8px;padding:2px 4px')}>
            <div onClick={() => { setConfirming(false); onDelete(); }} style={css('font-size:11px;font-weight:700;color:#EF4444;cursor:pointer;white-space:nowrap')}>Delete</div>
            <div onClick={() => setConfirming(false)} style={css('font-size:11px;font-weight:600;color:#94A3B8;cursor:pointer;white-space:nowrap')}>Cancel</div>
          </div>
        )}
      </div>
    </div>
  );
}
