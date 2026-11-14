import { describe, expect, it } from 'bun:test';
import { createPresenceManager } from './presence-manager';
import type { PresenceHeartbeat, PresenceStatus } from './presence-state';

class FakeChannel {
  onCount = 0;
  subscribeCount = 0;
  trackCount = 0;
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
    this.state.session = [payload];
    this.sync?.();
    return 'ok';
  }
  async untrack() {
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
});
