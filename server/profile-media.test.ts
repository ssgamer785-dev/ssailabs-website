import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { avatarObjectKey } from './profile-media';

/**
 * The avatar endpoints hand a caller-supplied key to the S3 signer, so the
 * same traversal hole that post-media had is available here unless the key is
 * validated the same way. These are the cases that matter, and the last block
 * proves the danger is real rather than theoretical by signing the payload and
 * reading the path back off the URL.
 */

const OWNER = '3f1d9c22-8a4e-4a7b-9f30-1c5e6d2b7a04';
const CONVERSATION = 'a41c9f65-2b7d-4e18-9c03-5d8f7e6a1b29';

describe('avatarObjectKey: keys we mint are accepted', () => {
  test('the shape the upload endpoint generates', () => {
    const key = `avatars/${OWNER}/1789553884039-c18af646-c080-4a08-a254-b873b71aafba.bin`;
    expect(avatarObjectKey(key)).toBe(key);
  });

  test('surrounding whitespace is trimmed rather than rejected', () => {
    const key = `avatars/${OWNER}/1700000000000-x.bin`;
    expect(avatarObjectKey(`  ${key}  `)).toBe(key);
  });
});

describe('avatarObjectKey: everything that could escape the namespace', () => {
  const refused: [string, unknown][] = [
    ['traversal out of avatars/ into private chat media', `avatars/../chat/${CONVERSATION}/voice.webm`],
    ['traversal with a deeper prefix', `avatars/${OWNER}/../../chat/${CONVERSATION}/a.bin`],
    ['a bare relative escape', '../chat/x.bin'],
    ['percent-encoded traversal', 'avatars/%2e%2e/chat/x.bin'],
    ['any percent sign at all', `avatars/${OWNER}/a%20b.bin`],
    ['an absolute path', `/avatars/${OWNER}/a.bin`],
    ['a windows separator', `avatars\\${OWNER}\\a.bin`],
    ['a URI scheme', 'https://example.test/avatars/a.bin'],
    ['a different namespace entirely', `posts/${OWNER}/a.bin`],
    ['the chat namespace', `chat/${CONVERSATION}/voice.webm`],
    ['the prefix with nothing after it', 'avatars/'],
    ['a prefix that only looks right', 'avatarsX/a.bin'],
    ['an empty segment', `avatars//${OWNER}.bin`],
    ['a current-directory segment', `avatars/./${OWNER}.bin`],
    ['a NUL byte', `avatars/${OWNER}/a\u0000.bin`],
    ['a newline', `avatars/${OWNER}/a\nb.bin`],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['an object', { key: `avatars/${OWNER}/a.bin` }],
    ['an over-long key', `avatars/${'a'.repeat(1100)}.bin`],
  ];

  for (const [name, value] of refused) {
    test(`refuses ${name}`, () => {
      expect(avatarObjectKey(value)).toBeNull();
    });
  }
});

describe('why the check has to run before signing', () => {
  /**
   * A test of the assumption the validator rests on, not of the validator.
   *
   * The interesting detail is WHERE the traversal resolves. The signed URL
   * string still contains the literal "avatars/.." — so an eyeball, or a
   * substring check on the raw string, sees a key inside the avatars
   * namespace. It is URL PARSING that collapses it: RFC 3986
   * remove_dot_segments runs in every browser, fetch and curl before the
   * request goes out, and what reaches R2 is a path with no "avatars/" in it
   * at all.
   *
   * That is why a prefix check on the raw string would not be enough, and why
   * this has to be refused before the key is ever handed to the signer.
   */
  test('a traversing key is signed verbatim, then resolves away on parse', async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test-secret-not-a-real-credential' },
    });

    const hostile = `avatars/../chat/${CONVERSATION}/voice.webm`;
    const signed = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: 'tp', Key: hostile }),
      { expiresIn: 60 },
    );

    // As a string, it still looks like it is inside avatars/ — which is
    // exactly what makes the naive check look like it works.
    expect(signed).toContain('avatars/..');

    // Parsed the way any HTTP client parses it, it is not.
    const path = new URL(signed).pathname;
    expect(path).toBe(`/tp/chat/${CONVERSATION}/voice.webm`);
    expect(path).not.toContain('avatars');

    // The validator is what stops that key ever reaching the signer.
    expect(avatarObjectKey(hostile)).toBeNull();
  });
});
