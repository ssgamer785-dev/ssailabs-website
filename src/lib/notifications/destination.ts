import type { AppNotification } from './useNotifications';

const KEY = 'tp-notification-destination';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function notificationDestination(notification: AppNotification): string {
  if (notification.kind === 'chat' && notification.relatedConversationId && UUID.test(notification.relatedConversationId)) {
    const message = notification.relatedMessageId && UUID.test(notification.relatedMessageId)
      ? `&m=${encodeURIComponent(notification.relatedMessageId)}` : '';
    return `/chat/admin?c=${encodeURIComponent(notification.relatedConversationId)}${message}`;
  }
  if (notification.relatedPostId && UUID.test(notification.relatedPostId)) {
    const suffix = notification.relatedCommentId && UUID.test(notification.relatedCommentId)
      ? `&comment=${encodeURIComponent(notification.relatedCommentId)}`
      : notification.kind === 'comment' ? '&comments=1' : '';
    return `/post?post=${encodeURIComponent(notification.relatedPostId)}${suffix}`;
  }
  return '/notifications';
}

export function rememberDestination(path: string): void {
  if (path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/login') && !path.startsWith('/activate')) {
    try { sessionStorage.setItem(KEY, path); } catch { /* Private browsing can disable storage. */ }
  }
}

export function pendingDestination(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    return path?.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch { return null; }
}

export function consumeDestination(): string | null {
  const path = pendingDestination();
  try { sessionStorage.removeItem(KEY); } catch { /* No saved destination. */ }
  return path;
}
