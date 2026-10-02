import { describe, expect, it } from 'bun:test';
import { DEFAULT_PREFERENCES, INBOX_FILTERS, NOTIFICATION_SETTINGS, categoryOfNotification, inFilter } from './categories';

describe('notification categories', () => {
  it('start with messages, announcements, comments and system on, and the busy ones off', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      direct_messages: true, official_announcements: true, comments: true, replies: true, system: true, community_posts: false, likes: false,
    });
  });

  it('list exactly the choices the app can honour: replies (RC5), no mentions', () => {
    expect(NOTIFICATION_SETTINGS.map(setting => setting.key).sort())
      .toEqual(['comments', 'community_posts', 'direct_messages', 'likes', 'official_announcements', 'replies', 'system']);
    expect(JSON.stringify(NOTIFICATION_SETTINGS).toLowerCase()).not.toContain('mention');
  });

  it('every choice has a label, a description and a default that matches the database', () => {
    for (const setting of NOTIFICATION_SETTINGS) {
      expect(setting.label.length).toBeGreaterThan(3);
      expect(setting.description.length).toBeGreaterThan(10);
      expect(setting.defaultOn).toBe(DEFAULT_PREFERENCES[setting.key]);
    }
  });

  it('places a row by its own category, or, for an older row, by its kind', () => {
    expect(categoryOfNotification('chat', 'direct_messages')).toBe('direct_messages');
    expect(categoryOfNotification('session', 'system')).toBe('system');
    expect(categoryOfNotification('signal', 'community_posts')).toBe('community_posts');
    expect(categoryOfNotification('chat', null)).toBe('direct_messages');
    expect(categoryOfNotification('comment', undefined)).toBe('comments');
    expect(categoryOfNotification('like', null)).toBe('likes');
    expect(categoryOfNotification('signal', null)).toBe('official_announcements');
    expect(categoryOfNotification('target', null)).toBe('system');
    expect(categoryOfNotification('session', null)).toBe('system');
  });

  it('groups categories into the inbox filters, and All shows everything', () => {
    expect(INBOX_FILTERS.map(filter => filter.key)).toEqual(['all', 'messages', 'announcements', 'community', 'system']);
    expect(inFilter('all', 'likes')).toBe(true);
    expect(inFilter('messages', 'direct_messages')).toBe(true);
    expect(inFilter('messages', 'comments')).toBe(false);
    expect(inFilter('community', 'community_posts')).toBe(true);
    expect(inFilter('community', 'comments')).toBe(true);
    expect(inFilter('community', 'likes')).toBe(true);
    expect(inFilter('community', 'system')).toBe(false);
    expect(inFilter('announcements', 'official_announcements')).toBe(true);
    expect(inFilter('system', 'system')).toBe(true);
  });

  it('puts every category in exactly one non-All filter', () => {
    for (const setting of NOTIFICATION_SETTINGS) {
      const homes = INBOX_FILTERS.filter(filter => filter.key !== 'all' && inFilter(filter.key, setting.key));
      expect(homes).toHaveLength(1);
    }
  });
});
