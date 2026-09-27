export const REFRESH_PULL_THRESHOLD = 64;
export const REFRESH_MAX_PULL = 96;

export function resistedPullDistance(rawDistance: number): number {
  return REFRESH_MAX_PULL * (1 - Math.exp(-Math.max(0, rawDistance) / REFRESH_MAX_PULL));
}

/** Wheel deltas are raw gesture distance; never feed the eased UI height back in. */
export function accumulateWheelPull(rawDistance: number, deltaY: number): number {
  return rawDistance + Math.min(60, Math.max(0, -deltaY * 0.6));
}
