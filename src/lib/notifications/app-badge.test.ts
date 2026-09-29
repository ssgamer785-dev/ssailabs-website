import { afterEach, describe, expect, it } from 'bun:test';
import { appBadgeSupported, setAppBadge } from './app-badge';

const saved = globalThis as Record<string, unknown>;
const original = saved.navigator;
afterEach(() => { saved.navigator = original; });

function install(api: Record<string, unknown>) {
  const calls: string[] = [];
  saved.navigator = {
    ...(api.setAppBadge ? { setAppBadge: async (n?: number) => { calls.push(`set ${n}`); if (api.reject) throw new Error('no permission'); } } : {}),
    ...(api.clearAppBadge ? { clearAppBadge: async () => { calls.push('clear'); } } : {}),
  };
  return calls;
}

describe('app icon badge', () => {
  it('shows the unread number, and clears at zero', () => {
    const calls = install({ setAppBadge: true, clearAppBadge: true });
    setAppBadge(3); setAppBadge(0);
    expect(calls).toEqual(['set 3', 'clear']);
  });
  it('clears with setAppBadge(0) where there is no clearAppBadge', () => {
    const calls = install({ setAppBadge: true });
    setAppBadge(0);
    expect(calls).toEqual(['set 0']);
  });
  it('does nothing, and does not throw, where the Badging API is missing', () => {
    saved.navigator = {};
    expect(appBadgeSupported()).toBe(false);
    expect(() => setAppBadge(4)).not.toThrow();
  });
  it('shows whole numbers only, never negatives or junk', () => {
    const calls = install({ setAppBadge: true, clearAppBadge: true });
    setAppBadge(2.9); setAppBadge(-4); setAppBadge(NaN);
    expect(calls).toEqual(['set 2', 'clear', 'clear']);
  });
  it('swallows a refusal (no notification permission on iPhone)', async () => {
    install({ setAppBadge: true, reject: true });
    expect(() => setAppBadge(1)).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 5));
  });
});
