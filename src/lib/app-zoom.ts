/**
 * Keeps the app at 1:1 scale.
 *
 * The Traders Planet is a fixed phone-shaped shell rather than a document.
 * Its geometry is built around a 390x844 frame — the splash artwork is placed
 * by percentages of that frame, the bottom nav is sized to it — so zooming
 * does not enlarge the design, it pulls the design away from the picture it is
 * aligned to. The viewport meta in index.html covers mobile; this covers what
 * a meta tag cannot: desktop zoom, and iOS Safari, which ignores
 * `user-scalable=no` on purpose.
 *
 * What is deliberately left alone: wheel scrolling, single-finger pans, taps,
 * clicks, text selection, form input, and every keyboard shortcut except the
 * four that change zoom. Nothing here cancels an event it has not identified
 * as a zoom.
 *
 * A caveat worth keeping honest: whether a page may refuse a zoom shortcut is
 * the browser's decision, not ours. Ctrl/Cmd + wheel is cancellable
 * everywhere. Ctrl/Cmd + "+"/"-"/"0" is cancellable in Chrome and Edge;
 * Firefox and Safari treat those as browser chrome and ignore the page. There
 * is no API that changes that, so the handler is best-effort by nature.
 */

/** Ctrl/Cmd + one of these is a zoom command in every major browser. */
const ZOOM_KEYS = new Set(['+', '-', '=', '_', '0']);

/**
 * Installs the listeners and returns a function that removes them again.
 * Called once from main.tsx, outside React, so StrictMode's double-invoked
 * effects cannot register a second copy.
 */
export function lockAppZoom(target: Window = window): () => void {
  // A trackpad pinch arrives as a wheel event with ctrlKey set — the browser
  // synthesises it that way whatever the underlying OS gesture was. This has
  // to be non-passive or preventDefault is ignored, which is also why it
  // cannot be folded into PhoneShell's passive wheel listener.
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    // Matching on e.key covers the number row and the numpad together, and
    // both the shifted and unshifted spellings of each sign.
    if (ZOOM_KEYS.has(e.key)) e.preventDefault();
  };

  // Safari's own pinch events, on iOS and macOS. No other engine fires them
  // and nothing else in the app listens for them, so there is no handler here
  // to collide with.
  const onGesture = (e: Event) => e.preventDefault();

  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('gesturestart', onGesture);
  target.addEventListener('gesturechange', onGesture);
  target.addEventListener('gestureend', onGesture);

  return () => {
    target.removeEventListener('wheel', onWheel);
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('gesturestart', onGesture);
    target.removeEventListener('gesturechange', onGesture);
    target.removeEventListener('gestureend', onGesture);
  };
}
