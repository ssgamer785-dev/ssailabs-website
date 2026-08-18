import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { css } from '../lib/css';
import { useMoneySound } from '../lib/useMoneySound';

const THRESH = 58;
const MAX = 84;

function nearestScrollable(el: Element | null, stop: Element | null): Element | null {
  let cur = el;
  while (cur && cur !== stop) {
    if (cur.scrollHeight > cur.clientHeight + 1) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/**
 * Wraps a screen in the app's 390×844 device frame and gives it pull-to-refresh
 * (drag down or scroll up from the top of the content) with the cash-register sound.
 */
export function PhoneShell({ children, scrollRef }: { children: ReactNode; scrollRef?: RefObject<HTMLElement | null> }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const puckRef = useRef<HTMLDivElement>(null);
  const playMoney = useMoneySound();

  useEffect(() => {
    const frame = frameRef.current;
    const bar = barRef.current;
    const puck = puckRef.current;
    if (!frame || !bar || !puck) return;

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = { y: 0, target: 0, dragging: false, busy: false, raf: 0, spin: 0, y0: 0, wt: 0 as unknown as number };

    const paint = () => {
      const h = Math.max(0, state.y);
      bar.style.height = h + 'px';
      bar.style.opacity = String(Math.min(1, h / 26));
      const p = Math.min(1, h / THRESH);
      if (state.busy) {
        state.spin += 9;
        puck.style.transform = 'rotate(' + state.spin + 'deg) scale(1)';
        puck.style.color = '#16A34A';
      } else {
        puck.style.transform = 'rotate(' + (p * 180) + 'deg) scale(' + (0.72 + p * 0.28) + ')';
        puck.style.color = p >= 1 ? '#16A34A' : '#0B5FEF';
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

    const fire = () => {
      if (state.busy) return;
      state.busy = true;
      state.target = 52;
      run();
      playMoney();
      setTimeout(() => {
        state.busy = false;
        state.spin = 0;
        state.target = 0;
        run();
      }, reduce ? 260 : 900);
    };

    const pull = (dy: number) => {
      if (state.busy) return;
      state.target = Math.min(MAX, Math.max(0, dy));
      run();
    };

    const atTop = (target: EventTarget | null) => {
      const scroller = scrollRef?.current ?? nearestScrollable(target as Element, frame);
      return !scroller || scroller.scrollTop <= 0;
    };

    const onWheel = (e: WheelEvent) => {
      if (state.busy || !atTop(e.target)) return;
      if (e.deltaY < 0) {
        pull(state.target + Math.min(18, -e.deltaY * 0.55));
        clearTimeout(state.wt);
        state.wt = window.setTimeout(() => {
          if (state.target >= THRESH) fire();
          else { state.target = 0; run(); }
        }, 130);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (state.busy || e.button || !atTop(e.target)) return;
      state.dragging = true;
      state.y0 = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!state.dragging) return;
      const dy = e.clientY - state.y0;
      if (dy > 0) { pull(dy * 0.62); e.preventDefault(); }
    };
    const onUp = () => {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.target >= THRESH) fire();
      else { state.target = 0; run(); }
    };

    frame.addEventListener('wheel', onWheel, { passive: true });
    frame.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (state.raf) cancelAnimationFrame(state.raf);
      clearTimeout(state.wt);
    };
  }, [playMoney, scrollRef]);

  return (
    <div style={css('min-height:100dvh;min-height:100vh;background:#EEF1F7;display:flex;align-items:center;justify-content:center;padding:0')} className="phone-viewport">
      <div
        ref={frameRef}
        style={css('position:relative;width:390px;height:844px;background:#FFFFFF;box-shadow:0 20px 50px rgba(15,23,42,.11),0 2px 6px rgba(15,23,42,.05);overflow:hidden;display:flex;flex-direction:column;color:#0F172A;border-radius:36px')}
        className="phone-frame"
      >
        <div
          ref={barRef}
          style={css('position:absolute;left:0;right:0;top:0;height:0;overflow:hidden;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;background:linear-gradient(180deg,#F2F6FE,rgba(242,246,254,0));z-index:40;pointer-events:none;border-radius:36px 36px 0 0')}
        >
          <div ref={puckRef} style={css('width:30px;height:30px;border-radius:50%;background:#FFFFFF;box-shadow:0 3px 10px rgba(15,23,42,.16);display:flex;align-items:center;justify-content:center;color:#0B5FEF')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5.2v13.6M6.4 13.2 12 18.8l5.6-5.6" />
            </svg>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
