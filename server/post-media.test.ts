import { describe, expect, test } from 'bun:test';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isAllowedAttachment, postObjectKey } from './post-media';

/**
 * Regression cover for the post-media traversal hole.
 *
 * GET /api/posts/media-url used to accept any key beginning "posts/" and hand
 * it straight to the signer. Because the SDK resolves ".." out of the path
 * before signing, that was enough to obtain a correctly signed URL for private
 * chat media through an endpoint that never checks conversation membership.
 */

const UPLOADER = '3f1d9c22-8a4e-4a7b-9f30-1c5e6d2b7a04';
const CONVERSATION = 'a41c9f65-2b7d-4e18-9c03-5d8f7e6a1b29';

test('community voice accepts browser recording MIME types', () => {
  expect(isAllowedAttachment('voice', 'audio/webm;codecs=opus')).toBe(true);
  expect(isAllowedAttachment('voice', 'audio/mp4')).toBe(true);
  expect(isAllowedAttachment('voice', 'application/octet-stream')).toBe(false);
});

describe('postObjectKey: legitimate keys still work', () => {
  test('a key in the shape the uploader mints is accepted unchanged', () => {
    const key = `posts/${UPLOADER}/1789553884039-c18af646-c080-4a08-a254-b873b71aafba.bin`;
    expect(postObjectKey(key)).toBe(key);
  });

  test('the video poster companion key is accepted', () => {
    const key = `posts/${UPLOADER}/1789553884039-c18af646-c080-4a08-a254-b873b71aafba-poster.jpg`;
    expect(postObjectKey(key)).toBe(key);
  });

  test('a pdf key is accepted', () => {
    const key = `posts/${UPLOADER}/1700000000000-${CONVERSATION}.pdf`;
    expect(postObjectKey(key)).toBe(key);
  });

  test('surrounding whitespace is trimmed rather than rejected', () => {
    const key = `posts/${UPLOADER}/1700000000000-x.bin`;
    expect(postObjectKey(`  ${key}  `)).toBe(key);
  });

  test('deeper but still-internal paths are allowed', () => {
    const key = 'posts/2026/09/16/a-b-c.bin';
    expect(postObjectKey(key)).toBe(key);
  });
});

describe('postObjectKey: traversal out of the posts namespace', () => {
  test('the reported attack — posts/../chat/<id>/<file> — is rejected', () => {
    expect(postObjectKey(`posts/../chat/${CONVERSATION}/private.jpg`)).toBeNull();
  });

  test('every other traversal variant is rejected', () => {
    const attempts = [
      `posts/./../chat/${CONVERSATION}/private.jpg`,
      `posts/../../chat/${CONVERSATION}/private.jpg`,
      `posts/a/../../chat/${CONVERSATION}/voice.webm`,
      `posts/..`,
      `posts/../`,
      '../chat/x.jpg',
      './posts/x.bin',
      `posts/${UPLOADER}/../../chat/${CONVERSATION}/x.jpg`,
    ];
    for (const key of attempts) {
      expect(postObjectKey(key)).toBeNull();
    }
  });

  test('percent-encoded traversal is rejected', () => {
    const attempts = [
      `posts/%2e%2e/chat/${CONVERSATION}/private.jpg`,
      `posts/%2E%2E%2Fchat/${CONVERSATION}/private.jpg`,
      `posts/..%2Fchat/${CONVERSATION}/private.jpg`,
      `posts/%2f..%2fchat/${CONVERSATION}/private.jpg`,
    ];
    for (const key of attempts) {
      expect(postObjectKey(key)).toBeNull();
    }
  });

  test('absolute paths, backslashes, schemes and control characters are rejected', () => {
    const attempts = [
      '/posts/x.bin',
      '/chat/x.jpg',
      'posts\\..\\chat\\x.jpg',
      `https://evil.example/posts/${UPLOADER}/x.bin`,
      's3://bucket/posts/x.bin',
      'posts/\u0000/x.bin',
      'posts/a\nb/x.bin',
    ];
    for (const key of attempts) {
      expect(postObjectKey(key)).toBeNull();
    }
  });

  test('empty and doubled separators are rejected', () => {
    for (const key of ['', '   ', 'posts/', 'posts//x.bin', 'posts/a//b.bin']) {
      expect(postObjectKey(key)).toBeNull();
    }
  });

  test('keys outside the posts namespace are rejected outright', () => {
    for (const key of [`chat/${CONVERSATION}/private.jpg`, 'postsX/x.bin', 'post/x.bin', 'x.bin']) {
      expect(postObjectKey(key)).toBeNull();
    }
  });

  test('non-strings and oversized keys are rejected', () => {
    for (const key of [undefined, null, 42, {}, [], true]) {
      expect(postObjectKey(key)).toBeNull();
    }
    expect(postObjectKey(`posts/${'a'.repeat(1100)}.bin`)).toBeNull();
  });
});

