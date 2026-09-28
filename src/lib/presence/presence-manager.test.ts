import { describe, expect, it } from 'bun:test';
import { createPresenceManager } from './presence-manager';
import type { PresenceHeartbeat, PresenceStatus } from './presence-state';

class FakeChannel {
  onCount = 0;
  subscribeCount = 0;
  trackCount = 0;
  untrackCount = 0;
  /** When set, track() never settles: what a push does when its channel is torn down mid-flight. */
  hang = false;
  state: Record<string, PresenceHeartbeat[]> = {};
  sync?: () => void;
  status?: (status: string, error?: Error) => void;
  on(_type: 'presence', _filter: { event: 'sync' }, callback: () => void) {
    if (this.subscribeCount) throw new Error('cannot add presence callbacks after subscribe');
    this.onCount++;
    this.sync = callback;
  }
  subscribe(callback: (status: string, error?: Error) => void) {
    this.subscribeCount++;
    this.status = callback;
    callback('SUBSCRIBED');
  }
  async track(payload: { heartbeatAt: string }) {
    this.trackCount++;
    if (this.hang) return new Promise<string>(() => {});
    this.state.session = [payload];
    this.sync?.();
    return 'ok';
  }
  async untrack() {
    this.untrackCount++;
    delete this.state.session;
    this.sync?.();
    return 'ok';
  }
}

