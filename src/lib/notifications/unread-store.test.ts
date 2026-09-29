import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

let counts: number[] = [];
let rpcCalls = 0;
const channels: { name: string; onChange?: () => void; onStatus?: (status: string) => void }[] = [];
mock.module('../supabase', () => ({
  supabase: {
    rpc: async () => { rpcCalls++; return { data: counts.length > 1 ? counts.shift() : counts[0], error: null }; },
    channel: (name: string) => {
      const entry: (typeof channels)[number] = { name };
      channels.push(entry);
      const chain = {
        on: (_type: string, _filter: unknown, callback: () => void) => { entry.onChange = callback; return chain; },
        subscribe: (callback?: (status: string) => void) => { entry.onStatus = callback; return chain; },
      };
      return chain;
    },
    removeChannel: async () => {},
  },
}));
mock.module('../auth-context', () => ({ useAuth: () => ({ user: null }) }));

const saved = globalThis as Record<string, unknown>;
const originals = { window: saved.window, document: saved.document };
const { NOTIFICATIONS_CHANGED_EVENT } = await import('./events');
const { subscribeUnreadCount, resetUnreadStoreForTests } = await import('./unread-store');

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

beforeEach(() => {
  counts = [2]; rpcCalls = 0; channels.length = 0;
  saved.window = new EventTarget();
  saved.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  resetUnreadStoreForTests();
});
afterEach(() => { resetUnreadStoreForTests(); Object.assign(saved, originals); });

describe('the shared unread count', () => {
  it('serves every screen from one channel and one first read', async () => {
    const a: number[] = [], b: number[] = [];
    const stopA = subscribeUnreadCount('u1', n => a.push(n));
    const stopB = subscribeUnreadCount('u1', n => b.push(n));
    await wait(30);
    expect(channels.filter(c => c.name === 'notification-unread-u1')).toHaveLength(1);
    expect(rpcCalls).toBe(1);
    expect(a.at(-1)).toBe(2);
    expect(b.at(-1)).toBe(2);
    stopA(); stopB();
  });

  it('refreshes when a notification row changes (another device read one)', async () => {
    const seen: number[] = [];
    const stop = subscribeUnreadCount('u1', n => seen.push(n));
    await wait(30);
    counts = [1];
    channels[0].onChange!();
    channels[0].onChange!();     // a burst asks once
    await wait(260);
    expect(seen.at(-1)).toBe(1);
    expect(rpcCalls).toBe(2);
    stop();
  });

  it('refreshes when this device announces a change, but only for this member', async () => {
    const seen: number[] = [];
    const stop = subscribeUnreadCount('u1', n => seen.push(n));
    await wait(30);
    counts = [0];
    (saved.window as EventTarget).dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId: 'someone-else' } }));
    await wait(260);
    expect(rpcCalls).toBe(1);
    (saved.window as EventTarget).dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId: 'u1' } }));
    await wait(260);
    expect(rpcCalls).toBe(2);
    expect(seen.at(-1)).toBe(0);
    stop();
  });

  it('refreshes when the app comes back to the foreground and when the connection returns', async () => {
    const stop = subscribeUnreadCount('u1', () => {});
    await wait(30);
    (saved.document as EventTarget).dispatchEvent(new Event('visibilitychange'));
    await wait(260);
    expect(rpcCalls).toBe(2);
    (saved.window as EventTarget).dispatchEvent(new Event('online'));
    await wait(260);
    expect(rpcCalls).toBe(3);
    stop();
  });

  it('reads again once the socket confirms it is subscribed (events may have been missed while it connected)', async () => {
    const stop = subscribeUnreadCount('u1', () => {});
    await wait(30);
    channels[0].onStatus!('SUBSCRIBED');
    await wait(260);
    expect(rpcCalls).toBe(2);
    stop();
  });

  it('a different member gets a store of their own', async () => {
    const first = subscribeUnreadCount('u1', () => {});
    await wait(30);
    const second = subscribeUnreadCount('u2', () => {});
    await wait(30);
    expect(channels.map(c => c.name)).toEqual(['notification-unread-u1', 'notification-unread-u2']);
    first(); second();
  });

  it('is torn down after the last screen leaves, but not in between two screens', async () => {
    const stopA = subscribeUnreadCount('u1', () => {});
    stopA();
    const stopB = subscribeUnreadCount('u1', () => {});    // the next screen mounts straight away
    await wait(1100);
    expect(channels).toHaveLength(1);
    stopB();
  });
});
