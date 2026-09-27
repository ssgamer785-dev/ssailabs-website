import { describe, expect, test } from 'bun:test';
import { formatDateTime } from './format-date-time';

describe('formatDateTime', () => {
  test('formats a stored timestamp with date and local time', () => {
    const result = formatDateTime(new Date(2026, 8, 25, 16, 30).toISOString());
    expect(result).toBe('25 Sep 2026, 4:30 PM');
  });

  test('does not replace absent or invalid timestamps with the current time', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime('not-a-date')).toBe('');
  });
});
