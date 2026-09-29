/**
 * The number on the installed app's icon (Badging API). Feature-detected and
 * best effort: unsupported browsers, and browsers that have not been given
 * notification permission (iOS requires it), simply show no badge.
 */
type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export function appBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as BadgeNavigator).setAppBadge === 'function';
}

/** Shows `count` on the icon, or clears it at zero. Never throws. */
export function setAppBadge(count: number): void {
  if (!appBadgeSupported()) return;
  const nav = navigator as BadgeNavigator;
  const whole = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    const done = whole > 0 ? nav.setAppBadge!(whole) : (nav.clearAppBadge ? nav.clearAppBadge() : nav.setAppBadge!(0));
    void done.catch(() => { /* No permission, or the OS declined: no badge. */ });
  } catch { /* Same. */ }
}
