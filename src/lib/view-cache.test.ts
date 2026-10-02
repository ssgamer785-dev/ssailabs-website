import { beforeEach, describe, expect, it } from 'bun:test';
import { clearViews, readView, viewCacheSize, warmView, writeView } from './view-cache';

describe('screen copies (stale-while-revalidate)', () => {
  beforeEach(clearViews);
  it('returns the last copy, per key', () => {
    writeView('feed:u1:students', [1, 2]);
    expect(readView<number[]>('feed:u1:students')).toEqual([1, 2]);
    expect(readView('feed:u2:students')).toBeUndefined();
  });
  it('is bounded: the least recently used copy goes first', () => {
    for (let i = 0; i < 40; i++) writeView(`k${i}`, i);
    readView('k0');                 // k0 is now the most recent
    writeView('k40', 40);           // one too many
    expect(viewCacheSize()).toBe(40);
    expect(readView<number>('k0')).toBe(0);
    expect(readView('k1')).toBeUndefined();
  });
  it('warming shares one request between callers and keeps the answer', async () => {
    let calls = 0;
    const load = async () => { calls++; return 'page'; };
    await Promise.all([warmView('w', load), warmView('w', load)]);
    expect(calls).toBe(1);
    expect(readView<string>('w')).toBe('page');
  });
  it('sign-out empties it', () => {
    writeView('a', 1);
    clearViews();
    expect(readView('a')).toBeUndefined();
  });
});
