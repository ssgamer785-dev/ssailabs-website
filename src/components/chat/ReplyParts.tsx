import { forwardRef, useEffect, useRef } from 'react';
import { css } from '../../lib/css';
import { SWIPE_TRIGGER_PX, swipeIntent, swipeOffset } from '../../lib/chat/reply';

/** How a reply is asked for: 'select' marks the target (a swipe reaching its threshold), 'compose' also opens the keyboard. */
export type ReplyRequest = 'select' | 'compose';

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

/** Touches that start this close to the left edge belong to the iPhone's back gesture, not to a message. */
const EDGE_GUARD_PX = 20;
/** Where a horizontal drag already means something else: a voice note's slider, any field. */
const NO_SWIPE = 'input, textarea, select, [contenteditable="true"], [data-no-swipe]';
const SPRING = 'transform 220ms cubic-bezier(.2,.9,.3,1)';
/** The arrow tracks the finger with no lag; only its colour eases, and it fades out once the message is let go. */
const ICON_TRACKING = 'background .12s ease, color .12s ease';
const ICON_RELEASE = `${ICON_TRACKING}, opacity .18s ease, transform .18s ease`;

/**
 * Swipe a message to the right to reply, as in a chat app.
 *
 * Touch only (iPhone, iPad, Android); a mouse gets the Reply button instead.
 *
 * - Touch events on the row itself, not pointer events: iOS Safari cancels a
 *   pointer as soon as its scroll view takes an interest in the touch, which
 *   dropped real swipes; touch events keep arriving until the finger lifts.
 * - The direction is read once the finger has moved 10 px (swipeIntent). A
 *   vertical or leftward movement is handed back untouched, so the chat
 *   scrolls exactly as before. A rightward one is then this row's: its moves
 *   are preventDefault-ed, so neither the list nor the page moves under it.
 * - The message follows the finger through a transform written straight to
 *   the element on the next animation frame: no React render per move.
 * - Reaching the threshold replies, once, with a haptic tick where the device
 *   has one: a swipe the system interrupts after that still counts. Lifting
 *   the finger then opens the keyboard (iOS only allows that inside the touch).
 * - The message springs back whatever happens.
 */
