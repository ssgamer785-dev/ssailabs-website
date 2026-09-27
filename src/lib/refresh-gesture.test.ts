import { describe, expect, it } from 'bun:test';
import { accumulateWheelPull, resistedPullDistance, REFRESH_PULL_THRESHOLD } from './refresh-gesture';

describe('wheel refresh gesture', () => {
  it('reaches the refresh threshold from raw wheel movement', () => {
    let raw = 0;
    for (const delta of [-100, -100]) raw = accumulateWheelPull(raw, delta);
    expect(resistedPullDistance(raw)).toBeGreaterThanOrEqual(REFRESH_PULL_THRESHOLD);
  });

  it('ignores downward movement and never compounds the eased display height', () => {
    expect(accumulateWheelPull(40, 100)).toBe(40);
    expect(resistedPullDistance(accumulateWheelPull(60, -100)))
      .toBeGreaterThan(resistedPullDistance(60));
  });
});
