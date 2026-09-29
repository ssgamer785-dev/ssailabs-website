import { describe, expect, test } from 'bun:test';
import { notificationDestination } from './destination';
import type { AppNotification } from './useNotifications';

const chatId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';
const commentId = '44444444-4444-4444-8444-444444444444';

function notification(fields: Partial<AppNotification>): AppNotification {
  return {
    id: '55555555-5555-4555-8555-555555555555', kind: 'chat', title: '', body: null,
    relatedPostId: null, relatedConversationId: null, relatedMessageId: null,
    relatedCommentId: null, category: 'direct_messages', link: null, actorId: null, readAt: null, createdAt: '', ...fields,
  };
}

describe('notification targets', () => {
  test('a chat notification opens its exact conversation and message', () => {
    expect(notificationDestination(notification({ relatedConversationId: chatId, relatedMessageId: messageId })))
      .toBe(`/chat/admin?c=${chatId}&m=${messageId}`);
  });
  test('a comment opens its exact post and comment', () => {
    expect(notificationDestination(notification({ kind: 'comment', relatedPostId: postId, relatedCommentId: commentId })))
      .toBe(`/post?post=${postId}&comment=${commentId}`);
  });
  test('older notifications still reach the correct thread or comments', () => {
    expect(notificationDestination(notification({ relatedConversationId: chatId }))).toBe(`/chat/admin?c=${chatId}`);
    expect(notificationDestination(notification({ kind: 'comment', relatedPostId: postId }))).toBe(`/post?post=${postId}&comments=1`);
  });
  test('an in-app link (a membership request) is the destination', () => {
    expect(notificationDestination(notification({ kind: 'session', category: 'system', link: '/admin/membership-requests' }))).toBe('/admin/membership-requests');
    expect(notificationDestination(notification({ kind: 'session', category: 'system', link: '/community' }))).toBe('/community');
  });
  test('a link that is not a plain in-app path is ignored', () => {
    for (const link of ['//evil.example/x', 'https://evil.example/', 'javascript:alert(1)', '/a b', '/x\\y', '']) {
      expect(notificationDestination(notification({ kind: 'session', category: 'system', link }))).toBe('/notifications');
    }
  });
  test('malformed content identifiers cannot become routes', () => {
    expect(notificationDestination(notification({ relatedConversationId: '//another-origin' }))).toBe('/notifications');
  });
});