export function useSwipeToReply({ enabled, onReply, onStart }: {
  enabled: boolean;
  onReply: (request: ReplyRequest) => void;
  /** Called when a touch becomes a swipe (e.g. to cancel a pending long-press). */
  onStart?: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onReply, onStart });
  latest.current = { onReply, onStart };

  useEffect(() => {
    const row = rowRef.current;
    if (!enabled || !row) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let gesture: { id: number; x: number; y: number; swiping: boolean; offset: number; fired: boolean } | null = null;
    let frame = 0;
    let settleTimer = 0;
    let suppressClickUntil = 0;

    const paint = () => {
      frame = 0;
      const move = moveRef.current;
      const icon = iconRef.current;
      const offset = gesture?.offset ?? 0;
      if (move) move.style.transform = `translate3d(${offset}px,0,0)`;
      if (icon) {
        const progress = Math.min(1, offset / SWIPE_TRIGGER_PX);
        const armed = offset >= SWIPE_TRIGGER_PX;
        icon.style.transition = ICON_TRACKING;
        icon.style.opacity = String(progress);
        icon.style.transform = `scale(${0.6 + 0.4 * progress})`;
        icon.style.background = armed ? 'var(--accent)' : 'var(--surface-secondary)';
        icon.style.color = armed ? 'var(--on-accent)' : 'var(--text-muted)';
      }
    };

    const springBack = () => {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      const move = moveRef.current;
      const icon = iconRef.current;
      if (move) {
        move.style.transition = reduceMotion ? '' : SPRING;
        move.style.transform = 'translate3d(0,0,0)';
      }
      if (icon) { icon.style.transition = ICON_RELEASE; icon.style.opacity = '0'; icon.style.transform = 'scale(.6)'; }
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        // Back at rest: leave no transform behind (it would make every bubble its own layer).
        if (move && !gesture) { move.style.transition = ''; move.style.transform = ''; move.style.willChange = ''; }
      }, reduceMotion ? 0 : 240);
    };

    const touchOf = (event: TouchEvent) => {
      if (!gesture) return null;
      for (const touch of Array.from(event.changedTouches)) if (touch.identifier === gesture.id) return touch;
      return null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { if (gesture?.swiping) springBack(); gesture = null; return; }
      const touch = event.touches[0];
      const target = event.target as Element | null;
      if (touch.clientX < EDGE_GUARD_PX || target?.closest?.(NO_SWIPE)) { gesture = null; return; }
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, swiping: false, offset: 0, fired: false };
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = touchOf(event);
      if (!gesture || !touch) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.swiping) {
        const intent = swipeIntent(dx, dy);
        if (intent === 'undecided') return;
        if (intent === 'ignore') { gesture = null; return; }   // a scroll: the browser keeps it
        gesture.swiping = true;
        window.clearTimeout(settleTimer);
        const move = moveRef.current;
        if (move) { move.style.transition = 'none'; move.style.willChange = 'transform'; }
        latest.current.onStart?.();
      }
      // This touch is a swipe now: the list must not scroll under it, nor the page go back.
      if (event.cancelable) event.preventDefault();
      gesture.offset = swipeOffset(dx);
      if (!gesture.fired && gesture.offset >= SWIPE_TRIGGER_PX) {
        gesture.fired = true;
        try { navigator.vibrate?.(10); } catch { /* No vibration on this device. */ }
        latest.current.onReply('select');
      }
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const finish = (event: TouchEvent, cancelled: boolean) => {
      if (!gesture || !touchOf(event)) return;
      const { swiping, fired } = gesture;
      gesture = null;
      if (!swiping) return;
      // A swipe that ended on a photo or a button must not also open or press it.
      suppressClickUntil = performance.now() + 400;
      springBack();
      if (fired && !cancelled) latest.current.onReply('compose');
    };
    const onTouchEnd = (event: TouchEvent) => finish(event, false);
    const onTouchCancel = (event: TouchEvent) => finish(event, true);
    const onClick = (event: MouseEvent) => {
      if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };

    row.addEventListener('touchstart', onTouchStart, { passive: true });
    row.addEventListener('touchmove', onTouchMove, { passive: false });
    row.addEventListener('touchend', onTouchEnd, { passive: true });
    row.addEventListener('touchcancel', onTouchCancel, { passive: true });
    row.addEventListener('click', onClick, true);
    return () => {
      row.removeEventListener('touchstart', onTouchStart);
      row.removeEventListener('touchmove', onTouchMove);
      row.removeEventListener('touchend', onTouchEnd);
      row.removeEventListener('touchcancel', onTouchCancel);
      row.removeEventListener('click', onClick, true);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      gesture = null;
      const move = moveRef.current;
      if (move) { move.style.transition = ''; move.style.transform = ''; move.style.willChange = ''; }
      if (iconRef.current) iconRef.current.style.opacity = '0';
    };
  }, [enabled]);

  return { rowRef, moveRef, iconRef };
}

/** The reply arrow that appears under a message as it is pulled right. Driven by useSwipeToReply, never by React state. */
export const SwipeReplyIcon = forwardRef<HTMLDivElement>(function SwipeReplyIcon(_, ref) {
  return (
    <div ref={ref} aria-hidden="true" style={{
      ...css('position:absolute;left:2px;top:50%;width:30px;height:30px;margin-top:-15px;border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;background:var(--surface-secondary);color:var(--text-muted)'),
      opacity: 0,
      transform: 'scale(.6)',
      transition: ICON_TRACKING,
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 7 4.5 12l5 5M4.8 12h9.4c3.2 0 5.3 2 5.3 5.2" />
      </svg>
    </div>
  );
});

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
