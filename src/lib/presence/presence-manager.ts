import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_AFTER_MS,
  presenceTopic,
  statusFromPresence,
  type PresenceHeartbeat,
  type PresenceStatus,
  type PresenceTarget,
} from './presence-state';

export interface PresenceChannelLike {
  on(type: 'presence', filter: { event: 'sync' }, callback: () => void): unknown;
  subscribe(callback: (status: string, error?: Error) => void): unknown;
  track(payload: { heartbeatAt: string }): Promise<string>;
  untrack(): Promise<unknown>;
}

interface Entry<C extends PresenceChannelLike> {
  ownerId: string;
  topic: string;
  channel: C | null;
  refs: number;
  publishers: number;
  listeners: Set<(status: PresenceStatus) => void>;
  status: PresenceStatus;
  connected: boolean;
  synced: boolean;
  tracking: boolean;
  warned: boolean;
  live: boolean;
  starting: boolean;
  heartbeatTimer?: ReturnType<typeof setInterval>;
  expiryTimer?: ReturnType<typeof setInterval>;
  retryTimer?: ReturnType<typeof setTimeout>;
  setupRetryTimer?: ReturnType<typeof setTimeout>;
}

/** One SDK channel and one pre-subscribe listener per topic in this browser tab. */
export function createPresenceManager<C extends PresenceChannelLike>(deps: {
  channel: (topic: string) => C;
  removeChannel: (channel: C) => Promise<unknown>;
  readState: (channel: C) => PresenceHeartbeat[];
  ensureAuth: (ownerId: string) => Promise<boolean>;
  retryDelayMs?: number;
  warn?: (message: string, detail?: string) => void;
}) {
  const entries = new Map<string, Entry<C>>();
  const removals = new Map<string, Promise<void>>();
  const warn = deps.warn ?? (() => {});

  const publishStatus = (entry: Entry<C>) => {
    const next = entry.channel
      ? statusFromPresence(deps.readState(entry.channel), entry.connected && entry.synced)
      : 'unknown';
    if (entry.status === next) return;
    entry.status = next;
    for (const listener of entry.listeners) listener(next);
  };

  const track = async (entry: Entry<C>) => {
    // A connected background tab is still a valid session. Mobile browsers
    // naturally suspend this timer; its heartbeat then expires after 90 s.
    if (!entry.live || !entry.channel || !entry.connected || !entry.publishers
      || entry.tracking) return;
    entry.tracking = true;
    try {
      const result = await entry.channel.track({ heartbeatAt: new Date().toISOString() });
      if (!entry.live) return;
      if (result === 'ok') { entry.warned = false; return; }
      if (!entry.warned) warn('Presence heartbeat rejected', result);
      entry.warned = true;
      await deps.ensureAuth(entry.ownerId);
      if (!entry.retryTimer) entry.retryTimer = setTimeout(() => {
        entry.retryTimer = undefined;
        void track(entry);
      }, 2_000);
    } catch {
      if (entry.live && !entry.warned) warn('Presence heartbeat transport failed');
      entry.warned = true;
      if (entry.live && !entry.retryTimer) entry.retryTimer = setTimeout(() => {
        entry.retryTimer = undefined;
        void track(entry);
      }, 2_000);
    } finally {
      entry.tracking = false;
    }
  };

  const startHeartbeat = (entry: Entry<C>) => {
    if (!entry.connected || !entry.publishers || entry.heartbeatTimer) return;
    void track(entry);
    entry.heartbeatTimer = setInterval(() => { void track(entry); }, PRESENCE_HEARTBEAT_MS);
  };

  const retrySetup = (entry: Entry<C>) => {
    if (!entry.live || entry.setupRetryTimer) return;
    entry.setupRetryTimer = setTimeout(async () => {
      entry.setupRetryTimer = undefined;
      if (!entry.live || entry.connected) return;
      if (entry.channel) {
        const failed = entry.channel;
        entry.channel = null;
        const removal = deps.removeChannel(failed).then(() => {}, () => {});
        removals.set(entry.topic, removal);
        await removal;
        if (removals.get(entry.topic) === removal) removals.delete(entry.topic);
      }
      void start(entry);
    }, deps.retryDelayMs ?? 5_000);
  };

  const start = async (entry: Entry<C>) => {
    if (entry.starting || entry.channel || !entry.live) return;
    entry.starting = true;
    try {
    // A fast logout/login must not inherit an old SDK channel for this topic.
    await removals.get(entry.topic);
    if (!entry.live) return;
    if (!await deps.ensureAuth(entry.ownerId)) { retrySetup(entry); return; }
    if (!entry.live) return;
    const channel = deps.channel(entry.topic);
    entry.channel = channel;
    // RealtimeChannel.on('presence') throws after subscribe(). Register once,
    // before anyone (publisher or observer) joins the shared channel.
    channel.on('presence', { event: 'sync' }, () => {
      if (!entry.live || entry.channel !== channel) return;
      entry.synced = true;
      publishStatus(entry);
    });
    if (!entry.live) return;
    channel.subscribe((status, error) => {
      if (!entry.live || entry.channel !== channel) return;
      if (status === 'SUBSCRIBED') {
        if (entry.setupRetryTimer) clearTimeout(entry.setupRetryTimer);
        entry.setupRetryTimer = undefined;
        entry.connected = true;
        publishStatus(entry);
        startHeartbeat(entry);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        entry.connected = false;
        entry.synced = false;
        if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
        entry.heartbeatTimer = undefined;
        publishStatus(entry);
        if (status !== 'CLOSED') warn('Presence channel unavailable', `${status}:${error?.name ?? 'unknown'}`);
        retrySetup(entry);
      }
    });
    entry.expiryTimer = setInterval(() => publishStatus(entry), Math.min(15_000, PRESENCE_STALE_AFTER_MS / 4));
    } catch {
      if (entry.live) {
        warn('Presence channel setup failed');
        if (entry.channel) {
          const failed = entry.channel;
          entry.channel = null;
          const removal = deps.removeChannel(failed).then(() => {}, () => {});
          removals.set(entry.topic, removal);
          void removal.finally(() => {
            if (removals.get(entry.topic) === removal) removals.delete(entry.topic);
          });
        }
        retrySetup(entry);
      }
    } finally {
      entry.starting = false;
    }
  };

  const acquire = (
    ownerId: string,
    target: PresenceTarget,
    publisher: boolean,
    listener?: (status: PresenceStatus) => void,
  ) => {
    const topic = presenceTopic(target);
    const key = `${ownerId}|${topic}`;
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        ownerId, topic, channel: null, refs: 0, publishers: 0,
        listeners: new Set(), status: 'unknown', connected: false,
        synced: false, tracking: false, warned: false, live: true, starting: false,
      };
      entries.set(key, entry);
      void start(entry);
    }
    const current = entry;
    current.refs++;
    if (publisher) {
      current.publishers++;
      startHeartbeat(current);
    }
    if (listener) {
      current.listeners.add(listener);
      listener(current.status);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (listener) current.listeners.delete(listener);
      current.refs--;
      if (publisher) {
        current.publishers--;
        if (!current.publishers) {
          if (current.heartbeatTimer) clearInterval(current.heartbeatTimer);
          current.heartbeatTimer = undefined;
          if (current.retryTimer) clearTimeout(current.retryTimer);
          current.retryTimer = undefined;
          if (current.channel) void current.channel.untrack().catch(() => {});
        }
      }
      if (current.refs) return;
      current.live = false;
      entries.delete(key);
      if (current.heartbeatTimer) clearInterval(current.heartbeatTimer);
      if (current.expiryTimer) clearInterval(current.expiryTimer);
      if (current.retryTimer) clearTimeout(current.retryTimer);
      if (current.setupRetryTimer) clearTimeout(current.setupRetryTimer);
      if (!current.channel) return;
      const removal = deps.removeChannel(current.channel).then(() => {}, () => {
        warn('Presence channel cleanup failed');
      });
      removals.set(topic, removal);
      void removal.finally(() => {
        if (removals.get(topic) === removal) removals.delete(topic);
      });
    };
  };

  return {
    acquire,
    refreshPublishers() {
      for (const entry of entries.values()) if (entry.publishers) {
        if (!entry.channel) {
          if (entry.setupRetryTimer) clearTimeout(entry.setupRetryTimer);
          entry.setupRetryTimer = undefined;
          void start(entry);
        } else void track(entry);
      }
    },
    activeTopics() { return entries.size; },
  };
}