describe('the signer really does resolve traversal, which is why the guard exists', () => {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test-secret-not-a-real-credential' },
  });
  /**
   * The object path the signature actually covers. R2 addresses the bucket by
   * hostname when its name is DNS-compatible and by path prefix when it is not,
   * so the prefix is stripped here and the assertions stay about the key.
   */
  const signedPath = async (key: string) => {
    const url = new URL(await getSignedUrl(s3, new GetObjectCommand({ Bucket: 'bucket', Key: key }), { expiresIn: 60 }));
    return url.pathname.replace(/^\/bucket(?=\/)/, '');
  };

  test('an unguarded traversal key would have been signed as private chat media', async () => {
    const attack = `posts/../chat/${CONVERSATION}/private.jpg`;
    const path = await signedPath(attack);

    // This is the bug in one line: the caller said "posts/...", the signature
    // covers "chat/...". Asserted so that an SDK change which stops resolving
    // the path does not quietly turn this regression test into a no-op.
    expect(path).toBe(`/chat/${CONVERSATION}/private.jpg`);
    expect(path).not.toContain('/posts/');

    // And the guard refuses it before it ever reaches the signer.
    expect(postObjectKey(attack)).toBeNull();
  });

  test('an accepted key still signs inside the posts namespace', async () => {
    const key = `posts/${UPLOADER}/1789553884039-c18af646.bin`;
    expect(postObjectKey(key)).toBe(key);
    expect(await signedPath(key)).toBe(`/${key}`);
  });

  test('no key the guard accepts can resolve outside posts/', async () => {
    const accepted = [
      `posts/${UPLOADER}/1789553884039-x.bin`,
      'posts/2026/09/16/a-b-c.bin',
      `posts/${UPLOADER}/1789553884039-x-poster.jpg`,
    ];
    for (const key of accepted) {
      const resolved = postObjectKey(key);
      expect(resolved).not.toBeNull();
      expect((await signedPath(resolved!)).startsWith('/posts/')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The 'file' attachment kind.
//
// Added so an admin can post a spreadsheet or a document alongside images,
// video and PDFs. It is the one kind whose NAME suggests "anything at all",
// which is exactly why its allowlist is worth pinning down in a test.
// ---------------------------------------------------------------------------

describe('isAllowedAttachment: the document kind', () => {
  const allowed = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/zip',
    'text/plain',
    'text/csv',
  ];

  for (const mime of allowed) {
    test(`accepts ${mime}`, () => {
      expect(isAllowedAttachment('file', mime)).toBe(true);
    });
  }

  const refused: [string, string][] = [
    // The important one: what a browser reports for anything it cannot name,
    // which is every unusual extension including the executable ones.
    ['the browser fallback type', 'application/octet-stream'],
    ['a windows executable', 'application/x-msdownload'],
    ['a shell script', 'application/x-sh'],
    ['an html page', 'text/html'],
    ['javascript', 'text/javascript'],
    ['an svg, which can carry script', 'image/svg+xml'],
    ['an empty type', ''],
    // Anchoring: the pattern must not match a type that merely CONTAINS an
    // allowed one.
    ['a type with an allowed one embedded', 'application/zip-evil'],
    ['a type with an allowed one as a suffix', 'x-application/zip'],
  ];

  for (const [name, mime] of refused) {
    test(`refuses ${name} (${mime || 'empty'})`, () => {
      expect(isAllowedAttachment('file', mime)).toBe(false);
    });
  }
});

describe('isAllowedAttachment: the kinds are not interchangeable', () => {
  test('a PDF is not accepted as an image', () => {
    expect(isAllowedAttachment('image', 'application/pdf')).toBe(false);
  });
  test('a video is not accepted as a document', () => {
    expect(isAllowedAttachment('file', 'video/mp4')).toBe(false);
  });
  test('an unknown kind is refused whatever the type', () => {
    expect(isAllowedAttachment('poll', 'text/plain')).toBe(false);
    expect(isAllowedAttachment('avatar', 'image/png')).toBe(false);
  });
  test('a non-string kind or type is refused', () => {
    expect(isAllowedAttachment(null, 'text/plain')).toBe(false);
    expect(isAllowedAttachment('file', null)).toBe(false);
  });
  test('a PDF is still accepted as a pdf, and an image as an image', () => {
    expect(isAllowedAttachment('pdf', 'application/pdf')).toBe(true);
    expect(isAllowedAttachment('image', 'image/png')).toBe(true);
    expect(isAllowedAttachment('video', 'video/mp4')).toBe(true);
  });
});
