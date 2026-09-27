import { describe, expect, test } from 'bun:test';
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH, validateFullName } from './profile-name';

/**
 * Name validation is the one piece of the profile editor that decides
 * anything on the client, so it is the piece worth pinning down. Everything
 * else on that screen is authorized by RLS or by the server deriving the
 * object key from the caller's token.
 *
 * Imported from profile-name.ts rather than profile-api.ts because the latter
 * imports the Supabase client, which throws on import without the environment
 * variables set — the same reason activation-code.ts exists next to
 * activation.ts.
 */

describe('validateFullName: accepts real names', () => {
  const ok = [
    'Al',                       // exactly the minimum
    'Alice Sharma',
    "Siobhán O'Connor",
    'Jean-Luc Picard',
    'Ravi  Kumar',              // internal double space is the person's business
    'Ng',                       // two letters is a real name
    '李小龍',
    'a'.repeat(MAX_NAME_LENGTH),
  ];
  for (const name of ok) {
    test(JSON.stringify(name), () => {
      expect(validateFullName(name)).toBeNull();
    });
  }
});

describe('validateFullName: refuses what would render wrong', () => {
  test('empty', () => {
    expect(validateFullName('')).toBe('Please enter your name.');
  });

  test('whitespace only — measured after trimming, so it is empty', () => {
    expect(validateFullName('    ')).toBe('Please enter your name.');
    expect(validateFullName('\t\n ')).not.toBeNull();
  });

  test('one character, below the minimum', () => {
    expect(validateFullName('A')).toBe('Please enter your name.');
    expect(MIN_NAME_LENGTH).toBe(2);
  });

  test('a padded short name is still short — the padding is trimmed first', () => {
    expect(validateFullName('   A   ')).toBe('Please enter your name.');
  });

  test('over the maximum', () => {
    expect(validateFullName('a'.repeat(MAX_NAME_LENGTH + 1)))
      .toBe(`Names can be at most ${MAX_NAME_LENGTH} characters.`);
  });

  test('a long name padded to over the limit still passes, because padding is not part of it', () => {
    expect(validateFullName(`  ${'a'.repeat(MAX_NAME_LENGTH)}  `)).toBeNull();
  });

  test('a newline, which would break every single-line row it is drawn in', () => {
    expect(validateFullName('Alice\nSharma')).toBe('Names cannot contain line breaks.');
  });

  test('a carriage return', () => {
    expect(validateFullName('Alice\rSharma')).not.toBeNull();
  });

  test('a NUL byte', () => {
    expect(validateFullName('Alice\u0000')).not.toBeNull();
  });

  test('a DEL character', () => {
    expect(validateFullName('Alice\u007f')).not.toBeNull();
  });
});
