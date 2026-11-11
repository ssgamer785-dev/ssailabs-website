import { useEffect, useState } from 'react';

/**
 * Keeps a full-screen overlay inside what the user can actually see.
 *
 * On iPad Safari the on-screen keyboard does not resize the page. The layout
 * viewport stays as tall as it was and the keyboard is drawn over its bottom
 * edge, so a `fixed` footer — which is anchored to that bottom edge — ends up
 * underneath the keyboard, and the Back and Continue buttons with it. iOS then
 * pans the *visual* viewport to bring the focused field into view, which can
 * carry the top of the overlay off-screen as well.
 *
 * The visual viewport is the rectangle the user is really looking at. While a
 * keyboard is up the overlay is sized to it, which lifts the footer to sit
 * directly above the keyboard. When no keyboard is up nothing is applied and
 * the overlay keeps its ordinary `inset-0` sizing.
 */

export interface ViewportFit {
  top: number;
  height: number;
}

/** A keyboard is far taller than any browser chrome change; this is the margin. */
const KEYBOARD_THRESHOLD_PX = 120;

interface VisualViewportLike {
  height: number;
  offsetTop: number;
  scale?: number;
}

/**
 * The rectangle to size the overlay to, or null to leave it alone.
 *
 * Null when the visual viewport is as tall as the layout viewport (no
 * keyboard), when it is only a little shorter (a toolbar appearing or hiding,
 * which `inset-0` already tracks), or when the user has pinched in — a zoomed
 * viewport is the user's choice, and resizing the overlay to it would fight them.
 */
export function computeViewportFit(
  layoutHeight: number,
  vv: VisualViewportLike | null | undefined
): ViewportFit | null {
  if (!vv || !Number.isFinite(vv.height) || !Number.isFinite(layoutHeight)) return null;
  if ((vv.scale ?? 1) > 1.01) return null;
  if (layoutHeight - vv.height < KEYBOARD_THRESHOLD_PX) return null;
  return { top: Math.max(0, vv.offsetTop), height: vv.height };
}

/** Inline style for the overlay: the visible rectangle while a keyboard is up. */
export function useVisualViewportFit(active: boolean): React.CSSProperties | undefined {
  const [fit, setFit] = useState<ViewportFit | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      setFit(null);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const next = computeViewportFit(window.innerHeight, vv);
      setFit(prev =>
        prev?.top === next?.top && prev?.height === next?.height ? prev : next
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    update();
    return () => {
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      setFit(null);
    };
  }, [active]);

  // The viewport just got shorter, so whatever has focus may now sit below the
  // new bottom edge of the scroll area. This has to run after the new height has
  // been applied to the page — scrolling in the same tick that the state is set
  // looks at the old layout, where the field is still visible, and does nothing.
  const height = fit?.height;
  const top = fit?.top;
  useEffect(() => {
    if (height === undefined) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [height, top]);

  return fit
    ? { top: fit.top, height: fit.height, bottom: 'auto' }
    : undefined;
}
