import { describe, expect, it } from 'bun:test';
import { foregroundNotificationSoundId } from './sound-events';

describe('foreground notification sound routing', () => {
  it('sounds only new unread notifications while the app is visible', () => {
    expect(foregroundNotificationSoundId({ id: 'n1', read_at: null }, true)).toBe('n1');
    expect(foregroundNotificationSoundId({ id: 'n2', read_at: null }, false)).toBeNull();
    expect(foregroundNotificationSoundId({ id: 'n3', read_at: '2026-09-25T00:00:00Z' }, true)).toBeNull();
    expect(foregroundNotificationSoundId({ id: null, read_at: null }, true)).toBeNull();
  });
});
