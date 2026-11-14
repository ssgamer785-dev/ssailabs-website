import { describe, expect, test } from 'bun:test';
import { normalizeIndianMobile, validateIndianMobile } from './profile-phone';

describe('Indian mobile numbers', () => {
  test('normalizes local, trunk-prefix and country-code forms', () => {
    expect(normalizeIndianMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('09876543210')).toBe('+919876543210');
    expect(normalizeIndianMobile('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeIndianMobile('919876543210')).toBe('+919876543210');
  });

  test('allows an empty optional field and rejects invalid Indian numbers', () => {
    expect(normalizeIndianMobile('')).toBe('');
    expect(validateIndianMobile('')).toBeNull();
    expect(normalizeIndianMobile('1234567890')).toBeNull();
    expect(normalizeIndianMobile('+1 415 555 2671')).toBeNull();
  });
});
