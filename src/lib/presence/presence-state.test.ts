import { describe, expect, it } from 'bun:test';
import {
  ownPresenceTarget,
  presenceTargetKey,
  presenceTopic,
  PRESENCE_STALE_AFTER_MS,
  statusFromPresence,
} from './presence-state';

describe('authenticated account presence', () => {
  it('uses separate account-owned topics for the Admin and each Student', () => {
    expect(presenceTopic(ownPresenceTarget('student-1', false))).toBe('tp:presence:student:student-1');
    expect(presenceTopic(ownPresenceTarget('admin-1', true))).toBe('tp:presence:admin');
    expect(presenceTargetKey({ kind: 'student', userId: 'student-1' })).toBe('student-1');
    expect(presenceTargetKey({ kind: 'admin' })).toBe('admin');
  });

  it('keeps the state unknown until an authenticated Presence sync succeeds', () => {
    expect(statusFromPresence([{ heartbeatAt: new Date().toISOString() }], false)).toBe('unknown');
  });

  it('stays online while any device has a fresh heartbeat', () => {
    const now = 1_800_000_000_000;
    expect(statusFromPresence([
      { heartbeatAt: new Date(now - PRESENCE_STALE_AFTER_MS - 1).toISOString() },
      { heartbeatAt: new Date(now - 5_000).toISOString() },
    ], true, now)).toBe('online');
  });

  it('reports offline after all device heartbeats expire or disconnect', () => {
    const now = 1_800_000_000_000;
    expect(statusFromPresence([
      { heartbeatAt: new Date(now - PRESENCE_STALE_AFTER_MS - 1).toISOString() },
    ], true, now)).toBe('offline');
    expect(statusFromPresence([], true, now)).toBe('offline');
  });

  it('does not accept missing, invalid, or future-dated heartbeats as online', () => {
    const now = 1_800_000_000_000;
    expect(statusFromPresence([{ heartbeatAt: 'not-a-time' }, {}, {
      heartbeatAt: new Date(now + 60_000).toISOString(),
    }], true, now)).toBe('offline');
  });
});
