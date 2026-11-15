import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { css } from '../../lib/css';
import { SWIPE_TRIGGER_PX, swipeIntent, swipeOffset } from '../../lib/chat/reply';

/** What a reply bubble shows above itself about the message it answers. */
export interface QuoteInfo {
  targetId: string;
  /** 'loading' while an older quoted message is looked up; 'missing' when it is no longer available. */
  state: 'ready' | 'loading' | 'missing';
  sender?: string;
  snippet?: string;
  /** False when the original is no longer shown in the thread (deleted by the other side): quoted, but not a place to go. */
  canJump?: boolean;
}

/**
 * Swipe a message to the right to reply, as in a chat app.
 *
 * Touch and pen only: a mouse gets the Reply button instead. The row is
 * `touch-action: pan-y`, so the browser keeps every vertical scroll; a touch
 * is only taken over once it has clearly moved right (swipeIntent), and it is
 * given back the moment it looks like anything else. Letting go past the
 * threshold replies; a short tick of vibration marks the threshold where the
 * device has one.
 */
export function useSwipeToReply({ enabled, onReply, onStart }: { enabled: boolean; onReply: () => void; onStart?: () => void }) {
  const [offset, setOffset] = useState(0);
  const [armed, setArmed] = useState(false);
  const touch = useRef<{ id: number; x: number; y: number; mode: 'undecided' | 'reply' | 'ignore'; armed: boolean } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType === 'mouse' || !event.isPrimary) return;
    touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: 'undecided', armed: false };
  }, [enabled]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const t = touch.current;
    if (!t || t.id !== event.pointerId) return;
    const dx = event.clientX - t.x;
    const dy = event.clientY - t.y;
    if (t.mode === 'undecided') {
      const intent = swipeIntent(dx, dy);
      if (intent === 'undecided') return;
      t.mode = intent;
      if (intent !== 'reply') return;
      onStart?.();
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Capture is a nicety. */ }
    }
    if (t.mode !== 'reply') return;
    const next = swipeOffset(dx);
    setOffset(next);
    const nowArmed = next >= SWIPE_TRIGGER_PX;
    if (nowArmed !== t.armed) {
      t.armed = nowArmed;
      setArmed(nowArmed);
      if (nowArmed) { try { navigator.vibrate?.(10); } catch { /* No vibration here. */ } }
    }
  }, [onStart]);

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const t = touch.current;
    if (!t || t.id !== event.pointerId) return;
    touch.current = null;
    if (t.mode === 'reply' && t.armed && !cancelled) onReply();
    setOffset(0);
    setArmed(false);
  }, [onReply]);

  return {
    offset,
    armed,
    dragging: offset > 0,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
      onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
    },
  };
}

/** The reply arrow that appears under a message as it is pulled right. */
export function SwipeReplyIcon({ offset, armed }: { offset: number; armed: boolean }) {
  if (offset <= 0) return null;
  const progress = Math.min(1, offset / SWIPE_TRIGGER_PX);
  return (
    <div aria-hidden="true" style={{
      ...css('position:absolute;left:2px;top:50%;width:30px;height:30px;margin-top:-15px;border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none'),
      background: armed ? 'var(--accent)' : 'var(--surface-secondary)',
      opacity: progress,
      transform: `scale(${0.6 + 0.4 * progress})`,
      transition: 'background .12s ease',
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={armed ? 'var(--on-accent)' : 'var(--text-muted)'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 7 4.5 12l5 5M4.8 12h9.4c3.2 0 5.3 2 5.3 5.2" />
      </svg>
    </div>
  );
}

/** The quoted message above a reply. Tapping it goes to the original when it still exists. */
export function ReplyQuote({ quote, out, onJump }: { quote: QuoteInfo; out: boolean; onJump?: (id: string) => void }) {
  const available = quote.state === 'ready' && quote.canJump !== false;
  const sender = quote.state === 'ready' ? quote.sender : undefined;
  const text = quote.state === 'ready' ? quote.snippet : quote.state === 'loading' ? 'Loading…' : 'Original message unavailable';
  const muted = quote.state !== 'ready' || quote.canJump === false;
  return (
    <button type="button" disabled={!available || !onJump}
      onClick={event => { event.stopPropagation(); if (available) onJump?.(quote.targetId); }}
      aria-label={sender ? `Replying to ${sender}: ${text}${available ? '. Go to the original message' : ''}` : text}
      data-testid="reply-quote"
      style={{
        ...css('max-width:250px;min-width:120px;display:flex;flex-direction:column;gap:2px;padding:7px 11px;border:0;border-radius:12px;text-align:left;font:inherit'),
        borderLeft: '3px solid var(--accent)',
        background: out ? 'var(--accent-tint)' : 'var(--surface-secondary)',
        cursor: available && onJump ? 'pointer' : 'default',
        alignSelf: out ? 'flex-end' : 'flex-start',
      }}>
      {sender && <span style={css('font-size:11px;font-weight:700;color:var(--accent-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{sender}</span>}
      <span style={{
        ...css('font-size:12px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),
        color: muted ? 'var(--text-faint)' : 'var(--text-muted)',
        fontStyle: muted ? 'italic' : 'normal',
      }}>{text}</span>
    </button>
  );
}

/** The Reply action for a pointer that can hover (desktop); touch devices swipe instead (see index.css). */
export function ReplyButton({ onReply }: { onReply: () => void }) {
  return (
    <button type="button" className="msg-reply-btn" aria-label="Reply" title="Reply"
      onClick={event => { event.stopPropagation(); onReply(); }}
      style={css('align-self:center;flex:none;width:30px;height:30px;border-radius:50%;border:0;background:var(--surface-secondary);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.5 7 4.5 12l5 5M4.8 12h9.4c3.2 0 5.3 2 5.3 5.2" />
      </svg>
    </button>
  );
}
