import {
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_AFTER_MS,
  presenceTopic,
  statusFromObservations,
  type PresenceHeartbeat,
  type PresenceObservation,
  type PresenceStatus,
  type PresenceTarget,
} from './presence-state';

/**
 * A heartbeat must settle within this, whatever the SDK does. Tearing a
 * channel down drops the reply handlers of pushes still in flight, so their
 * promises never settle; without this bound, one heartbeat caught by a
 * reconnect stopped every later heartbeat for the life of the page.
 */
export const PRESENCE_TRACK_TIMEOUT_MS = 12_000;

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
  /** Heartbeats seen on this topic, by presence ref. */
  seen: Map<string, PresenceObservation>;
  /** The next sync delivers the server's snapshot for a (re)join. */
  snapshotPending: boolean;
  /**
   * false while what this device holds may be out of date: after the page
   * comes back from the background, until the connection is proven alive or
   * a fresh snapshot arrives. Nothing is shown as online or offline then.
   */
  confirmed: boolean;
  /** Bumped on every (re)join; a heartbeat in flight belongs to the join it was sent on. */
  joins: number;
  /** The join whose heartbeat is in flight, or 0. */
  tracking: number;
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
  trackTimeoutMs?: number;
  now?: () => number;
  warn?: (message: string, detail?: string) => void;
}) {
  const entries = new Map<string, Entry<C>>();
  const removals = new Map<string, Promise<void>>();
  const warn = deps.warn ?? (() => {});
  const now = deps.now ?? Date.now;
  /** While true (an iPhone app in the background) this tab sends no heartbeats. */
  let publishingPaused = false;

  const publishStatus = (entry: Entry<C>) => {
    const next = entry.channel
      ? statusFromObservations([...entry.seen.values()], entry.connected && entry.synced && entry.confirmed, now())
      : 'unknown';
    if (entry.status === next) return;
    entry.status = next;
    for (const listener of entry.listeners) listener(next);
  };

  /** Records which heartbeats are new since the last sync, on this device's clock. */
  const recordState = (entry: Entry<C>, channel: C) => {
    const at = now();
    const present = new Set<string>();
    for (const payload of deps.readState(channel)) {
      const ref = typeof payload.ref === 'string' ? payload.ref : `stamp:${String(payload.heartbeatAt)}`;
      present.add(ref);
      if (!entry.seen.has(ref)) {
        // Only a heartbeat that arrives while this view is current counts as
        // just received; one in a snapshot, or queued while the page was in
        // the background, is judged by its stamp instead.
        entry.seen.set(ref, { heartbeatAt: payload.heartbeatAt, seenAt: at, live: !entry.snapshotPending && entry.confirmed });
      }
    }
    for (const ref of entry.seen.keys()) if (!present.has(ref)) entry.seen.delete(ref);
    if (entry.snapshotPending) {
      // A snapshot is the server's whole current state: it confirms this view.
      entry.snapshotPending = false;
      entry.confirmed = true;
    }
  };

  const track = async (entry: Entry<C>) => {
    // A connected background tab is still a valid session on a desktop. Mobile
    // browsers suspend this timer; iPhone apps pause publishing when hidden.
    // Only a heartbeat sent on the current join holds the next one back.
    if (publishingPaused || !entry.live || !entry.channel || !entry.connected || !entry.publishers
      || entry.tracking === entry.joins) return;
    const channel = entry.channel;
    const join = entry.joins;
    entry.tracking = join;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        channel.track({ heartbeatAt: new Date().toISOString() }),
        new Promise<string>(resolve => { timer = setTimeout(() => resolve('timed out'), deps.trackTimeoutMs ?? PRESENCE_TRACK_TIMEOUT_MS); }),
      ]);
      if (!entry.live || entry.channel !== channel) return;
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
      if (timer) clearTimeout(timer);
      if (entry.tracking === join) entry.tracking = 0;
    }
  };

  const startHeartbeat = (entry: Entry<C>) => {
    if (publishingPaused || !entry.connected || !entry.publishers || entry.heartbeatTimer) return;
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
    entry.snapshotPending = true;
    // RealtimeChannel.on('presence') throws after subscribe(). Register once,
    // before anyone (publisher or observer) joins the shared channel.
    channel.on('presence', { event: 'sync' }, () => {
      if (!entry.live || entry.channel !== channel) return;
      recordState(entry, channel);
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
        entry.joins++;
        // Every (re)join is followed by the server's snapshot of the topic.
        entry.snapshotPending = true;
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
        synced: false, seen: new Map(), snapshotPending: true, confirmed: false,
        joins: 0, tracking: 0, warned: false, live: true, starting: false,
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
    /** The page is back from the background: hold every status until re-confirmed. */
    unconfirm() {
      for (const entry of entries.values()) {
        entry.confirmed = false;
        publishStatus(entry);
      }
    },
    /** The connection answered after the page came back, so the state held is current. */
    confirm() {
      for (const entry of entries.values()) {
        entry.confirmed = true;
        publishStatus(entry);
      }
    },
    /**
     * iPhone and iPad suspend a hidden app within seconds, so its heartbeat
     * cannot be kept alive there. Leaving presence at once shows the account
     * as offline straight away instead of "Active now" for another 90 s.
     */
    pausePublishing() {
      publishingPaused = true;
      for (const entry of entries.values()) if (entry.publishers) {
        if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
        entry.heartbeatTimer = undefined;
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        entry.retryTimer = undefined;
        if (entry.channel && entry.connected) void entry.channel.untrack().catch(() => {});
      }
    },
    resumePublishing() {
      publishingPaused = false;
      for (const entry of entries.values()) if (entry.publishers) startHeartbeat(entry);
    },
  };
}
