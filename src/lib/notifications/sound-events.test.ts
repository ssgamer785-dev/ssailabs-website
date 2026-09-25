import { describe, expect, it } from 'bun:test';
import { foregroundNotificationSoundId, incomingStudentPostSoundId } from './sound-events';

describe('foreground notification sound routing', () => {
  it('sounds only new unread notifications while the app is visible', () => {
    expect(foregroundNotificationSoundId({ id: 'n1', read_at: null }, true)).toBe('n1');
    expect(foregroundNotificationSoundId({ id: 'n2', read_at: null }, false)).toBeNull();
    expect(foregroundNotificationSoundId({ id: 'n3', read_at: '2026-09-25T00:00:00Z' }, true)).toBeNull();
  });

  it('sounds incoming Students Community posts for either role but not self or Official posts', () => {
    const post = { id: 'p1', author_id: 'other-user', channel: 'students' };
    expect(incomingStudentPostSoundId(post, 'admin-id', true)).toBe('student-post:p1');
    expect(incomingStudentPostSoundId(post, 'student-id', true)).toBe('student-post:p1');
    expect(incomingStudentPostSoundId({ ...post, author_id: 'student-id' }, 'student-id', true)).toBeNull();
    expect(incomingStudentPostSoundId({ ...post, channel: 'official' }, 'admin-id', true)).toBeNull();
    expect(incomingStudentPostSoundId(post, 'admin-id', false)).toBeNull();
  });
});