function harness() {
  const channels = new Map<string, FakeChannel>();
  const created: FakeChannel[] = [];
  let removed = 0;
  const manager = createPresenceManager({
    channel(topic) {
      let channel = channels.get(topic);
      if (!channel) {
        channel = new FakeChannel();
        channels.set(topic, channel);
        created.push(channel);
      }
      return channel;
    },
    async removeChannel(channel) {
      removed++;
      for (const [topic, stored] of channels) if (stored === channel) channels.delete(topic);
    },
    readState: channel => Object.values(channel.state).flat(),
    ensureAuth: async () => true,
    retryDelayMs: 1,
  });
  return { manager, channels, created, removed: () => removed };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('shared private Presence channel lifecycle', () => {
  it('registers one listener before subscribing, even with simultaneous publisher and readers', async () => {
    const test = harness();
    const first: PresenceStatus[] = [];
    const second: PresenceStatus[] = [];
    const releasePublisher = test.manager.acquire('admin-id', { kind: 'admin' }, true);
    const releaseFirst = test.manager.acquire('admin-id', { kind: 'admin' }, false, value => first.push(value));
    const releaseSecond = test.manager.acquire('admin-id', { kind: 'admin' }, false, value => second.push(value));
    await flush();
    expect(test.created).toHaveLength(1);
    expect(test.created[0].onCount).toBe(1);
    expect(test.created[0].subscribeCount).toBe(1);
    expect(test.created[0].trackCount).toBe(1);
    expect(first.at(-1)).toBe('online');
    expect(second.at(-1)).toBe('online');
    releaseFirst();
    expect(test.removed()).toBe(0);
    const later: PresenceStatus[] = [];
    const releaseLater = test.manager.acquire('admin-id', { kind: 'admin' }, false, value => later.push(value));
    expect(later.at(-1)).toBe('online');
    expect(test.created[0].onCount).toBe(1);
    releaseLater();
    releaseSecond();
    releasePublisher();
    await flush();
    expect(test.removed()).toBe(1);
    expect(test.manager.activeTopics()).toBe(0);
  });

  it('keeps a shared observer channel until its final screen leaves', async () => {
    const test = harness();
    const releaseInbox = test.manager.acquire('student-id', { kind: 'admin' }, false);
    const releaseChat = test.manager.acquire('student-id', { kind: 'admin' }, false);
    await flush();
    expect(test.created).toHaveLength(1);
    releaseInbox();
    expect(test.removed()).toBe(0);
    releaseChat();
    await flush();
    expect(test.removed()).toBe(1);
  });

  it('waits for old-topic cleanup before a changed account joins', async () => {
    const test = harness();
    const releaseOld = test.manager.acquire('old-admin-id', { kind: 'admin' }, true);
    await flush();
    releaseOld();
    const releaseNew = test.manager.acquire('new-admin-id', { kind: 'admin' }, true);
    await flush();
    expect(test.created).toHaveLength(2);
    expect(test.created[1]).not.toBe(test.created[0]);
    expect(test.created[1].subscribeCount).toBe(1);
    releaseNew();
    await flush();
    expect(test.manager.activeTopics()).toBe(0);
  });

  it('reports unavailable after channel failure instead of a false offline state', async () => {
    const test = harness();
    const seen: PresenceStatus[] = [];
    const release = test.manager.acquire('student-id', { kind: 'admin' }, false, value => seen.push(value));
    await flush();
    const channel = test.created[0];
    channel.state.remote = [{ heartbeatAt: new Date().toISOString() }];
    channel.sync?.();
    expect(seen.at(-1)).toBe('online');
    channel.status?.('CHANNEL_ERROR', new Error('disconnected'));
    expect(seen.at(-1)).toBe('unknown');
    release();
  });

  it('recreates a failed channel and ignores late callbacks from the old one', async () => {
    const test = harness();
    const seen: PresenceStatus[] = [];
    const release = test.manager.acquire('admin-id', { kind: 'student', userId: 'student-id' }, false, value => seen.push(value));
    await flush();
    const first = test.created[0];
    first.status?.('CHANNEL_ERROR', new Error('disconnected'));
    expect(seen.at(-1)).toBe('unknown');
    await new Promise(resolve => setTimeout(resolve, 10));
    await flush();
    expect(test.created).toHaveLength(2);
    const replacement = test.created[1];
    replacement.state.remote = [{ heartbeatAt: new Date().toISOString() }];
    replacement.sync?.();
    expect(seen.at(-1)).toBe('online');
    first.status?.('CHANNEL_ERROR', new Error('old socket'));
    expect(seen.at(-1)).toBe('online');
    release();
  });

  it('recovers a publisher after its first session check fails', async () => {
    let authenticated = false;
    const channels: FakeChannel[] = [];
    const manager = createPresenceManager({
      channel: () => { const channel = new FakeChannel(); channels.push(channel); return channel; },
      removeChannel: async () => {},
      readState: channel => Object.values(channel.state).flat(),
      ensureAuth: async () => authenticated,
    });
    const release = manager.acquire('admin-id', { kind: 'admin' }, true);
    await flush();
    expect(channels).toHaveLength(0);
    authenticated = true;
    manager.refreshPublishers();
    await flush();
    expect(channels).toHaveLength(1);
    expect(channels[0].trackCount).toBe(1);
    release();
  });

  it('keeps sending heartbeats after one is caught by a reconnect and never settles', async () => {
    const test = harness();
    const release = test.manager.acquire('student-id', { kind: 'student', userId: 'student-id' }, true);
    await flush();
    const channel = test.created[0];
    expect(channel.trackCount).toBe(1);
    channel.hang = true;
    test.manager.refreshPublishers();
    await flush();
    expect(channel.trackCount).toBe(2);
    // The socket drops and the channel rejoins; the stuck heartbeat never settles.
    channel.status?.('CHANNEL_ERROR', new Error('socket closed'));
    channel.hang = false;
    channel.status?.('SUBSCRIBED');
    await flush();
    expect(channel.trackCount).toBe(3);
    release();
  });

  it('frees the next heartbeat when one gets no answer at all', async () => {
    const channels: FakeChannel[] = [];
    const manager = createPresenceManager({
      channel: () => { const channel = new FakeChannel(); channels.push(channel); return channel; },
      removeChannel: async () => {},
      readState: channel => Object.values(channel.state).flat(),
      ensureAuth: async () => true,
      retryDelayMs: 1,
      trackTimeoutMs: 20,
    });
    const release = manager.acquire('student-id', { kind: 'student', userId: 'student-id' }, true);
    await flush();
    channels[0].hang = true;
    manager.refreshPublishers();
    await flush();
    const stuck = channels[0].trackCount;
    await new Promise(resolve => setTimeout(resolve, 60));
    channels[0].hang = false;
    manager.refreshPublishers();
    await flush();
    expect(channels[0].trackCount).toBe(stuck + 1);
    release();
  });

  it('holds every status after the page returns until the connection is confirmed', async () => {
    const test = harness();
    const seen: PresenceStatus[] = [];
    const release = test.manager.acquire('admin-id', { kind: 'student', userId: 'student-id' }, false, value => seen.push(value));
    await flush();
    const channel = test.created[0];
    channel.state.remote = [{ heartbeatAt: new Date().toISOString(), ref: 'r1' }];
    channel.sync?.();
    expect(seen.at(-1)).toBe('online');
    test.manager.unconfirm();
    expect(seen.at(-1)).toBe('unknown');
    // A queued change arriving before confirmation does not decide anything.
    channel.state.remote = [];
    channel.sync?.();
    expect(seen.at(-1)).toBe('unknown');
    test.manager.confirm();
    expect(seen.at(-1)).toBe('offline');
    test.manager.unconfirm();
    // A rejoin's fresh snapshot confirms on its own.
    channel.status?.('SUBSCRIBED');
    channel.state.remote = [{ heartbeatAt: new Date().toISOString(), ref: 'r2' }];
    channel.sync?.();
    expect(seen.at(-1)).toBe('online');
    release();
  });

  it('judges heartbeats by arrival on this device, not by the sender\'s clock', async () => {
    let clock = 1_800_000_000_000;
    const channels: FakeChannel[] = [];
    const manager = createPresenceManager({
      channel: () => { const channel = new FakeChannel(); channels.push(channel); return channel; },
      removeChannel: async () => {},
      readState: channel => Object.values(channel.state).flat(),
      ensureAuth: async () => true,
      now: () => clock,
    });
    const seen: PresenceStatus[] = [];
    const release = manager.acquire('admin-id', { kind: 'student', userId: 'student-id' }, false, value => seen.push(value));
    await flush();
    const channel = channels[0];
    const twoMinutesAhead = new Date(clock + 120_000).toISOString();
    channel.state.remote = [{ heartbeatAt: twoMinutesAhead, ref: 'a' }];
    channel.sync?.();
    expect(seen.at(-1)).toBe('online');
    // Heartbeats keep arriving live, each stamped by a clock 2 min fast.
    for (let beat = 0; beat < 6; beat++) {
      clock += 30_000;
      channel.state.remote = [{ heartbeatAt: new Date(clock + 120_000).toISOString(), ref: `b${beat}` }];
      channel.sync?.();
      expect(seen.at(-1)).toBe('online');
    }
    // A sender 2 min slow is just as online.
    clock += 30_000;
    channel.state.remote = [{ heartbeatAt: new Date(clock - 120_000).toISOString(), ref: 'slow' }];
    channel.sync?.();
    expect(seen.at(-1)).toBe('online');
    // Heartbeats stop: offline once the last one is more than 90 s old here.
    clock += 91_000;
    manager.confirm();
    expect(seen.at(-1)).toBe('offline');
    release();
  });

  it('leaves presence while an iPhone app is in the background and returns on resume', async () => {
    const test = harness();
    const release = test.manager.acquire('student-id', { kind: 'student', userId: 'student-id' }, true);
    await flush();
    const channel = test.created[0];
    expect(channel.trackCount).toBe(1);
    test.manager.pausePublishing();
    await flush();
    expect(channel.untrackCount).toBe(1);
    test.manager.refreshPublishers();
    await flush();
    expect(channel.trackCount).toBe(1);
    test.manager.resumePublishing();
    await flush();
    expect(channel.trackCount).toBe(2);
    release();
  });
});
