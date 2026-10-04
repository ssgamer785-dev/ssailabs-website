import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PhoneShell } from './PhoneShell';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { noteScreen, noteTap } from '../lib/media/media-metrics';
import { screenOpened } from '../lib/media/media-cache';

/**
 * What a screen shows while its code is fetched — only ever on a cold load
 * straight into a screen (and then usually behind the launch splash). In-app
 * navigation never reaches it: navigations run as React transitions, so the
 * current screen stays on show until the next one is ready.
 */
export function RouteFallback() {
  const bar = (w: string, h = 14) => <div style={css(`height:${h}px;width:${w};border-radius:8px;background:var(--surface-2, rgba(127,127,127,.12))`)} />;
  return <PhoneShell>
    <div role="status" aria-label="Opening" style={css('flex:1;display:flex;flex-direction:column;gap:14px;padding:22px 18px;background:var(--surface)')}>
      {bar('46%', 22)}
      {bar('100%', 120)}
      {bar('82%')}
      {bar('64%')}
      {bar('100%', 120)}
    </div>
  </PhoneShell>;
}

let historySignalInstalled = false;
/** One event for every way the URL changes, so the progress bar sees them all. */
function installHistorySignal() {
  if (historySignalInstalled || typeof window === 'undefined') return;
  historySignalInstalled = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('tp:location'));
      return result;
    } as History['pushState'];
  }
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('tp:location')));
}

/**
 * A slim bar at the top while a navigation is waiting for the next screen's
 * code — the only feedback, since the current screen deliberately stays put.
 * It appears only if the wait is noticeable (over 120 ms).
 */
export function NavigationProgress() {
  const location = useLocation();
  const committed = useRef(location.pathname + location.search);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    installHistorySignal();
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      if (window.location.pathname + window.location.search === committed.current) { setPending(false); return; }
      timer = window.setTimeout(() => {
        if (window.location.pathname + window.location.search !== committed.current) setPending(true);
      }, 120);
    };
    window.addEventListener('tp:location', onChange);
    return () => { window.clearTimeout(timer); window.removeEventListener('tp:location', onChange); };
  }, []);

  useEffect(() => {
    committed.current = location.pathname + location.search;
    setPending(false);
  }, [location.pathname, location.search]);

  if (!pending) return null;
  return <div aria-hidden="true" data-testid="nav-progress" style={css('position:fixed;top:0;left:0;right:0;height:3px;z-index:1000;overflow:hidden;pointer-events:none')}>
    <div className="nav-progress-bar" style={css('height:100%;width:40%;background:var(--accent);border-radius:0 3px 3px 0')} />
  </div>;
}

type Preloadable = { preload: () => Promise<unknown> };

/**
 * Fetches the code of the screens a member is likely to open, once they are
 * signed in and the app is idle — so opening Community, Chat or Notifications
 * renders at once instead of waiting for a download. Students never fetch the
 * admin screens. Skipped when the browser asks to save data.
 */
export function RoutePreloader({ member, admin }: { member: Preloadable[]; admin: Preloadable[] }) {
  const { session, isActivated, isAdmin } = useAuth();
  // A string, so a token refresh (a new session object) does not restart it.
  const key = session && isActivated ? `${session.user.id}:${isAdmin ? 'admin' : 'member'}` : null;
  const lists = useRef({ member, admin });

  useEffect(() => {
    if (!key) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;
    const queue = [...lists.current.member, ...(key.endsWith(':admin') ? lists.current.admin : [])];
    let cancelled = false;
    const idle = (fn: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 2500 });
      else window.setTimeout(fn, 600);
    };
    const next = () => {
      if (cancelled) return;
      const item = queue.shift();
      if (!item) return;
      // One at a time, so preloading never competes with what the member is doing.
      void item.preload().finally(() => idle(next));
    };
    idle(next);
    return () => { cancelled = true; };
  }, [key]);

  return null;
}

/**
 * After sign-in, a reopened app, or an installed app brought back after a few
 * minutes away — right after the first screen has painted:
 * reads what the member opens first — both community channels, their chat
 * (the admin's most recent threads), the inbox — and prepares the pictures
 * those first screens show: signed in one request per kind, fetched and
 * decoded a few at a time, within a data budget (none on Save-Data or 2G).
 * See lib/media/warmup.ts.
 */
export function DataWarmup() {
  const { session, isActivated, isAdmin } = useAuth();
  const userId = session && isActivated ? session.user.id : null;

  useEffect(() => {
    if (!userId) return;
    let controller = new AbortController();
    const run = () => {
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void import('../lib/media/warmup').then(m => m.warmStartup(userId, isAdmin, signal)).catch(() => {});
    };
    const timer = window.setTimeout(run, 250);
    // An installed app that comes back after a while is "opened" again: what is new since is prepared the same way.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 3 * 60_000) run();
      hiddenAt = 0;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { controller.abort(); window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [userId, isAdmin]);

  return null;
}

/**
 * Prepares a screen as the member reaches for it, before the tap completes: a
 * pointer resting on a link, or a finger touching down on it. Elements opt in
 * with `data-prefetch` (community, community:students, chat, chat:<id>,
 * post:<id>, notifications); the screen's code is fetched too.
 */
export function IntentPrefetch({ screens }: { screens: Record<string, Preloadable[]> }) {
  const { session, isActivated, isAdmin } = useAuth();
  const userId = session && isActivated ? session.user.id : null;
  const lists = useRef(screens);

  useEffect(() => {
    if (!userId) return;
    const reach = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest('[data-prefetch]') : null;
      const intent = element?.getAttribute('data-prefetch');
      if (!intent) return;
      for (const screen of lists.current[intent.split(':')[0]] ?? []) void screen.preload().catch(() => {});
      void import('../lib/media/warmup').then(m => m.warmIntent(intent, userId, isAdmin)).catch(() => {});
    };
    const onOver = (event: PointerEvent) => { if (event.pointerType === 'mouse') reach(event.target); };
    const onDown = (event: PointerEvent) => reach(event.target);
    const onFocus = (event: FocusEvent) => reach(event.target);
    document.addEventListener('pointerover', onOver, { capture: true, passive: true });
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    document.addEventListener('focusin', onFocus, true);
    return () => {
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocus, true);
    };
  }, [userId, isAdmin]);

  return null;
}

/** Feeds the on-device media timing (Device diagnostics): each tap, and each screen it opened. */
export function MediaTimingRuntime() {
  useEffect(() => {
    installHistorySignal();
    const onDown = () => noteTap();
    // Only a real change of screen (replaceState calls that keep the same address do not count).
    let last = window.location.pathname + window.location.search;
    const onLocation = () => {
      const now = window.location.pathname + window.location.search;
      if (now === last) return;
      last = now;
      screenOpened();
      noteScreen(now);
    };
    document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    window.addEventListener('tp:location', onLocation);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('tp:location', onLocation);
    };
  }, []);
  return null;
}
