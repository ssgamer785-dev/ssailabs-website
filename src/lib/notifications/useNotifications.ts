import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { NotificationKind } from '../database.types';
import { friendlyError, withTimeout } from '../errors';
import { mergeFirstPage } from '../community/comments-merge';
import { NOTIFICATIONS_CHANGED_EVENT, announceNotificationsChanged } from './events';
import { categoryOfNotification, type NotificationCategory } from './categories';

// The number for badges lives in one shared store (one Realtime channel, however many screens show it).
export { NOTIFICATIONS_CHANGED_EVENT } from './events';
export { useUnreadNotificationCount } from './unread-store';

const PAGE_SIZE = 30;

async function deleteNotificationRequest(path: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('Your session expired. Sign in again and retry.');

  let response: Response;
  try {
    response = await fetch(path, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Could not reach the server. Check your connection and retry.');
  }
  if (response.ok) return;

  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (response.status === 401) throw new Error('Your session expired. Sign in again and retry.');
  throw new Error(payload?.error || 'Could not delete notifications. Please retry.');
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  relatedPostId: string | null;
  relatedConversationId: string | null;
  relatedMessageId: string | null;
  relatedCommentId: string | null;
  /** What the notification is about; derived from the kind for rows made before categories existed. */
  category: NotificationCategory;
  /** In-app path for events that are not a chat or a post; validated again before use. */
  link: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

type NotificationRow = {
  id: string; user_id: string; kind: NotificationKind; title: string; body: string | null;
  related_post_id: string | null; related_conversation_id: string | null;
  related_message_id?: string | null; related_comment_id?: string | null;
  category?: NotificationCategory | null; link?: string | null; actor_id?: string | null;
  read_at: string | null; created_at: string;
};

function toNotification(r: NotificationRow): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    relatedPostId: r.related_post_id,
    relatedConversationId: r.related_conversation_id,
    relatedMessageId: r.related_message_id ?? null,
    relatedCommentId: r.related_comment_id ?? null,
    category: categoryOfNotification(r.kind, r.category),
    link: r.link ?? null,
    actorId: r.actor_id ?? null,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export interface UseNotifications {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
  /** Re-reads the feed. Already used internally; exposed for pull-to-refresh. */
  refresh: () => Promise<void>;
  /** Only the newest page used to be reachable; older notifications load on request. */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}

/** The signed-in user's notification feed, live via Realtime. */
export function useNotifications(): UseNotifications {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestRef = useRef<string | null>(null);
  const userId = user?.id;
  const activeUser = useRef(userId);
  activeUser.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) return;
    let data: unknown[] | null = null;
    let qError: unknown = null;
    try {
      // A request that never settles (a dead connection) used to leave the
      // screen on "Loading notifications…" for good.
      ({ data, error: qError } = await withTimeout(supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE), 12_000));
    } catch (e) {
      qError = e;
    }

    if (activeUser.current !== userId) return;
    if (qError) { console.error('[notifications] load failed:', qError); setError(friendlyError(qError, 'Could not load notifications.')); return; }
    const rows = ((data ?? []) as NotificationRow[]).map(toNotification);
    const pageOldest = rows.length ? rows[rows.length - 1].createdAt : null;
    if (!oldestRef.current || !pageOldest || pageOldest < oldestRef.current) {
      oldestRef.current = pageOldest;
      setHasMore(rows.length === PAGE_SIZE);
    }
    // Older pages the person already loaded stay loaded.
    setNotifications(prev => mergeFirstPage(prev, rows));
    setError(null);
  }, [userId]);

  useEffect(() => {
    setNotifications([]);
    setError(null);
    setHasMore(false);
    oldestRef.current = null;
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    let active = true;
    refresh().finally(() => { if (active) setLoading(false); });

    // RLS already scopes notifications to their owner, but the filter keeps
    // other users' rows off this socket entirely.
    const sub = supabase
      .channel('notifications')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        payload => {
          if (!active) return;
          // Sound is centralized in PushNotifications so event rows cannot be
          // played twice by the feed, badge and app-wide listeners.
          void refresh();
        })
      .subscribe();

    const onRecoveredEvent = (event: Event) => {
      if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) void refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onRecoveredEvent);

    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onRecoveredEvent);
      void supabase.removeChannel(sub);
    };
  }, [userId, refresh]);

  const markRead = useCallback(async (id: string) => {
    const target = notifications.find(n => n.id === id);
    if (!target || target.readAt) return;

    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: now } : n));
    const { error: upError } = await supabase.from('notifications').update({ read_at: now }).eq('id', id);
    if (upError) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: null } : n));
      setError(upError.message);
    } else if (userId) announceNotificationsChanged(userId);
  }, [notifications, userId]);

  const markAllRead = useCallback(async () => {
    const previous = notifications;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.readAt ? n : { ...n, readAt: now }));
    const { error: rpcError } = await supabase.rpc('mark_all_notifications_read');
    if (rpcError) {
      setNotifications(previous);
      setError(rpcError.message);
    } else if (userId) announceNotificationsChanged(userId);
  }, [notifications, userId]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!userId) throw new Error('Sign in to manage notifications.');
    const target = notifications.find(n => n.id === id);
    if (!target) return;

    setError(null);
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await deleteNotificationRequest(`/api/notifications/${encodeURIComponent(id)}`);
      if (activeUser.current === userId) announceNotificationsChanged(userId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not delete this notification. Please retry.';
      if (activeUser.current === userId) {
        setNotifications(prev => prev.some(n => n.id === id)
          ? prev
          : [...prev, target].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setError(message);
      }
      throw new Error(message);
    }
  }, [notifications, userId]);

  const deleteAllNotifications = useCallback(async () => {
    if (!userId) throw new Error('Sign in to manage notifications.');
    const previous = notifications;
    setError(null);
    setNotifications([]);
    try {
      await deleteNotificationRequest('/api/notifications');
      if (activeUser.current === userId) announceNotificationsChanged(userId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not clear notifications. Please retry.';
      if (activeUser.current === userId) {
        setNotifications(prev => {
          const existing = new Set(prev.map(n => n.id));
          return [...prev, ...previous.filter(n => !existing.has(n.id))]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        });
        setError(message);
      }
      throw new Error(message);
    }
  }, [notifications, userId]);

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore || !oldestRef.current) return;
    setLoadingMore(true);
    try {
      const { data, error: qError } = await withTimeout(supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .lt('created_at', oldestRef.current)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE), 12_000);
      if (qError) throw qError;
      const rows = ((data ?? []) as NotificationRow[]).map(toNotification);
      setHasMore(rows.length === PAGE_SIZE);
      if (rows.length) {
        oldestRef.current = rows[rows.length - 1].createdAt;
        setNotifications(prev => {
          const seen = new Set(prev.map(n => n.id));
          return [...prev, ...rows.filter(n => !seen.has(n.id))];
        });
      }
    } catch (e) {
      console.error('[notifications] older page failed:', e);
      setError(friendlyError(e, 'Could not load earlier notifications.'));
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore]);

  const unreadCount = notifications.reduce((n, item) => n + (item.readAt ? 0 : 1), 0);

  return { notifications, unreadCount, loading, error, markRead, markAllRead, deleteNotification, deleteAllNotifications, refresh, hasMore, loadingMore, loadMore };
}
