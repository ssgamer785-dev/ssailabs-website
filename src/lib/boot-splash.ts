/**
 * The splash painted by index.html before the app's code arrives (#tp-boot),
 * and the hand-over to the React splash that replaces it.
 *
 * The React splash draws the same artwork in the same place, so the hand-over
 * is invisible as long as the boot copy is removed only after the React copy
 * has been drawn, and the loading bar continues from where the boot one is.
 */
type BootWindow = Window & { __tpArtAt?: number };

export function bootSplash(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('tp-boot');
}

/** performance.now() when the boot splash first showed the artwork, if it has. */
export function bootArtShownAt(): number | null {
  if (typeof window === 'undefined') return null;
  const at = (window as BootWindow).__tpArtAt;
  return typeof at === 'number' ? at : null;
}

/**
 * How far into its fill the bar already is, as a CSS animation-delay: a
 * negative delay starts the React bar at the boot bar's current position.
 */
export function barAnimationDelay(shownAt: number | null, now = performance.now()): string {
  return shownAt === null ? '0ms' : `${-Math.max(0, Math.round(now - shownAt))}ms`;
}

/** Removes the boot splash once `img` (the React copy of the artwork) can be drawn. */
export function releaseBootSplash(img: HTMLImageElement | null): void {
  const boot = bootSplash();
  if (!boot) return;
  const remove = () => requestAnimationFrame(() => requestAnimationFrame(() => boot.remove()));
  if (img && typeof img.decode === 'function') img.decode().then(remove, remove);
  else remove();
}

/** Fail-safe: nothing may keep the boot splash over the app. */
export function dropBootSplash(): void {
  bootSplash()?.remove();
}
