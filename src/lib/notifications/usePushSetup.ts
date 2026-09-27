import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth-context';
import { traceRefreshAudio } from '../audio/refresh-diagnostics';
import { unlockNotificationAudio } from '../useNotificationSound';
import { PushSetupError, pushAvailability, pushErrorMessage, subscribePush, supportsPush, type PushAvailability } from './push';

const REGISTERED_PREFIX = 'tp:push-registered:';
const CHANGE_EVENT = 'tp:push-setup-change';
const syncing = new Map<string, Promise<void>>();

/** When this browser last stored its subscription for this account; per account, so a shared device never reports another account's state. */
function registeredAt(userId: string): number | null {
  try {
    const value = Number(localStorage.getItem(`${REGISTERED_PREFIX}${userId}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

function setRegistered(userId: string, registered: boolean): void {
  try {
    if (registered) localStorage.setItem(`${REGISTERED_PREFIX}${userId}`, String(Date.now()));
    else localStorage.removeItem(`${REGISTERED_PREFIX}${userId}`);
  } catch { /* Private browsing can disable storage; status then reads as unknown. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Creates or repairs this device's subscription for `userId`; concurrent callers share one attempt. */
export function ensureSubscribed(userId: string): Promise<void> {
  const pending = syncing.get(userId);
  if (pending) return pending;
  const request = subscribePush(traceRefreshAudio)
    .then(() => { setRegistered(userId, true); traceRefreshAudio('push-stage', 'registered'); })
    .catch(error => {
      if (error instanceof PushSetupError && error.stage !== 'session') setRegistered(userId, false);
      traceRefreshAudio('push-error', error instanceof PushSetupError ? error.reference : String((error as Error)?.name));
      throw error;
    })
    .finally(() => { syncing.delete(userId); });
  syncing.set(userId, request);
  return request;
}

export type PushStatus =
  | 'install-required'  // iPhone/iPad browser tab: install the Home Screen app
  | 'unsupported'
  | 'insecure'
  | 'ask'               // permission not asked yet
  | 'denied'            // blocked in settings; never re-prompt
  | 'needs-retry'       // allowed, but this device is not registered
  | 'on';               // allowed and stored for this account

function currentStatus(availability: PushAvailability, userId: string | undefined): PushStatus {
  if (availability === 'install-required') return 'install-required';
  if (availability === 'insecure') return 'insecure';
  if (availability !== 'supported') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'ask';
  return userId && registeredAt(userId) ? 'on' : 'needs-retry';
}

export function usePushSetup() {
  const { user, isActivated } = useAuth();
  const userId = user?.id;
  const [, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    window.addEventListener(CHANGE_EVENT, bump);
    document.addEventListener('visibilitychange', bump);   // permission may change in Settings meanwhile
    return () => { window.removeEventListener(CHANGE_EVENT, bump); document.removeEventListener('visibilitychange', bump); };
  }, []);

  // "On" must mean a live subscription: if the browser dropped it (WebKit
  // revocation, cleared data, a reinstall), stop claiming it is on.
  useEffect(() => {
    if (!userId || !supportsPush() || Notification.permission !== 'granted' || !registeredAt(userId)) return;
    let active = true;
    void navigator.serviceWorker.getRegistration('/').then(registration => registration?.pushManager.getSubscription())
      .then(subscription => { if (active && !subscription) setRegistered(userId, false); })
      .catch(() => {});
    return () => { active = false; };
  }, [userId]);

  const availability = pushAvailability();
  const status = currentStatus(availability, userId);

  /** Call only from the tap that asked for notifications. */
  const enable = useCallback(async () => {
    if (busy || !userId || !isActivated) return;
    // Synchronous, and does not consume the tap's activation.
    unlockNotificationAudio();
    setError(null);
    setNotice(null);
    if (availability !== 'supported') { setError(pushErrorMessage(new PushSetupError(availability === 'install-required' ? 'install-required' : availability === 'insecure' ? 'insecure-context' : 'unsupported', '', ''))); return; }
    setBusy(true);
    try {
      let permission = Notification.permission;
      // FIRST await of the tap: WebKit consumes the activation here and
      // answers "denied" without a prompt if anything awaited before it.
      if (permission === 'default') permission = await Notification.requestPermission();
      traceRefreshAudio('push-stage', `permission ${permission}`);
      if (permission === 'denied') throw new PushSetupError('permission-denied', '', 'Notifications are blocked for this app.');
      if (permission !== 'granted') throw new PushSetupError('permission-dismissed', '', 'Notification permission was not granted.');
      await ensureSubscribed(userId);
      setNotice('Notifications are on for this device.');
    } catch (cause) {
      if (cause instanceof PushSetupError && cause.stage === 'permission-dismissed') setError(null);
      else setError(pushErrorMessage(cause));
    } finally {
      setBusy(false);
      setVersion(v => v + 1);
    }
  }, [availability, busy, isActivated, userId]);

  return { status, availability, busy, error, notice, enable, clearMessages: () => { setError(null); setNotice(null); } };
}
