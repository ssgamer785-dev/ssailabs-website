import { describe, expect, it } from 'bun:test';
import { batchTooLarge, CHAT_MEDIA_QUOTA_BYTES } from './limits';
import { MEDIA_QUOTA_BYTES } from '../../../server/chat-media';

const MB = 1024 * 1024;

describe('chat batch size', () => {
  it('is the same allowance the server enforces', () => {
    expect(CHAT_MEDIA_QUOTA_BYTES).toBe(MEDIA_QUOTA_BYTES);
  });
  it('twelve phone photos, or thirty, go as they are', () => {
    expect(batchTooLarge(Array(12).fill(3 * MB))).toBeNull();
    expect(batchTooLarge(Array(30).fill(3 * MB))).toBeNull();
  });
  it('a batch bigger than the whole allowance is stopped before anything is sent, saying why', () => {
    const problem = batchTooLarge([45 * MB, 45 * MB, 45 * MB]);
    expect(problem).toContain('3 files come to 135 MB');
    expect(problem).toContain('100 MB');
  });
});
