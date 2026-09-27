import { describe, expect, it } from 'bun:test';
import { clearPasswordRecovery, hasPasswordRecovery, markPasswordRecovery, validateNewPassword } from './password-policy';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };

describe('one password rule', () => {
  it('needs at least 8 characters and a matching confirmation', () => {
    expect(validateNewPassword('short7x', 'short7x')).toBe('Use at least 8 characters.');
    expect(validateNewPassword('long enough', 'different!')).toBe('Passwords do not match.');
    expect(validateNewPassword('long enough', 'long enough')).toBeNull();
  });
});

describe('password recovery marker', () => {
  it('is present only after the emailed link, and for an hour', () => {
    const store = memory();
    expect(hasPasswordRecovery(store, 1_000)).toBe(false);
    markPasswordRecovery(store, 1_000);
    expect(hasPasswordRecovery(store, 1_000 + 59 * 60_000)).toBe(true);
    expect(hasPasswordRecovery(store, 1_000 + 61 * 60_000)).toBe(false);
    clearPasswordRecovery(store);
    expect(hasPasswordRecovery(store, 2_000)).toBe(false);
  });
});
