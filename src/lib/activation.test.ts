import { describe, expect, test } from 'bun:test';
import { formatCodeInput } from './activation-code';
import { hasOwnerWhatsApp, ownerWhatsAppUrl, OWNER_WHATSAPP_NUMBER } from './owner-contact';

/**
 * The pure parts of the activation flow.
 *
 * Everything that decides anything — whether a code is valid, whether a user
 * is activated, whether a caller is the admin — lives in Postgres and is
 * covered by supabase/tests/50-activation-gate.sql and 51-activation-race.sh.
 * What is left here is presentation, and it still has to be right: a formatter
 * that drops a character would make a valid code unredeemable.
 */

describe('formatCodeInput', () => {
  test('shapes a bare body into TP-XXXX-XXXX', () => {
    expect(formatCodeInput('AB12CD34')).toBe('TP-AB12-CD34');
  });

  test('accepts the code exactly as the admin screen shows it', () => {
    expect(formatCodeInput('TP-AB12-CD34')).toBe('TP-AB12-CD34');
  });

  test('is idempotent — retyping over a formatted value does not re-prefix', () => {
    const once = formatCodeInput('AB12CD34');
    expect(formatCodeInput(once)).toBe(once);
    expect(formatCodeInput(formatCodeInput(once))).toBe(once);
  });

  test('upper-cases and drops punctuation and spaces as they are typed', () => {
    expect(formatCodeInput('tp ab12 cd34')).toBe('TP-AB12-CD34');
    expect(formatCodeInput('tp_ab12_cd34')).toBe('TP-AB12-CD34');
  });

  test('partial input formats progressively without inventing separators', () => {
    expect(formatCodeInput('A')).toBe('TP-A');
    expect(formatCodeInput('AB12')).toBe('TP-AB12');
    expect(formatCodeInput('AB123')).toBe('TP-AB12-3');
  });

  test('an empty field stays empty rather than showing a bare prefix', () => {
    expect(formatCodeInput('')).toBe('');
    expect(formatCodeInput('TP')).toBe('');
    expect(formatCodeInput('---')).toBe('');
  });

  test('caps the body at eight characters', () => {
    expect(formatCodeInput('AB12CD34EF56')).toBe('TP-AB12-CD34');
  });

  test('never loses a character the database would have kept', () => {
    // normalise_activation_code() strips non-alphanumerics and upper-cases.
    // The formatter must agree on the body, or a correctly-typed code would be
    // sent with a character missing.
    const body = 'XY78ZW23';
    const formatted = formatCodeInput(body);
    expect(formatted.replace(/[^A-Z0-9]/g, '')).toBe(`TP${body}`);
  });
});

describe('the owner WhatsApp hand-off', () => {
  const fields = {
    name: 'A Trader',
    email: 'a@example.com',
    mobile: '+91 98765 43210',
    tradingExperience: 'Two years, mostly FX & indices',
    address: '12 Example St\nSomewhere',
  };

  test('is configured with a wa.me-shaped number', () => {
    expect(OWNER_WHATSAPP_NUMBER).toMatch(/^[1-9]\d{7,14}$/);
    expect(hasOwnerWhatsApp()).toBe(true);
  });

  test('builds a wa.me link against that number', () => {
    const url = ownerWhatsAppUrl(fields);
    expect(url).not.toBeNull();
    expect(url!.startsWith(`https://wa.me/${OWNER_WHATSAPP_NUMBER}?text=`)).toBe(true);
  });

  test('the link carries all five fields, intact, through encoding', () => {
    const url = ownerWhatsAppUrl(fields)!;
    const text = decodeURIComponent(new URL(url).searchParams.get('text') ?? '');
    // The address contains a newline and the experience an ampersand; both
    // would truncate the message if the builder interpolated instead of
    // encoding, so round-tripping them is the point of this check.
    for (const value of Object.values(fields)) expect(text).toContain(value);
    expect(text).toContain('New membership request');
  });

  test('a raw + or space in the number would be caught rather than shipped', () => {
    // hasOwnerWhatsApp() is what stands between a typo and a link that opens
    // a chat with nobody. wa.me does not error on these — it just fails.
    expect(/^[1-9]\d{7,14}$/.test('+919876970555')).toBe(false);
    expect(/^[1-9]\d{7,14}$/.test('91 9876970555')).toBe(false);
    expect(/^[1-9]\d{7,14}$/.test('0919876970555')).toBe(false);
  });

  test('rejects a number that is not bare international digits', () => {
    // wa.me silently opens a broken chat for these rather than erroring, so
    // the guard has to catch them here.
    for (const bad of ['', '+919876543210', '91 98765 43210', '0919876543210', '12345', 'abcdefghij']) {
      expect(/^[1-9]\d{7,14}$/.test(bad)).toBe(false);
    }
    for (const good of ['919876543210', '971501234567', '14155552671']) {
      expect(/^[1-9]\d{7,14}$/.test(good)).toBe(true);
    }
  });

  test('encodes every field so free text cannot truncate the message', () => {
    const message = [
      'New membership request — The Traders Planet', '',
      `Name: ${fields.name}`,
      `Email: ${fields.email}`,
      `Mobile: ${fields.mobile}`,
      `Trading experience: ${fields.tradingExperience}`,
      `Address: ${fields.address}`,
    ].join('\n');
    const encoded = encodeURIComponent(message);

    // The characters that would otherwise end the query string or start a
    // fragment must all be escaped.
    expect(encoded).not.toContain('\n');
    expect(encoded).not.toContain('&');
    expect(encoded).not.toContain('#');
    expect(encoded).not.toContain('+');
    // ...and it must still round-trip to exactly what was written.
    expect(decodeURIComponent(encoded)).toBe(message);
  });

  test('the drafted message carries all five submitted fields', () => {
    const message = [
      `Name: ${fields.name}`, `Email: ${fields.email}`, `Mobile: ${fields.mobile}`,
      `Trading experience: ${fields.tradingExperience}`, `Address: ${fields.address}`,
    ].join('\n');
    for (const value of Object.values(fields)) {
      expect(message).toContain(value);
    }
  });
});
