import { describe, expect, it } from 'bun:test';
import {
  ownPresenceTarget,
  presenceTargetKey,
  presenceTopic,
  PRESENCE_STALE_AFTER_MS,
  statusFromObservations,
} from './presence-state';

describe('authenticated account presence', () => {
  it('uses separate account-owned topics for the Admin and each Student', () => {
    expect(presenceTopic(ownPresenceTarget('student-1', false))).toBe('tp:presence:student:student-1');
    expect(presenceTopic(ownPresenceTarget('admin-1', true))).toBe('tp:presence:admin');
    expect(presenceTargetKey({ kind: 'student', userId: 'student-1' })).toBe('student-1');
    expect(presenceTargetKey({ kind: 'admin' })).toBe('admin');
  });

  it('keeps the state unknown until an authenticated Presence sync succeeds', () => {
    const now = 1_800_000_000_000;
    expect(statusFromObservations([{ heartbeatAt: new Date(now).toISOString(), seenAt: now, live: true }], false, now)).toBe('unknown');
  });

  it('stays online while any device has a fresh heartbeat', () => {
    const now = 1_800_000_000_000;
    expect(statusFromObservations([
      { heartbeatAt: new Date(now).toISOString(), seenAt: now - PRESENCE_STALE_AFTER_MS - 1, live: true },
      { heartbeatAt: new Date(now).toISOString(), seenAt: now - 5_000, live: true },
    ], true, now)).toBe('online');
  });

  it('reports offline after all device heartbeats expire or disconnect', () => {
    const now = 1_800_000_000_000;
    expect(statusFromObservations([
      { heartbeatAt: new Date(now).toISOString(), seenAt: now - PRESENCE_STALE_AFTER_MS - 1, live: true },
    ], true, now)).toBe('offline');
    expect(statusFromObservations([], true, now)).toBe('offline');
  });

  it('does not accept missing or invalid heartbeats as online', () => {
    const now = 1_800_000_000_000;
    expect(statusFromObservations([
      { heartbeatAt: 'not-a-time', seenAt: now, live: true },
      { seenAt: now, live: true },
    ], true, now)).toBe('offline');
  });

  it('measures a live heartbeat by when it arrived, whatever the sender\'s clock says', () => {
    const now = 1_800_000_000_000;
    for (const skew of [-10 * 60_000, -120_000, -6_000, 6_000, 120_000, 10 * 60_000]) {
      const heartbeatAt = new Date(now - 10_000 + skew).toISOString();
      expect(statusFromObservations([{ heartbeatAt, seenAt: now - 10_000, live: true }], true, now)).toBe('online');
      expect(statusFromObservations([{ heartbeatAt, seenAt: now - PRESENCE_STALE_AFTER_MS - 1, live: true }], true, now)).toBe('offline');
    }
  });

  it('lets a snapshot stamp make a heartbeat older, never newer than when it was first seen', () => {
    const now = 1_800_000_000_000;
    // An old heartbeat already on the server when this device joined: offline.
    expect(statusFromObservations([{ heartbeatAt: new Date(now - PRESENCE_STALE_AFTER_MS - 1_000).toISOString(), seenAt: now, live: false }], true, now)).toBe('offline');
    // A recent one: online.
    expect(statusFromObservations([{ heartbeatAt: new Date(now - 10_000).toISOString(), seenAt: now, live: false }], true, now)).toBe('online');
    // A future-dated one (sender's clock ahead) counts from first sight and still expires.
    const ahead = new Date(now + 60 * 60_000).toISOString();
    expect(statusFromObservations([{ heartbeatAt: ahead, seenAt: now - 10_000, live: false }], true, now)).toBe('online');
    expect(statusFromObservations([{ heartbeatAt: ahead, seenAt: now - PRESENCE_STALE_AFTER_MS - 1, live: false }], true, now)).toBe('offline');
  });
});
