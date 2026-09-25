import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { css } from '../lib/css';
import { useMoneySound } from '../lib/useMoneySound';

/** Drag distance, after resistance, that arms the refresh. */
const THRESHOLD = 64;
/** How far the sheet can be dragged, however hard you pull. */
const MAX_PULL = 96;
/** The indicator stays up at least this long, so a fast refresh still reads. */
const MIN_SPIN_MS = 450;

type RefreshHandler = () => unknown | Promise<unknown>;

/**
 * Screens own their own data, so the shell cannot know how to reload them. Each
 * screen registers its reload here and the shell calls whatever is registered.
 * Nothing registered — login, signup, splash — means no gesture at all, which is
 * how those screens stay inert without the shell having to know about routes.
 *
 * A module-level set rather than a context, because a screen renders PhoneShell
 * itself: it sits *above* any provider PhoneShell could return, so a context
 * would always read as empty from exactly the components that need it.
 */
const refreshHandlers = new Set<RefreshHandler>();

/**
 * Registers `fn` as this screen's pull-to-refresh action while it is mounted.
 * Pass `enabled: false` to stand down (an auth screen, or data not ready yet).
 */
export function useRefreshHandler(fn: RefreshHandler, enabled = true) {
  const latest = useRef(fn);
  latest.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const entry = () => latest.current();
    refreshHandlers.add(entry);
    return () => { refreshHandlers.delete(entry); };
  }, [enabled]);
}

