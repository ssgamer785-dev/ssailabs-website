import { describe, expect, it } from 'bun:test';
import { feedAspectRatio, sane } from './dimensions';

describe('picture sizes', () => {
  it('keeps only believable sizes', () => {
    expect(sane({ width: 1080.4, height: 1350 })).toEqual({ width: 1080, height: 1350 });
    expect(sane({ width: 0, height: 10 })).toBeNull();
    expect(sane({ width: 30000, height: 10 })).toBeNull();
    expect(sane(null)).toBeNull();
  });
  it('a feed picture keeps its shape within 4:5 and 1.91:1, and unknown is 4:3', () => {
    expect(feedAspectRatio({ width: 1600, height: 900 })).toBeCloseTo(1.778);
    expect(feedAspectRatio({ width: 1000, height: 3000 })).toBe(0.8);
    expect(feedAspectRatio({ width: 4000, height: 1000 })).toBe(1.91);
    expect(feedAspectRatio(null)).toBeCloseTo(1.333);
  });
});
