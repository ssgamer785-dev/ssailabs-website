import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth-context';
import { traceRefreshAudio } from '../audio/refresh-diagnostics';
import { unlockNotificationAudio } from '../useNotificationSound';
import {
  PushSetupError, currentEndpoint, endpointFingerprint, fetchPushStatus, pushAvailability, pushErrorMessage,
  sendTestPush, subscribePush, supportsPush, unsubscribePush, type PushAvailability,
} from './push';

const REGISTERED_PREFIX = 'tp:push-registered:';
const DISABLED_PREFIX = 'tp:push-disabled:';
const FINGERPRINT_PREFIX = 'tp:push-endpoint:';
const CHANGE_EVENT = 'tp:push-setup-change';
/** The server is asked whether it still holds this device at most this often per account. */
const VALIDATE_EVERY_MS = 60_000;
const syncing = new Map<string, Promise<void>>();

// What was last learned about the server's side of this device, per account.
type Verdict = 'registered' | 'missing';
const verdicts = new Map<string, Verdict>();
const deviceCounts = new Map<string, number>();
/** The last explicit attempt that failed, so a server or network problem reads as "unavailable", not "denied". */
const failures = new Map<string, PushSetupError>();
const lastValidated = new Map<string, number>();

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

function read(prefix: string, userId: string): string | null {
  try { return localStorage.getItem(`${prefix}${userId}`); } catch { return null; }
}
function write(prefix: string, userId: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`${prefix}${userId}`);
    else localStorage.setItem(`${prefix}${userId}`, value);
  } catch { /* Private browsing can disable storage; the state then reads as unknown. */ }
}

