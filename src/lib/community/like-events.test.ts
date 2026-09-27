import { describe, expect, it } from 'bun:test';
import { likeCountDelta } from './like-events';

describe('like count from realtime events', () => {
  it('ignores the echo of your own like or unlike (already counted by the tap)', () => {
    expect(likeCountDelta('INSERT', { user_id: 'me' }, 'me')).toBe(0);
    expect(likeCountDelta('DELETE', { user_id: 'me' }, 'me')).toBe(0);
  });
  it("moves the count for other people's likes", () => {
    expect(likeCountDelta('INSERT', { user_id: 'bob' }, 'me')).toBe(1);
    expect(likeCountDelta('DELETE', { user_id: 'bob' }, 'me')).toBe(-1);
    expect(likeCountDelta('UPDATE', { user_id: 'bob' }, 'me')).toBe(0);
    expect(likeCountDelta('INSERT', null, 'me')).toBe(0);
  });
});
