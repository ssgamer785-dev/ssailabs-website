import { describe, expect, it } from 'bun:test';
import { UploadQueue } from './upload-queue';

/** A controllable upload: resolve(i) / fail(i) finishes the i-th started run. */
function harness(concurrency = 2) {
  const started: { name: string; resolve: (v: string) => void; reject: (e: Error) => void; signal: AbortSignal; progress: (f: number) => void }[] = [];
  let maxRunning = 0;
  let running = 0;
  const queue = new UploadQueue<string, string>({
    concurrency,
    run: (item, signal, progress) => new Promise<string>((resolve, reject) => {
      running++; maxRunning = Math.max(maxRunning, running);
      const done = () => { running--; };
      signal.addEventListener('abort', () => { done(); reject(new Error('aborted')); });
      started.push({ name: item.payload, signal, progress,
        resolve: v => { done(); resolve(v); }, reject: e => { done(); reject(e); } });
    }),
  });
  const tick = () => new Promise(r => setTimeout(r, 0));
  return { queue, started, tick, max: () => maxRunning };
}

describe('uploading several attachments', () => {
  it('never runs more than the allowed number at once, and runs every item', async () => {
    const h = harness(2);
    h.queue.add(['a', 'b', 'c', 'd', 'e']);
    await h.tick();
    expect(h.started.map(s => s.name)).toEqual(['a', 'b']);
    for (let i = 0; i < 5; i++) { h.started[i].resolve(`key-${h.started[i].name}`); await h.tick(); }
    await h.queue.whenSettled();
    expect(h.max()).toBe(2);
    expect(h.queue.list().map(i => [i.payload, i.state, i.result])).toEqual(
      ['a', 'b', 'c', 'd', 'e'].map(n => [n, 'done', `key-${n}`]));
  });

  it('one failure keeps the others; retrying re-runs only the failed item', async () => {
    const h = harness(3);
    h.queue.add(['a', 'b', 'c']);
    await h.tick();
    h.started[0].resolve('ka'); h.started[1].reject(new Error('network down')); h.started[2].resolve('kc');
    await h.queue.whenSettled();
    expect(h.queue.list().map(i => i.state)).toEqual(['done', 'failed', 'done']);
    expect(h.queue.list()[1].error).toBe('network down');
    expect(h.queue.overall()).toMatchObject({ total: 3, done: 2, failed: 1 });

    h.queue.retryFailed();
    await h.tick();
    expect(h.started.map(s => s.name)).toEqual(['a', 'b', 'c', 'b']);   // only b again
    h.started[3].resolve('kb');
    await h.queue.whenSettled();
    expect(h.queue.list().map(i => i.result)).toEqual(['ka', 'kb', 'kc']);
  });

  it('cancelling one aborts its transfer and leaves the rest going; it no longer counts', async () => {
    const h = harness(2);
    const [a] = h.queue.add(['a', 'b']);
    await h.tick();
    h.queue.cancel(a);
    expect(h.started[0].signal.aborted).toBe(true);
    h.started[1].resolve('kb');
    await h.queue.whenSettled();
    expect(h.queue.list().map(i => i.state)).toEqual(['cancelled', 'done']);
    expect(h.queue.overall()).toMatchObject({ total: 1, done: 1, fraction: 1 });
  });

  it('reports per-item and overall progress', async () => {
    const h = harness(2);
    h.queue.add(['a', 'b']);
    await h.tick();
    h.started[0].progress(0.5);
    h.started[1].progress(0.25);
    expect(h.queue.list().map(i => i.progress)).toEqual([0.5, 0.25]);
    expect(h.queue.overall().fraction).toBeCloseTo(0.375);
    h.started[0].resolve('ka'); h.started[1].resolve('kb');
    await h.queue.whenSettled();
  });

  it('can be reordered and pruned before sending', () => {
    const h = harness();
    const ids = h.queue.add(['a', 'b', 'c'], false);
    h.queue.move(ids[2], 0);
    h.queue.remove(ids[1]);
    expect(h.queue.list().map(i => i.payload)).toEqual(['c', 'a']);
    expect(h.started).toHaveLength(0);
  });
});
