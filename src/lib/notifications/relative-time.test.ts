import { describe, expect, it } from 'bun:test';
import { relativeTime } from './relative-time';

const NOW = new Date('2026-09-29T15:30:00').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

describe('relative timestamps', () => {
  it('says "just now" for the first minute', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now');
    expect(relativeTime(ago(44_000), NOW)).toBe('just now');
  });
  it('counts minutes, then hours', () => {
    expect(relativeTime(ago(46_000), NOW)).toBe('1m ago');
    expect(relativeTime(ago(5 * MIN), NOW)).toBe('5m ago');
    expect(relativeTime(ago(59 * MIN), NOW)).toBe('59m ago');
    expect(relativeTime(ago(60 * MIN), NOW)).toBe('1h ago');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('3h ago');
    expect(relativeTime(ago(15 * HOUR), NOW)).toBe('15h ago');
    expect(relativeTime(new Date('2026-09-28T23:50:00').toISOString(), NOW)).toBe('16h ago');
  });
  it('says Yesterday for the previous calendar day, then days, then a date', () => {
    expect(relativeTime(new Date('2026-09-28T09:00:00').toISOString(), NOW)).toBe('Yesterday');
    expect(relativeTime(ago(2 * DAY), NOW)).toBe('2d ago');
    expect(relativeTime(ago(6 * DAY), NOW)).toBe('6d ago');
    expect(relativeTime(ago(30 * DAY), NOW)).toMatch(/^Aug \d{1,2}$/);
    expect(relativeTime(new Date('2025-03-04T10:00:00').toISOString(), NOW)).toMatch(/2025$/);
  });
  it('shows a time that is slightly in the future (clock skew) as "just now", and garbage as nothing', () => {
    expect(relativeTime(new Date(NOW + 20_000).toISOString(), NOW)).toBe('just now');
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});
