import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import {
  ownPresenceTarget,
  presenceTargetKey,
  presenceTopic,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_AFTER_MS,
  statusFromPresence,
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

const UNKNOWN: Record<string, PresenceStatus> = {};

async function ensureRealtimeSession(userId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) return false;
  // The SDK normally forwards auth events to Realtime, but an observer can
  // mount before its asynchronous initial token update completes. Await the
  // callback-backed token before joining an RLS-protected private channel.
  await supabase.realtime.setAuth();
  return true;
}

/**
 * Publishes this authenticated account's connection while the app is mounted.
 * Every tab/device gets a distinct Presence key; observers consider the account
 * online while any recent session payload remains on its private topic.
 */
export function PresenceRuntime() {
  const { user, role } = useAuth();

  useEffect(() => {
    if (!user?.id || (role !== 'admin' && role !== 'student')) return;

    const target = ownPresenceTarget(user.id, role === 'admin');
    const sessionKey = `tp-session-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    const channel = supabase.channel(presenceTopic(target), {
      config: {
        private: true,
        presence: { key: sessionKey },
      },
    });

    let active = true;
    let subscribed = false;
    let tracking = false;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let warned = false;

    const retrySoon = () => {
      if (!active || !subscribed || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void trackHeartbeat();
      }, 2_000);
    };

    const trackHeartbeat = async () => {
      if (!active || !subscribed || tracking || document.visibilityState === 'hidden') return;
      tracking = true;
      try {
        // track() resolves to 'error' or 'timed out' on RLS/auth failures; it
        // does not necessarily reject. Ignoring that result left every reader
        // with an empty, apparently offline Presence state.
        const result = await channel.track({ heartbeatAt: new Date().toISOString() });
        if (!active) return;
        if (result === 'ok') { warned = false; return; }
        if (!warned) console.warn('[presence] Account heartbeat was not accepted:', result);
        warned = true;
        // getSession refreshes an expired access token when possible. The
        // Supabase client forwards refreshed tokens to Realtime automatically.
        await supabase.auth.getSession();
        retrySoon();
      } catch {
        if (active && !warned) console.warn('[presence] Account heartbeat transport failed.');
        warned = true;
        retrySoon();
      } finally {
        tracking = false;
      }
    };

    const onStatus = (status: string, error?: Error) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        void trackHeartbeat();
        heartbeatTimer = setInterval(() => { void trackHeartbeat(); }, PRESENCE_HEARTBEAT_MS);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (status !== 'CLOSED') console.warn('[presence] Account channel unavailable:', status, error?.name ?? 'unknown');
        subscribed = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = undefined;
      }
    };
    void ensureRealtimeSession(user.id).then(ready => {
      if (active && ready) channel.subscribe(onStatus);
      else if (active) console.warn('[presence] Account channel has no authenticated session.');
    }).catch(() => {
      if (active) console.warn('[presence] Account channel authentication failed.');
    });

    const resume = () => {
      if (document.visibilityState === 'visible') void trackHeartbeat();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);

    return () => {
      active = false;
      subscribed = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      // Realtime removes Presence automatically on channel leave; untrack first
      // so normal logout/account changes clear promptly when transport permits.
      void channel.untrack().catch(() => {});
      void supabase.removeChannel(channel);
    };
  }, [user?.id, role]);

  return null;
}

/**
 * Shared reader for chat headers, inbox rows and profile screens. Each account
 * owns one private topic; multiple observed targets are multiplexed over the
 * same Supabase WebSocket and deduplicated within the mounted surface.
 */
export function usePresence(targets: readonly PresenceTarget[]): Record<string, PresenceStatus> {
  const { user } = useAuth();
  const targetSpec = useMemo(() => {
    const unique = new Map<string, { key: string; topic: string }>();
    for (const target of targets) {
      const key = presenceTargetKey(target);
      unique.set(key, { key, topic: presenceTopic(target) });
    }
    return [...unique.values()];
    // Callers may create a new array on render; its serialized targets are the
    // meaningful subscription dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(targets.map(target => [presenceTargetKey(target), presenceTopic(target)]).sort())]);
  const specKey = targetSpec.map(item => `${item.key}=${item.topic}`).join('|');
  const [statuses, setStatuses] = useState<Record<string, PresenceStatus>>(UNKNOWN);

  useEffect(() => {
    setStatuses(Object.fromEntries(targetSpec.map(target => [target.key, 'unknown' as const])));
    if (!user?.id || targetSpec.length === 0) return;

    let active = true;
    const channels = targetSpec.map(({ key, topic }) => {
      const flags = { connected: false, synced: false };
      const channel = supabase.channel(topic, {
        config: {
          private: true,
          presence: { key: `tp-observer-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`, enabled: true },
        },
      });

      const update = () => {
        if (!active) return;
        const state = channel.presenceState<PresenceHeartbeat>();
        const payloads = Object.values(state).flat();
        const status = statusFromPresence(payloads, flags.connected && flags.synced);
        setStatuses(previous => previous[key] === status ? previous : { ...previous, [key]: status });
      };

      channel.on('presence', { event: 'sync' }, () => {
        flags.synced = true;
        update();
      });
      const onStatus = (status: string, error?: Error) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          flags.connected = true;
          update();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (status !== 'CLOSED') console.warn('[presence] Observer channel unavailable:', status, error?.name ?? 'unknown');
          flags.connected = false;
          flags.synced = false;
          update();
        }
      };
      return { key, channel, flags, onStatus };
    });

    void ensureRealtimeSession(user.id).then(ready => {
      if (!active) return;
      if (!ready) {
        console.warn('[presence] Observer channels have no authenticated session.');
        return;
      }
      for (const { channel, onStatus } of channels) channel.subscribe(onStatus);
    }).catch(() => {
      if (active) console.warn('[presence] Observer channel authentication failed.');
    });

    const expiryTimer = setInterval(() => {
      for (const { key, channel, flags } of channels) {
        if (!active || !flags.connected || !flags.synced) continue;
        const state = channel.presenceState<PresenceHeartbeat>();
        const payloads = Object.values(state).flat();
        const status = statusFromPresence(payloads, true);
        setStatuses(previous => previous[key] === status
          ? previous
          : { ...previous, [key]: status });
      }
    }, Math.min(15_000, PRESENCE_STALE_AFTER_MS / 4));

    return () => {
      active = false;
      clearInterval(expiryTimer);
      for (const { channel } of channels) void supabase.removeChannel(channel);
    };
    // specKey serializes target IDs/topics; recreating arrays is harmless.
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
