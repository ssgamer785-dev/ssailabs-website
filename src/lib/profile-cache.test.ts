import { describe, expect, it } from 'bun:test';
import { clearCachedProfile, readCachedProfile, writeCachedProfile, type StorageLike } from './profile-cache';

function memoryStore(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } };
}

const alice = { id: 'u-alice', full_name: 'Alice', role: 'student', activated_at: '2026-09-01T00:00:00Z' };

describe('cached profile', () => {
  it('returns the saved profile for the same member only', () => {
    const local = memoryStore(), session = memoryStore();
    writeCachedProfile(alice, true, 1000, { write: local, all: [local, session] });
    expect(readCachedProfile<typeof alice>('u-alice', 2000, [local, session])).toEqual(alice);
    expect(readCachedProfile('u-bob', 2000, [local, session])).toBeNull();
  });

  it('follows the "remember me" choice and never leaves a copy in the other storage', () => {
    const local = memoryStore(), session = memoryStore();
    writeCachedProfile(alice, true, 1000, { write: local, all: [local, session] });
    writeCachedProfile(alice, false, 1000, { write: session, all: [local, session] });
    expect(local.data.size).toBe(0);
    expect(session.data.size).toBe(1);
  });

  it('ignores an entry older than 30 days, and a corrupt one', () => {
    const local = memoryStore();
    writeCachedProfile(alice, true, 0, { write: local, all: [local] });
    expect(readCachedProfile('u-alice', 31 * 24 * 3600 * 1000, [local])).toBeNull();
    local.setItem('tp:profile:v1', '{not json');
    expect(readCachedProfile('u-alice', 1, [local])).toBeNull();
  });

  it('refuses an entry whose profile belongs to someone else', () => {
    const local = memoryStore();
    local.setItem('tp:profile:v1', JSON.stringify({ userId: 'u-alice', savedAt: 1, profile: { ...alice, id: 'u-bob' } }));
    expect(readCachedProfile('u-alice', 2, [local])).toBeNull();
  });

  it('is removed from every storage on sign-out', () => {
    const local = memoryStore(), session = memoryStore();
    local.setItem('tp:profile:v1', 'x'); session.setItem('tp:profile:v1', 'y');
    clearCachedProfile([local, session]);
    expect(local.data.size + session.data.size).toBe(0);
  });
});