function nearestScrollable(el: Element | null, stop: Element | null): Element | null {
  let cur = el;
  while (cur && cur !== stop) {
    if (cur.scrollHeight > cur.clientHeight + 1) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Wraps a screen in the app's 390×844 device frame and gives it pull-to-refresh.
 *
 * The gesture only exists where a screen has registered something to reload, so
 * the auth screens get no pull at all — and the browser's own overscroll refresh
 * is turned off in index.css, so a stray drag there cannot reset a half-typed
 * form either.
 */
export function PhoneShell({ children, scrollRef }: { children: ReactNode; scrollRef?: RefObject<HTMLElement | null> }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const puckRef = useRef<HTMLDivElement>(null);
  const playMoney = useMoneySound();
  const playMoneyRef = useRef(playMoney);
  playMoneyRef.current = playMoney;

  useEffect(() => {
    const frame = frameRef.current;
    const bar = barRef.current;
    const puck = puckRef.current;
    if (!frame || !bar || !puck) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const state = {
      y: 0, target: 0, raf: 0, spin: 0,
      /** A pull is only live once we have committed to it, never mid-scroll. */
      pulling: false, busy: false,
      startX: 0, startY: 0, tracking: false, pointerDrag: false,
      wheelTimer: 0 as unknown as number,
    };

    const paint = () => {
      const h = Math.max(0, state.y);
      bar.style.height = h + 'px';
      bar.style.opacity = String(Math.min(1, h / 24));
      const p = Math.min(1, h / THRESHOLD);
      if (state.busy) {
        state.spin += reduce ? 0 : 9;
        puck.style.transform = `rotate(${state.spin}deg) scale(1)`;
        puck.style.color = 'var(--success-ink)';
      } else {
        // Rotates toward "release me" and settles on green once armed.
        puck.style.transform = `rotate(${p * 180}deg) scale(${0.72 + p * 0.28})`;
        puck.style.color = p >= 1 ? 'var(--success-ink)' : 'var(--accent-ink)';
      }
    };

    const tick = () => {
      state.y += (state.target - state.y) * (reduce ? 1 : 0.22);
      if (Math.abs(state.target - state.y) < 0.4) state.y = state.target;
      paint();
      if (state.y !== state.target || state.busy) state.raf = requestAnimationFrame(tick);
      else state.raf = 0;
    };
    const run = () => { if (!state.raf) state.raf = requestAnimationFrame(tick); };

    const settle = () => { state.target = 0; state.pulling = false; run(); };

    /** Runs every registered reload, once, and holds the indicator until done. */
    const fire = async () => {
      if (state.busy) return;                       // one refresh at a time
      const fns = [...refreshHandlers];
      if (!fns.length) { settle(); return; }

      // Start the sound in the release/touch gesture before animation or fetch.
      playMoneyRef.current();
      state.busy = true;
      state.target = 54;
      run();

      const started = Date.now();
      try {
        await Promise.allSettled(fns.map(fn => fn()));
      } finally {
        const elapsed = Date.now() - started;
        const wait = Math.max(0, (reduce ? 0 : MIN_SPIN_MS) - elapsed);
        window.setTimeout(() => {
          state.busy = false;
          state.spin = 0;
          settle();
        }, wait);
      }
    };

    const pull = (distance: number) => {
      if (state.busy) return;
      state.pulling = true;
      // Rubber band: the further you are, the less each pixel buys.
      const eased = MAX_PULL * (1 - Math.exp(-distance / MAX_PULL));
      state.target = Math.max(0, eased);
      run();
    };

    const release = () => {
      // A pointerup left over from the gesture that started the refresh must not
      // collapse the indicator while that refresh is still running.
      if (state.busy || !state.pulling) return;
      if (state.target >= THRESHOLD) void fire();
      else settle();
    };

    const atTop = (target: EventTarget | null) => {
      const scroller = scrollRef?.current ?? nearestScrollable(target as Element, frame);
      return !scroller || scroller.scrollTop <= 0;
    };

    // ---- touch: the path that has to feel right ----------------------------
    const onTouchStart = (e: TouchEvent) => {
      if (state.busy || e.touches.length !== 1 || !refreshHandlers.size) return;
      state.tracking = atTop(e.target);
      state.startX = e.touches[0].clientX;
      state.startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!state.tracking || state.busy || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - state.startY;
      const dx = e.touches[0].clientX - state.startX;

      // Upward, sideways, or no longer at the top: this is a scroll, not a pull.
      if (!state.pulling) {
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !atTop(e.target)) {
          state.tracking = false;
          return;
        }
        if (dy < 8) return;                         // wait for real intent
      }
      // Committed. Own the gesture so the page does not scroll underneath.
      if (e.cancelable) e.preventDefault();
      pull(dy);
    };

    const onTouchEnd = () => {
      state.tracking = false;
      release();
    };

    // ---- pointer + wheel: desktop parity, unchanged in spirit --------------
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;        // touch handlers own that
      if (state.busy || e.button || !refreshHandlers.size || !atTop(e.target)) return;
      state.pointerDrag = true;
      state.startY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!state.pointerDrag || state.busy) return;
      const dy = e.clientY - state.startY;
      if (dy > 0) { pull(dy); e.preventDefault(); }
    };
    const onPointerUp = () => {
      if (!state.pointerDrag) return;
      state.pointerDrag = false;
      release();
    };

    const onWheel = (e: WheelEvent) => {
      // Ctrl/Cmd + wheel is a zoom gesture, not a scroll: without this it also
      // drags the refresh sheet open while app-zoom.ts is cancelling the zoom.
      if (e.ctrlKey || e.metaKey) return;
      if (state.busy || !refreshHandlers.size || !atTop(e.target) || e.deltaY >= 0) return;
      pull(state.target + Math.min(20, -e.deltaY * 0.6));
      clearTimeout(state.wheelTimer);
      if (state.target >= THRESHOLD) {
        // Fire inside the wheel gesture. Deferring until the wheel-idle timer
        // loses user activation and makes the sound audibly late or silent.
        void fire();
      } else {
        state.wheelTimer = window.setTimeout(settle, 140);
      }
    };

    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchmove', onTouchMove, { passive: false });
    frame.addEventListener('touchend', onTouchEnd, { passive: true });
    frame.addEventListener('touchcancel', onTouchEnd, { passive: true });
    frame.addEventListener('wheel', onWheel, { passive: true });
    frame.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
      frame.removeEventListener('touchcancel', onTouchEnd);
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (state.raf) cancelAnimationFrame(state.raf);
      clearTimeout(state.wheelTimer);
      // The loop is gone; without this the sheet keeps its last painted height.
      bar.style.height = '0px';
      bar.style.opacity = '0';
    };
  }, [scrollRef]);

  return (
    <>
      <div style={css('min-height:100dvh;min-height:100vh;background:var(--app-bg);display:flex;align-items:center;justify-content:center;padding:0')} className="phone-viewport">
        <div
          ref={frameRef}
          style={css('position:relative;width:390px;height:844px;background:var(--surface);box-shadow:0 20px 50px rgba(var(--shadow-rgb),.11),0 2px 6px rgba(var(--shadow-rgb),.05);overflow:hidden;display:flex;flex-direction:column;color:var(--text-primary);border-radius:36px')}
          className="phone-frame"
        >
          <div
            ref={barRef}
            aria-hidden="true"
            className="refresh-sheet"
            style={css('position:absolute;left:0;right:0;top:0;height:0;opacity:0;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;z-index:40;pointer-events:none;border-radius:36px 36px 0 0')}
          >
            <div ref={puckRef} className="refresh-puck" style={css('width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--accent-ink)')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5.2v13.6M6.4 13.2 12 18.8l5.6-5.6" />
              </svg>
            </div>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
