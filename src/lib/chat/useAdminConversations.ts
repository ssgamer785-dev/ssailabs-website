import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';

/**
 * Every activated member, with their thread, for the admin inbox.
 *
 * The inbox this replaces listed four names that were written into the
 * component — the same four for every admin, on every install, forever. This
 * asks the database, which is admin-gated inside `admin_conversations()`: a
 * student calling it gets an empty set rather than an error, so the function's
 * existence leaks nothing either.
 *
 * Members with no conversation yet are included deliberately. An admin needs to
 * be able to start the conversation, and a list of only people who have already
 * written first is a list that cannot do that.
 */

export interface AdminConversation {
  studentId: string;
  fullName: string;
  avatarKey: string | null;
  /** False means this member shows to OTHER members as "Unknown User". */
  revealIdentity: boolean;
  conversationId: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

type Row = {
  student_id: string; full_name: string; avatar_key: string | null;
  reveal_identity: boolean; activated_at: string | null;
  conversation_id: string | null; unread_count: number | string;
  last_message_at: string | null; last_message_preview: string | null;
};

export interface UseAdminConversations {
  conversations: AdminConversation[];
  loading: boolean;
  /** null-safe: distinct from an empty list, which means "no members yet". */
  loadFailed: boolean;
  refresh: () => Promise<void>;
}

export function useAdminConversations(): UseAdminConversations {
  const { user, isAdmin } = useAuth();
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_conversations');
    if (error) {
      console.error('[admin-chat] conversation list failed:', error);
      setLoadFailed(true);
      return;
    }
    setConversations(((data ?? []) as unknown as Row[]).map(r => ({
      studentId: r.student_id,
      fullName: r.full_name,
      avatarKey: r.avatar_key,
      revealIdentity: r.reveal_identity,
      conversationId: r.conversation_id,
      unreadCount: Number(r.unread_count) || 0,
      lastMessageAt: r.last_message_at,
      lastMessagePreview: r.last_message_preview,
    })));
    setLoadFailed(false);
  }, []);

  useEffect(() => {
    if (!user || !isAdmin) { setLoading(false); return; }
    let active = true;
    refresh().finally(() => { if (active) setLoading(false); });

    // Any message anywhere can change a preview, an unread count or the order,
    // and a new activation adds a row. Both are low-frequency events on an
    // admin's screen, so re-reading the list is cheaper than tracking deltas.
    const sub = supabase
      .channel('admin-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' },
        () => { if (active) void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },
        () => { if (active) void refresh(); })
      .subscribe();

    return () => { active = false; supabase.removeChannel(sub); };
  }, [user, isAdmin, refresh]);

  return { conversations, loading, loadFailed, refresh };
}

/**
 * The conversation id for a member, creating the thread on first contact.
 *
 * Returns null when the database refuses — which it will for a non-admin, and
 * for a member who is not activated.
 */
export async function openConversationWith(studentId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_open_conversation', { p_student_id: studentId });
  if (error) {
    console.error('[admin-chat] open conversation failed:', error);
    return null;
  }
  return (data as unknown as string) ?? null;
}
