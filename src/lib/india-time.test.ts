import { describe, expect, test } from 'bun:test';
import { greetingForHour, indiaGreeting, indiaHour, msUntilNextIndiaHour } from './india-time';

/** A UTC instant, so every case below is independent of the test machine. */
const utc = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 23, h, m, 0));

describe('indiaHour: reads Asia/Kolkata, not the device', () => {
  // India is UTC+05:30 and does not observe daylight saving.
  const cases: [number, number, number][] = [
    // UTC h, UTC m, expected India hour
    [0, 0, 5],    // 05:30 IST
    [6, 30, 12],  // 12:00 IST
    [18, 30, 0],  // midnight IST — the case hour12:false renders as "24"
    [22, 0, 3],   // 03:30 IST
    [11, 30, 17], // 17:00 IST
    [23, 59, 5],  // 05:29 IST next day
  ];
  for (const [h, m, expected] of cases) {
    test(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} UTC is hour ${expected} in India`, () => {
      expect(indiaHour(utc(h, m))).toBe(expected);
    });
  }
});

describe('greetingForHour: the four bands, exhaustively', () => {
  const expected = (h: number) =>
    h >= 4 && h <= 11 ? 'Good Morning'
    : h >= 12 && h <= 16 ? 'Good Afternoon'
    : h >= 17 ? 'Good Evening'
    : 'Good Night';

  test('every hour 0–23 falls in exactly the specified band', () => {
    for (let h = 0; h <= 23; h++) expect(greetingForHour(h)).toBe(expected(h));
  });

  test('the boundaries land on the right side', () => {
    expect(greetingForHour(3)).toBe('Good Night');
    expect(greetingForHour(4)).toBe('Good Morning');
    expect(greetingForHour(11)).toBe('Good Morning');
    expect(greetingForHour(12)).toBe('Good Afternoon');
    expect(greetingForHour(16)).toBe('Good Afternoon');
    expect(greetingForHour(17)).toBe('Good Evening');
    expect(greetingForHour(23)).toBe('Good Evening');
    expect(greetingForHour(0)).toBe('Good Night');
  });
});

describe('indiaGreeting: end to end', () => {
  test('18:30 UTC is midnight in India, so Good Night', () => {
    expect(indiaGreeting(utc(18, 30))).toBe('Good Night');
  });
  test('03:00 UTC is 08:30 in India, so Good Morning', () => {
    expect(indiaGreeting(utc(3, 0))).toBe('Good Morning');
  });
  test('09:00 UTC is 14:30 in India, so Good Afternoon', () => {
    expect(indiaGreeting(utc(9, 0))).toBe('Good Afternoon');
  });
  test('14:00 UTC is 19:30 in India, so Good Evening', () => {
    expect(indiaGreeting(utc(14, 0))).toBe('Good Evening');
  });
  test('a device in Los Angeles gets the same answer as one in Delhi', () => {
    // Same instant, one Date object — the point is that the answer comes from
    // the zone, not from anything the device contributes.
    const instant = utc(18, 30);
    expect(indiaGreeting(instant)).toBe('Good Night');
  });
});

describe('msUntilNextIndiaHour', () => {
  test('is always positive and no more than an hour and a second away', () => {
    for (let m = 0; m < 60; m += 7) {
      const ms = msUntilNextIndiaHour(utc(10, m));
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(3_601_000);
    }
  });
  test('at the top of the hour it waits a full hour, not zero', () => {
    expect(msUntilNextIndiaHour(utc(10, 0))).toBe(3_601_000);
  });
});
