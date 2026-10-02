import { describe, expect, it } from 'bun:test';
import { importWithRetry, isChunkLoadError } from './lazy-retry';

const noWait = async () => {};
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: https://app/assets/HomeScreen-abc.js');

describe('chunk load errors', () => {
  it('recognises the messages Chrome, Safari and Firefox use', () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/main.css'))).toBe(true);
  });
  it('does not mistake a real bug for a network problem', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('importing with retry', () => {
  it('succeeds once the network comes back', async () => {
    let calls = 0;
    const result = await importWithRetry(async () => { calls++; if (calls < 3) throw chunkError(); return 'screen'; }, 3, noWait, () => false);
    expect([result, calls]).toEqual(['screen', 3]);
  });
  it('gives up after the last attempt with the original error', async () => {
    let calls = 0;
    await expect(importWithRetry(async () => { calls++; throw chunkError(); }, 3, noWait, () => false)).rejects.toThrow('dynamically imported module');
    expect(calls).toBe(3);
  });
  it('gives up at once while offline, so the screen can say so', async () => {
    let calls = 0;
    await expect(importWithRetry(async () => { calls++; throw chunkError(); }, 3, noWait, () => true)).rejects.toThrow('dynamically imported module');
    expect(calls).toBe(1);
  });
  it('does not retry a real bug', async () => {
    let calls = 0;
    await expect(importWithRetry(async () => { calls++; throw new TypeError('x is not a function'); }, 3, noWait)).rejects.toThrow('x is not a function');
    expect(calls).toBe(1);
  });
});

describe('preloading a screen', () => {
  it('shares one import between preload and render, and retries after a failure', async () => {
    const { lazyWithRetry } = await import('./lazy-retry');
    let calls = 0;
    let fail = true;
    const Screen = lazyWithRetry(async () => { calls++; if (fail) throw new Error('boom'); return { default: () => null }; });
    await Screen.preload();          // a real bug: not retried, not remembered
    expect(calls).toBe(1);
    fail = false;
    await Screen.preload();
    await Screen.preload();
    expect(calls).toBe(2);           // the successful import is reused
  });
});
