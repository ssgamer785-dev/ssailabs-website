import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import { isAppleMobileWebKit } from '../notifications/push';
import { createPresenceManager } from './presence-manager';
import {
  ownPresenceTarget,
  presenceTargetKey,
  presenceTopic,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_AFTER_MS,
  type PresenceHeartbeat,
  type PresenceStatus,
  type PresenceTarget,
} from './presence-state';

export {
  ownPresenceTarget,
  presenceTargetKey,
  presenceTopic,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_AFTER_MS,
  type PresenceStatus,
  type PresenceTarget,
} from './presence-state';

const authChecks = new Map<string, Promise<boolean>>();
function ensureRealtimeSession(userId: string): Promise<boolean> {
  const existing = authChecks.get(userId);
  if (existing) return existing;
  const check = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== userId) return false;
    await supabase.realtime.setAuth();
    return true;
  })();
  authChecks.set(userId, check);
  void check.finally(() => {
    if (authChecks.get(userId) === check) authChecks.delete(userId);
  }).catch(() => {});
  return check;
}

const manager = createPresenceManager({
  channel: (topic: string) => supabase.channel(topic, {
    config: {
      private: true,
      presence: {
        key: `tp-session-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
        enabled: true,
      },
    },
  }),
  removeChannel: channel => supabase.removeChannel(channel),
  readState: channel => Object.values(channel.presenceState<PresenceHeartbeat>()).flat()
    .map(meta => ({ heartbeatAt: meta.heartbeatAt, ref: meta.presence_ref })),
  ensureAuth: ensureRealtimeSession,
  warn: (message, detail) => console.warn(`[presence] ${message}`, detail ?? ''),
});

/** A heartbeat unanswered for this long means the connection is dead even if it looks open. */
const PROBE_TIMEOUT_MS = 5_000;
/** Hidden at least this long: what this device holds may be out of date. */
const RECHECK_AFTER_HIDDEN_MS = 5_000;

/**
 * After the page comes back, finds out quickly whether the Realtime
 * connection still works. A phone can resume with a socket that looks open
 * but died while suspended; Realtime itself only notices at its next missed
 * heartbeat, up to 50 s later. Sends one heartbeat and, if that same one is
 * still unanswered after 5 s, sends another, which makes Realtime drop the
 * connection and reconnect (every channel then rejoins with a fresh snapshot).
 */
async function probeRealtime(): Promise<'alive' | 'reconnecting'> {
  const realtime = supabase.realtime;
  if (!realtime.isConnected()) return 'reconnecting';
  if (!realtime.pendingHeartbeatRef) await realtime.sendHeartbeat();
  const ref = realtime.pendingHeartbeatRef;
  if (!ref) return realtime.isConnected() ? 'alive' : 'reconnecting';
  const deadline = Date.now() + PROBE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (realtime.pendingHeartbeatRef !== ref) return realtime.isConnected() ? 'alive' : 'reconnecting';
  }
  await realtime.sendHeartbeat();
  return 'reconnecting';
}

/** One publisher per authenticated tab; reader screens share its topic channel. */
export function PresenceRuntime() {
  const { user, role } = useAuth();

  useEffect(() => {
    if (!user?.id || (role !== 'admin' && role !== 'student')) return;
    const userId = user.id;
    const release = manager.acquire(userId, ownPresenceTarget(userId, role === 'admin'), true);
    const pausesWhenHidden = isAppleMobileWebKit();
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0;
    let probing = false;

    const recheck = (hiddenFor: number) => {
      if (hiddenFor >= RECHECK_AFTER_HIDDEN_MS) manager.unconfirm();
      if (probing) return;
      probing = true;
      void probeRealtime().then(result => {
        if (result === 'alive') manager.confirm();
      }).finally(() => { probing = false; });
      void ensureRealtimeSession(userId).then(ready => {
        if (ready) manager.refreshPublishers();
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        if (pausesWhenHidden) manager.pausePublishing();
        return;
      }
      const hiddenFor = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (pausesWhenHidden) manager.resumePublishing();
      recheck(hiddenFor);
    };
    // Back from the back/forward cache, or the network came back: the
    // connection may be gone even though the page never reported hidden.
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) recheck(RECHECK_AFTER_HIDDEN_MS); };
    const onOnline = () => recheck(RECHECK_AFTER_HIDDEN_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
      if (pausesWhenHidden) manager.resumePublishing();
      release();
    };
  }, [user?.id, role]);

  return null;
}

/** Shared Presence reader for chat headers, inbox rows and profile screens. */
export function usePresence(targets: readonly PresenceTarget[]): Record<string, PresenceStatus> {
  const { user } = useAuth();
  const targetSpec = useMemo(() => {
    const unique = new Map<string, PresenceTarget>();
    for (const target of targets) unique.set(presenceTargetKey(target), target);
    return [...unique].map(([key, target]) => ({ key, target }));
    // Callers often create new arrays on render; serialized targets are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(targets.map(target => [presenceTargetKey(target), presenceTopic(target)]).sort())]);
  const specKey = targetSpec.map(({ key, target }) => `${key}=${presenceTopic(target)}`).join('|');
  const [statuses, setStatuses] = useState<Record<string, PresenceStatus>>({});

  useEffect(() => {
    setStatuses(Object.fromEntries(targetSpec.map(({ key }) => [key, 'unknown' as const])));
    if (!user?.id) return;
    let active = true;
    const releases = targetSpec.map(({ key, target }) => manager.acquire(user.id, target, false, status => {
      if (!active) return;
      setStatuses(previous => previous[key] === status ? previous : { ...previous, [key]: status });
    }));
    return () => {
      active = false;
      for (const release of releases) release();
    };
    // specKey represents all observed topics and account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, specKey]);

  return statuses;
}

export function PresenceIndicator({ status, className, text = true }: {
  status: PresenceStatus;
  className?: string;
  text?: boolean;
}) {
  const label = status === 'online' ? 'Active now'
    : status === 'offline' ? 'Offline'
    : 'Status unavailable';
  const color = status === 'online' ? 'var(--success)'
    : status === 'offline' ? 'var(--neutral-fill-2)'
    : 'var(--text-faint)';

  return (
    <span
      className={className}
      aria-label={label}
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, color: status === 'online' ? 'var(--success-ink-2)' : 'var(--text-faint)', fontSize: 11.5, fontWeight: 600, lineHeight: 1.25, whiteSpace: 'nowrap' }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: color }} />
      {text && <span>{label}</span>}
    </span>
  );
}
