import { createHash } from 'crypto';
import { env } from './r2.js';

/**
 * What a push says, where it leads, and how the push service should treat it.
 * Pure functions, so every rule here is testable without a database or a push
 * service.
 *
 * Privacy rule: the words on a lock screen are the notification's one-line
 * TITLE ("Rahul sent you a voice message"), never its body. The body of a chat
 * notification is the message text, a comment's is the comment; both stay in
 * the in-app list, which only their recipient can open.
 */

export type NotificationCategory =
  | 'direct_messages' | 'official_announcements' | 'community_posts' | 'comments' | 'likes' | 'system';

const CATEGORIES: readonly NotificationCategory[] = [
  'direct_messages', 'official_announcements', 'community_posts', 'comments', 'likes', 'system',
];

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: string;
  category?: string | null;
  title: string;
  body?: string | null;
  related_post_id: string | null;
  related_conversation_id: string | null;
  related_message_id?: string | null;
  related_comment_id?: string | null;
  link?: string | null;
}

/** The unread rows of the recipient (kind and target only), newest first, at most UNREAD_SCAN_LIMIT. */
export interface UnreadRow {
  kind: string;
  related_conversation_id: string | null;
  related_post_id: string | null;
}

export const UNREAD_SCAN_LIMIT = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same shape the database accepts for notifications.link. */
const IN_APP_LINK = /^\/[A-Za-z0-9/_?=&%.-]{0,200}$/;

/** A row made before `category` existed is placed by its kind. */
export function categoryOf(row: Pick<NotificationRow, 'kind' | 'category'>): NotificationCategory {
  if (row.category && (CATEGORIES as readonly string[]).includes(row.category)) return row.category as NotificationCategory;
  switch (row.kind) {
    case 'chat': return 'direct_messages';
    case 'comment': return 'comments';
    case 'like': return 'likes';
    case 'signal': return 'official_announcements';
    default: return 'system';
  }
}

/** Mirrors src/lib/notifications/destination.ts (a test keeps the two identical). */
export function destinationOf(row: Pick<NotificationRow, 'kind' | 'related_post_id' | 'related_conversation_id' | 'related_message_id' | 'related_comment_id' | 'link'>): string {
  if (row.link && IN_APP_LINK.test(row.link) && !row.link.startsWith('//')) return row.link;
  if (row.kind === 'chat' && row.related_conversation_id && UUID.test(row.related_conversation_id)) {
    const message = row.related_message_id && UUID.test(row.related_message_id) ? `&m=${encodeURIComponent(row.related_message_id)}` : '';
    return `/chat/admin?c=${encodeURIComponent(row.related_conversation_id)}${message}`;
  }
  if (row.related_post_id && UUID.test(row.related_post_id)) {
    const suffix = row.related_comment_id && UUID.test(row.related_comment_id)
      ? `&comment=${encodeURIComponent(row.related_comment_id)}`
      : row.kind === 'comment' ? '&comments=1' : '';
    return `/post?post=${encodeURIComponent(row.related_post_id)}${suffix}`;
  }
  return '/notifications';
}

/**
 * Notifications that repeat about one thing collapse into one banner: the same
 * tag replaces the previous banner on the device, and the push service keeps
 * only the newest undelivered one (Topic). Everything else stands alone.
 */
export function groupOf(row: NotificationRow): { tag: string; grouped: boolean } {
  if (row.kind === 'chat' && row.related_conversation_id && UUID.test(row.related_conversation_id)) {
    return { tag: `tp-chat-${row.related_conversation_id}`, grouped: true };
  }
  if ((row.kind === 'comment' || row.kind === 'like') && row.related_post_id && UUID.test(row.related_post_id)) {
    return { tag: `tp-${row.kind}s-${row.related_post_id}`, grouped: true };
  }
  return { tag: `tp-${row.id}`, grouped: false };
}

/** How many of the recipient's unread notifications belong to this row's group, this one included. */
export function unreadInGroup(row: NotificationRow, unread: readonly UnreadRow[]): number {
  if (row.kind === 'chat') return unread.filter(u => u.kind === 'chat' && u.related_conversation_id === row.related_conversation_id).length;
  if (row.kind === 'comment' || row.kind === 'like') return unread.filter(u => u.kind === row.kind && u.related_post_id === row.related_post_id).length;
  return 1;
}

function oneLine(text: string | null | undefined, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The sentence a banner shows. Only the title; see the privacy rule above. */
export function bannerText(row: NotificationRow, count: number): string {
  const title = oneLine(row.title, 120);
  if (count > 1) {
    if (row.kind === 'chat') {
      const sender = /^(.{1,60}?) sent you /.exec(title)?.[1];
      return sender ? `${sender} sent you ${count} new messages` : `You have ${count} new messages`;
    }
    if (row.kind === 'comment') return `${count} new comments on your post`;
    if (row.kind === 'like') return `${count} people liked your post`;
  }
  return title || 'You have a new notification.';
}

export interface PushPayload {
  v: 2;
  id: string;
  kind: string;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Unread notifications in this banner's group (1 = a single event). */
  count: number;
  /** The recipient's total unread notifications, for the app icon badge (capped). */
  unread: number;
}

export function buildPayload(row: NotificationRow, unread: readonly UnreadRow[]): PushPayload {
  const { tag } = groupOf(row);
  // The row that triggered this push is unread and is normally in `unread`;
  // never report fewer than this one.
  const count = Math.max(1, unreadInGroup(row, unread));
  return {
    v: 2,
    id: row.id,
    kind: row.kind,
    category: categoryOf(row),
    title: 'The Traders Planet',
    body: bannerText(row, count),
    url: destinationOf(row),
    tag,
    count,
    unread: Math.min(99, Math.max(1, unread.length)),
  };
}

/** How long a push service may hold the message, and how urgently it wakes the device. */
export function deliveryOptions(row: NotificationRow): { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } {
  const category = categoryOf(row);
  const { tag, grouped } = groupOf(row);
  const base = category === 'direct_messages' ? { TTL: 24 * 3600, urgency: 'high' as const }
    : category === 'likes' || category === 'community_posts' ? { TTL: 3600, urgency: 'low' as const }
    : { TTL: 24 * 3600, urgency: 'normal' as const };
  // Topic must be URL-safe base64 of at most 32 characters: a hash of the group.
  return grouped ? { ...base, topic: createHash('sha256').update(tag).digest('base64url').slice(0, 30) } : base;
}

export type PushPlatform = 'ios' | 'android' | 'desktop' | 'other';

/** Only a hint for the device list; never used for a decision. */
export function platformFromUserAgent(userAgent: string | undefined): PushPlatform {
  const ua = userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows NT|Macintosh|X11|CrOS|Linux/.test(ua)) return 'desktop';
  return 'other';
}

export type PushEnvironment = 'production' | 'preview' | 'development';

/**
 * Which deployment this server is. A Vercel Preview shares the live database,
 * so every device is marked with its environment and a server only ever sends
 * to devices of its own. Vercel sets VERCEL_ENV itself; nothing to configure.
 */
export function pushEnvironment(): PushEnvironment {
  const value = env('PUSH_ENVIRONMENT') ?? env('VERCEL_ENV');
  return value === 'preview' || value === 'development' ? value : 'production';
}

/** A device row is delivered to only when it was registered by this environment (NULL = registered before the marker existed = production). */
export function deviceMatchesEnvironment(device: { environment?: string | null }, current: PushEnvironment): boolean {
  return (device.environment ?? 'production') === current;
}
