/** Account presence is carried on that account's private Realtime topic. */
export const PRESENCE_HEARTBEAT_MS = 30_000;
export const PRESENCE_STALE_AFTER_MS = 90_000;

export type PresenceStatus = 'unknown' | 'online' | 'offline';
export type PresenceTarget = { kind: 'admin' } | { kind: 'student'; userId: string };

export interface PresenceHeartbeat {
  heartbeatAt?: unknown;
  /** Realtime's presence ref for this tracked payload (changes on every track). */
  ref?: string;
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

/**
 * One device session on a presence topic, as this observer saw it. A tracked
 * heartbeat gets a new presence ref every time it is sent, so "first saw this
 * ref" is when this device received that heartbeat.
 */
export interface PresenceObservation {
  /** The publisher's own stamp, from the publisher's clock. */
  heartbeatAt?: unknown;
  /** This device's clock when the ref first appeared here. */
  seenAt: number;
  /**
   * true when the heartbeat arrived while this device was watching; false
   * when it was already in the snapshot the server sent on (re)joining.
   */
  live: boolean;
}

/**
 * Freshness is measured on this device's own clock, so a phone or PC whose
 * clock is minutes out neither hides a live account nor keeps a gone one. A
 * live heartbeat is as old as the time since it arrived. A snapshot entry's
 * age is unknown, so the publisher's stamp may only make it older than the
 * moment it was first seen, never newer; the next live heartbeat (every 30 s)
 * then replaces it.
 */
export function statusFromObservations(
  observations: readonly PresenceObservation[],
  synchronized: boolean,
  now = Date.now(),
): PresenceStatus {
  if (!synchronized) return 'unknown';
  return observations.some(observation => {
    if (typeof observation.heartbeatAt !== 'string') return false;
    const stamped = Date.parse(observation.heartbeatAt);
    if (!Number.isFinite(stamped)) return false;
    const heardAt = observation.live ? observation.seenAt : Math.min(observation.seenAt, stamped);
    return now - heardAt <= PRESENCE_STALE_AFTER_MS;
  }) ? 'online' : 'offline';
}
