/** Account presence is carried on that account's private Realtime topic. */
export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_STALE_AFTER_MS = 90_000;

export type PresenceStatus = 'unknown' | 'online' | 'offline';
export type PresenceTarget = { kind: 'admin' } | { kind: 'student'; userId: string };

export interface PresenceHeartbeat {
  heartbeatAt?: unknown;
}

/**
 * Topic identity is authoritative. A tracked payload never names the account,
 * so a client cannot make another account appear online by putting its id in
 * the payload. RLS separately restricts writes to the matching account topic.
 */
export function presenceTopic(target: PresenceTarget): string {
  return target.kind === 'admin'
    ? 'tp:presence:admin'
    : `tp:presence:student:${target.userId}`;
}

export function presenceTargetKey(target: PresenceTarget): string {
  return target.kind === 'admin' ? 'admin' : target.userId;
}

export function ownPresenceTarget(userId: string, isAdmin: boolean): PresenceTarget {
  return isAdmin ? { kind: 'admin' } : { kind: 'student', userId };
}

export function statusFromPresence(
  payloads: readonly PresenceHeartbeat[],
  synchronized: boolean,
  now = Date.now(),
): PresenceStatus {
  if (!synchronized) return 'unknown';
  return payloads.some(payload => {
    if (typeof payload.heartbeatAt !== 'string') return false;
    const heartbeat = Date.parse(payload.heartbeatAt);
    return Number.isFinite(heartbeat)
      && heartbeat <= now + 5_000
      && now - heartbeat <= PRESENCE_STALE_AFTER_MS;
  }) ? 'online' : 'offline';
}