/** When this browser last stored its subscription for this account; per account, so a shared device never reports another account's state. */
function registeredAt(userId: string): number | null {
  const value = Number(read(REGISTERED_PREFIX, userId));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function setRegistered(userId: string, registered: boolean): void {
  write(REGISTERED_PREFIX, userId, registered ? String(Date.now()) : null);
  announce();
}

/** The member turned notifications off on THIS device: nothing may quietly turn them back on. */
export function pushDisabledOnDevice(userId: string): boolean {
  return read(DISABLED_PREFIX, userId) === '1';
}

function setDisabled(userId: string, disabled: boolean): void {
  write(DISABLED_PREFIX, userId, disabled ? '1' : null);
  announce();
}

/** Creates or repairs this device's subscription for `userId`; concurrent callers share one attempt. */
export function ensureSubscribed(userId: string): Promise<void> {
  const pending = syncing.get(userId);
  if (pending) return pending;
  const request = subscribePush(traceRefreshAudio)
    .then(async endpoint => {
      write(FINGERPRINT_PREFIX, userId, await endpointFingerprint(endpoint).catch(() => null));
      verdicts.set(userId, 'registered');
      failures.delete(userId);
      setRegistered(userId, true);
      traceRefreshAudio('push-stage', 'registered');
    })
    .catch(error => {
      if (error instanceof PushSetupError && error.stage !== 'session') { setRegistered(userId, false); failures.set(userId, error); }
      traceRefreshAudio('push-error', error instanceof PushSetupError ? error.reference : String((error as Error)?.name));
      throw error;
    })
    .finally(() => { syncing.delete(userId); });
  syncing.set(userId, request);
  return request;
}

/**
 * Makes "on" mean what it says, every time the app is opened: the browser
 * still holds a subscription AND the server still holds this device. If the
 * browser lost it (revoked, cleared data, a reinstall) the status becomes
 * "expired"; if only the server lost it (an expired subscription is cleaned
 * up on the first refusal) or the browser rotated the endpoint, the device is
 * registered again quietly. Never asks for permission.
 */
export async function validatePushRegistration(userId: string, force = false): Promise<void> {
  if (!supportsPush() || Notification.permission !== 'granted' || pushDisabledOnDevice(userId)) return;
  if (!force && Date.now() - (lastValidated.get(userId) ?? 0) < VALIDATE_EVERY_MS) return;
  lastValidated.set(userId, Date.now());

  const endpoint = await currentEndpoint();
  if (!endpoint) {
    if (registeredAt(userId)) setRegistered(userId, false);
    verdicts.set(userId, 'missing');
    announce();
    return;
  }
  const fingerprint = await endpointFingerprint(endpoint).catch(() => null);
  const known = read(FINGERPRINT_PREFIX, userId);
  const status = await fetchPushStatus(endpoint);
  // Offline or the server is having trouble: keep what was known, claim nothing new.
  if (!status) return;
  deviceCounts.set(userId, status.devices);
  if (status.registered && (known === null || known === fingerprint)) {
    if (!registeredAt(userId)) setRegistered(userId, true);
    if (fingerprint && known === null) write(FINGERPRINT_PREFIX, userId, fingerprint);
    verdicts.set(userId, 'registered');
    announce();
    return;
  }
  try { await ensureSubscribed(userId); }
  catch { verdicts.set(userId, 'missing'); }
  announce();
}

export type PushStatus =
  | 'install-required'  // iPhone/iPad browser tab: install the Home Screen app
  | 'unsupported'
  | 'insecure'
  | 'ask'               // permission not asked yet
  | 'denied'            // blocked in settings; never re-prompt
  | 'needs-retry'       // allowed, but this device is not registered
  | 'expired'           // was registered; the browser or server no longer holds it
  | 'unavailable'       // allowed, but the server or network could not register it just now
  | 'off'               // the member turned it off on this device
  | 'on';               // allowed and stored for this account

function serverSide(error: PushSetupError | undefined): boolean {
  return !!error && (error.stage === 'public-key' || error.stage === 'save') && (error.code === '503' || error.code === 'network' || error.code === '500' || error.code === '502');
}

export function pushStatusFor(availability: PushAvailability, userId: string | undefined): PushStatus {
  if (availability === 'install-required') return 'install-required';
  if (availability === 'insecure') return 'insecure';
  if (availability !== 'supported') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'ask';
  if (!userId) return 'needs-retry';
  if (pushDisabledOnDevice(userId)) return 'off';
  if (verdicts.get(userId) === 'missing') return serverSide(failures.get(userId)) ? 'unavailable' : 'expired';
  if (registeredAt(userId)) return 'on';
  return serverSide(failures.get(userId)) ? 'unavailable' : 'needs-retry';
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

  // Each time the app is opened or comes back: does the server still hold this device?
  useEffect(() => {
    if (!userId || !isActivated) return;
    const check = () => { if (document.visibilityState === 'visible') void validatePushRegistration(userId); };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [userId, isActivated]);

  const availability = pushAvailability();
  const status = pushStatusFor(availability, userId);

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
      setDisabled(userId, false);
      await ensureSubscribed(userId);
      setNotice('Push Notifications Enabled');
      void validatePushRegistration(userId, true);
    } catch (cause) {
      if (cause instanceof PushSetupError && cause.stage === 'permission-dismissed') setError(null);
      else setError(pushErrorMessage(cause));
    } finally {
      setBusy(false);
      setVersion(v => v + 1);
    }
  }, [availability, busy, isActivated, userId]);

  /** Turns notifications off for THIS device only; other devices keep theirs. */
  const disable = useCallback(async () => {
    if (busy || !userId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await unsubscribePush();
      setNotice('Push notifications are off on this device.');
    } catch {
      setError("This device is off, but the server could not be told. It will be cleaned up automatically.");
    } finally {
      setDisabled(userId, true);
      setRegistered(userId, false);
      verdicts.delete(userId);
      failures.delete(userId);
      write(FINGERPRINT_PREFIX, userId, null);
      setBusy(false);
      setVersion(v => v + 1);
    }
  }, [busy, userId]);

  /** A real push to this account's devices, to prove the whole path works. */
  const sendTest = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendTestPush();
      setNotice(result.delivered > 0
        ? `Test sent to ${result.delivered} device${result.delivered === 1 ? '' : 's'}. It should arrive in a moment.`
        : result.attempted === 0 ? 'No device is registered for this account yet.'
        : `The push service did not accept the test (${result.statuses.join(', ') || 'no answer'}).`);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'The test notification could not be sent.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    status, availability, busy, error, notice,
    deviceCount: userId ? deviceCounts.get(userId) ?? null : null,
    enable, disable, sendTest,
    clearMessages: () => { setError(null); setNotice(null); },
  };
}

/** Only for tests: clears everything this module remembers. */
export function resetPushSetupForTests(): void {
  verdicts.clear(); deviceCounts.clear(); failures.clear(); lastValidated.clear(); syncing.clear();
}
