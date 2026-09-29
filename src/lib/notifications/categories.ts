import type { NotificationCategoryName, NotificationKind } from '../database.types';

export type NotificationCategory = NotificationCategoryName;

/**
 * The choices a member has, in the order the settings list shows them, with
 * their defaults (mirrors public.notification_wanted in the database).
 * Mentions and replies to comments are not here because the app has neither:
 * comments are flat and there is no @-mention.
 */
export const NOTIFICATION_SETTINGS: readonly {
  key: NotificationCategory; label: string; description: string; defaultOn: boolean;
}[] = [
  { key: 'direct_messages', label: 'Direct messages', description: 'A message, photo, voice message, video, PDF or file in your chat.', defaultOn: true },
  { key: 'official_announcements', label: 'Official announcements', description: 'New official posts, PDFs, images and videos from The Traders Planet.', defaultOn: true },
  { key: 'comments', label: 'Comments on my posts', description: 'When someone comments on a post you made.', defaultOn: true },
  { key: 'system', label: 'System and account', description: 'Moderation of your content, and for admins, new membership requests.', defaultOn: true },
  { key: 'community_posts', label: 'Students Community posts', description: 'Every new post in the Students Community. Can be frequent.', defaultOn: false },
  { key: 'likes', label: 'Likes', description: 'When someone likes a post you made. Can be frequent.', defaultOn: false },
];

export type NotificationPreferences = Record<NotificationCategory, boolean>;

export const DEFAULT_PREFERENCES: NotificationPreferences = Object.fromEntries(
  NOTIFICATION_SETTINGS.map(setting => [setting.key, setting.defaultOn]),
) as NotificationPreferences;

/** Where a row belongs: its own category, or, for a row made before categories existed, its kind. */
export function categoryOfNotification(kind: NotificationKind, category: NotificationCategory | null | undefined): NotificationCategory {
  if (category) return category;
  switch (kind) {
    case 'chat': return 'direct_messages';
    case 'comment': return 'comments';
    case 'like': return 'likes';
    case 'signal': return 'official_announcements';
    default: return 'system';
  }
}

/** The inbox's filter chips. Each chip groups one or more categories. */
export const INBOX_FILTERS = [
  { key: 'all', label: 'All', categories: null },
  { key: 'messages', label: 'Messages', categories: ['direct_messages'] },
  { key: 'announcements', label: 'Announcements', categories: ['official_announcements'] },
  { key: 'community', label: 'Community', categories: ['community_posts', 'comments', 'likes'] },
  { key: 'system', label: 'System', categories: ['system'] },
] as const;

export type InboxFilterKey = typeof INBOX_FILTERS[number]['key'];

export function inFilter(filter: InboxFilterKey, category: NotificationCategory): boolean {
  const entry = INBOX_FILTERS.find(item => item.key === filter);
  return !entry || !entry.categories || (entry.categories as readonly NotificationCategory[]).includes(category);
}
