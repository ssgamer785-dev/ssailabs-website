import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import { readView, writeView } from '../view-cache';

export interface ChatOverview {
  conversationId: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

/**
 * Unread count and last-message preview for the Chat list row, kept current by
 * a Realtime subscription on the user's own messages.
 */
export function useChatOverview(): { overview: ChatOverview | null; loading: boolean; refresh: () => Promise<void> } {
  const { user } = useAuth();
  const key = `chat-overview:${user?.id ?? '-'}`;
  const cached = readView<ChatOverview | null>(key);
  const [overview, setOverview] = useState<ChatOverview | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_chat_overview');
    if (error) return;
    const row = data?.[0];
    const next = row
      ? {
          conversationId: row.conversation_id,
          unreadCount: Number(row.unread_count) || 0,
          lastMessageAt: row.last_message_at,
          lastMessagePreview: row.last_message_preview,
        }
      : null;
    setOverview(next);
    writeView(key, next);
  }, [key]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    refresh().finally(() => { if (active) setLoading(false); });

    const channel = supabase
      .channel('chat-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (active) void refresh();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  return { overview, loading, refresh };
}
