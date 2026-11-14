import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { NotificationKind } from '../database.types';

const PAGE_SIZE = 30;
export const NOTIFICATIONS_CHANGED_EVENT = 'tp:notifications-changed';

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

function announceNotificationsChanged(userId: string): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId } }));
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
  readAt: string | null;
  createdAt: string;
}

type NotificationRow = {
  id: string; user_id: string; kind: NotificationKind; title: string; body: string | null;
  related_post_id: string | null; related_conversation_id: string | null;
  related_message_id?: string | null; related_comment_id?: string | null;
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
}

/** The signed-in user's notification feed, live via Realtime. */
export function useNotifications(): UseNotifications {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id;
  const activeUser = useRef(userId);
  activeUser.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error: qError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (activeUser.current !== userId) return;
    if (qError) { setError(qError.message); return; }
    setNotifications(((data ?? []) as NotificationRow[]).map(toNotification));
    setError(null);
  }, [userId]);

  useEffect(() => {
    setNotifications([]);
    setError(null);
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
    }
  }, [notifications]);

  const markAllRead = useCallback(async () => {
    const previous = notifications;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.readAt ? n : { ...n, readAt: now }));
    const { error: rpcError } = await supabase.rpc('mark_all_notifications_read');
    if (rpcError) {
      setNotifications(previous);
      setError(rpcError.message);
    }
  }, [notifications]);

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

  const unreadCount = notifications.reduce((n, item) => n + (item.readAt ? 0 : 1), 0);

  return { notifications, unreadCount, loading, error, markRead, markAllRead, deleteNotification, deleteAllNotifications, refresh };
}

/**
 * Just the badge number, for screens that shouldn't pull the whole feed.
 * Counted server-side and refreshed on any change to the user's rows.
 */
export function useUnreadNotificationCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) { setCount(0); return; }
    let active = true;

    const refresh = async () => {
      const { data } = await supabase.rpc('my_unread_notification_count');
      if (active) setCount(Number(data) || 0);
    };
    void refresh();

    const onNotificationsChanged = (event: Event) => {
      const changedUserId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (changedUserId === user.id) void refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onNotificationsChanged);

    const sub = supabase
      .channel('notification-badge')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        payload => {
          if (!active) return;
          // Screens that show only the badge never mount the feed hook, so the
          // unread count is refreshed here too. Sound is handled by the single
          // app-wide listener in PushNotifications.
          void refresh();
        })
      .subscribe();

    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onNotificationsChanged);
      supabase.removeChannel(sub);
    };
  }, [user]);

  return count;
}
