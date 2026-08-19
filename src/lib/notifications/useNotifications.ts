import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { NotificationKind } from '../database.types';

const PAGE_SIZE = 30;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  relatedPostId: string | null;
  relatedConversationId: string | null;
  readAt: string | null;
  createdAt: string;
}

type NotificationRow = {
  id: string; user_id: string; kind: NotificationKind; title: string; body: string | null;
  related_post_id: string | null; related_conversation_id: string | null;
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
}

/** The signed-in user's notification feed, live via Realtime. */
export function useNotifications(): UseNotifications {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: qError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (qError) { setError(qError.message); return; }
    setNotifications(((data ?? []) as NotificationRow[]).map(toNotification));
    setError(null);
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;
    refresh().finally(() => { if (active) setLoading(false); });

    // RLS already scopes notifications to their owner, but the filter keeps
    // other users' rows off this socket entirely.
    const sub = supabase
      .channel('notifications')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { if (active) void refresh(); })
      .subscribe();

    return () => { active = false; supabase.removeChannel(sub); };
  }, [user, refresh]);

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

  const unreadCount = notifications.reduce((n, item) => n + (item.readAt ? 0 : 1), 0);

  return { notifications, unreadCount, loading, error, markRead, markAllRead };
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

    const sub = supabase
      .channel('notification-badge')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => { if (active) void refresh(); })
      .subscribe();

    return () => { active = false; supabase.removeChannel(sub); };
  }, [user]);

  return count;
}
