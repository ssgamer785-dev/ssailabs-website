import { describe, expect, test } from 'bun:test';
import { MEDIA_QUOTA_BYTES, conversationFromKey, objectKeysFor, validateUploadRequest } from './chat-media';

const MB = 1024 * 1024;

describe('server-side upload validation', () => {
  test('accepts an ordinary image', () => {
    const check = validateUploadRequest({ kind: 'image', mimeType: 'image/jpeg', sizeBytes: 2 * MB });
    expect(check.status).toBe('ok');
    if (check.status === 'ok') expect(check.totalBytes).toBe(2 * MB);
  });

  test('rejects a kind the app does not support', () => {
    const check = validateUploadRequest({ kind: 'executable', mimeType: 'application/x-msdownload', sizeBytes: 10 });
    expect(check.status).toBe('rejected');
    if (check.status === 'rejected') expect(check.code).toBe(400);
  });

  test('rejects a mime type that does not match the declared kind', () => {
    const check = validateUploadRequest({ kind: 'image', mimeType: 'application/x-sh', sizeBytes: 100 });
    expect(check.status).toBe('rejected');
    if (check.status === 'rejected') expect(check.error).toContain('not an allowed image type');
  });

  test('rejects a file over its per-kind ceiling', () => {
    const check = validateUploadRequest({ kind: 'video', mimeType: 'video/mp4', sizeBytes: 60 * MB });
    expect(check.status).toBe('rejected');
    if (check.status === 'rejected') expect(check.code).toBe(413);
  });

  test('rejects zero, negative and non-finite sizes', () => {
    for (const sizeBytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateUploadRequest({ kind: 'image', mimeType: 'image/png', sizeBytes }).status).toBe('rejected');
    }
  });

  test('a voice note with codec parameters is still audio', () => {
    expect(validateUploadRequest({ kind: 'voice', mimeType: 'audio/webm;codecs=opus', sizeBytes: 40000 }).status).toBe('ok');
    // Safari records mp4 instead.
    expect(validateUploadRequest({ kind: 'voice', mimeType: 'audio/mp4', sizeBytes: 40000 }).status).toBe('ok');
  });

  test('poster bytes count toward the total', () => {
    const check = validateUploadRequest({ kind: 'video', mimeType: 'video/mp4', sizeBytes: 10 * MB, posterBytes: 50000 });
    expect(check.status).toBe('ok');
    if (check.status === 'ok') {
      expect(check.wantsPoster).toBe(true);
      expect(check.totalBytes).toBe(10 * MB + 50000);
    }
  });

  test('an oversized "thumbnail" is refused', () => {
    const check = validateUploadRequest({ kind: 'video', mimeType: 'video/mp4', sizeBytes: MB, posterBytes: 8 * MB });
    expect(check.status).toBe('rejected');
    if (check.status === 'rejected') expect(check.error).toContain('thumbnail');
  });

  test('a poster is only honoured for video', () => {
    const check = validateUploadRequest({ kind: 'image', mimeType: 'image/png', sizeBytes: MB, posterBytes: 50000 });
    expect(check.status).toBe('ok');
    if (check.status === 'ok') {
      expect(check.wantsPoster).toBe(false);
      expect(check.totalBytes).toBe(MB);
    }
  });

  test('nothing at or beyond the whole allowance is ever signed', () => {
    // Today the per-kind ceiling (50 MB for video) catches this first; the
    // quota guard is the backstop that keeps it true if a ceiling is raised.
    const check = validateUploadRequest({
      kind: 'video',
      mimeType: 'video/mp4',
      sizeBytes: MEDIA_QUOTA_BYTES + 1,
    });
    expect(check.status).toBe('rejected');
    if (check.status === 'rejected') expect(check.code).toBe(413);
  });

  test('a request that exactly fills the allowance is still allowed', () => {
    const check = validateUploadRequest({ kind: 'video', mimeType: 'video/mp4', sizeBytes: 50 * MB });
    expect(check.status).toBe('ok');
  });
});

describe('purge key collection', () => {
  test('a video contributes both its object and its poster', () => {
    const keys = objectKeysFor([
      { id: '1', storage_key: 'chat/c/clip.bin', poster_key: 'chat/c/clip-poster.jpg' },
    ]);
    expect(keys).toEqual([{ Key: 'chat/c/clip.bin' }, { Key: 'chat/c/clip-poster.jpg' }]);
  });

  test('rows without a poster contribute one key', () => {
    expect(objectKeysFor([{ id: '1', storage_key: 'chat/c/photo.bin', poster_key: null }]))
      .toEqual([{ Key: 'chat/c/photo.bin' }]);
  });

  test('a row with nothing stored contributes nothing', () => {
    expect(objectKeysFor([{ id: '1', storage_key: null, poster_key: null }])).toEqual([]);
  });

  test('several rows are flattened in order, oldest first', () => {
    const keys = objectKeysFor([
      { id: '1', storage_key: 'a.bin', poster_key: null },
      { id: '2', storage_key: 'b.bin', poster_key: 'b-poster.jpg' },
    ]);
    expect(keys.map(k => k.Key)).toEqual(['a.bin', 'b.bin', 'b-poster.jpg']);
  });

  test('an empty nomination deletes nothing', () => {
    expect(objectKeysFor([])).toEqual([]);
  });
});

describe('media key authorization', () => {
  const CONV_A = 'aaaaaaaa-1111-2222-3333-444444444444';
  const CONV_B = 'bbbbbbbb-1111-2222-3333-444444444444';

  test('a key issued by this server resolves to its conversation', () => {
    expect(conversationFromKey(`chat/${CONV_A}/1755000000000-abc.bin`)).toBe(CONV_A);
  });

  test('the conversation in the key is the one authorized, not the caller\'s own', () => {
    // The route then checks membership of whatever comes back, so Student A
    // asking for Student B's key is checked against B's conversation.
    expect(conversationFromKey(`chat/${CONV_B}/1755000000000-abc.bin`)).toBe(CONV_B);
  });

  test('a poster key resolves like any other object in the conversation', () => {
    expect(conversationFromKey(`chat/${CONV_A}/1755000000000-abc-poster.jpg`)).toBe(CONV_A);
  });

  test('traversal out of the conversation prefix is refused', () => {
    expect(conversationFromKey(`chat/${CONV_A}/../${CONV_B}/secret.bin`)).toBeNull();
    expect(conversationFromKey('chat/../posts/someone/private.bin')).toBeNull();
    expect(conversationFromKey(`chat/${CONV_A}//x.bin`)).toBeNull();
  });

  test('keys from another namespace are refused', () => {
    expect(conversationFromKey('posts/22222222-2222-2222-2222-222222222222/x.bin')).toBeNull();
    expect(conversationFromKey('/chat/' + CONV_A + '/x.bin')).toBeNull();
  });

  test('a non-uuid conversation segment is refused', () => {
    expect(conversationFromKey('chat/*/x.bin')).toBeNull();
    expect(conversationFromKey('chat/all/x.bin')).toBeNull();
    expect(conversationFromKey(`chat/${CONV_A}x/x.bin`)).toBeNull();
  });

  test('malformed and empty keys are refused', () => {
    expect(conversationFromKey('')).toBeNull();
    expect(conversationFromKey('chat/')).toBeNull();
    expect(conversationFromKey(`chat/${CONV_A}`)).toBeNull();
    expect(conversationFromKey(undefined as unknown as string)).toBeNull();
  });
});
