import { supabase } from '../supabase';
import type { PostChannel } from '../database.types';

/**
 * One row of public.community_activity: which post (or which post's comments)
 * changed, and how. It never says who made the change.
 *
 * Posts and comments marked anonymous are readable only by their author and
 * admins, so table-level realtime no longer carries them to anyone else; this
 * stream is how every member still learns that the feed moved. The row is a
 * cue to re-read through posts_feed / post_comments, never data to display.
 */
export interface CommunityActivity {
  post_id: string;
  channel: PostChannel;
  subject: 'post' | 'comment';
  op: 'INSERT' | 'UPDATE' | 'DELETE';
}

/**
 * Listens on its own channel so that, against a database that predates the
 * stream, only this subscription fails and callers keep their table
 * listeners. `onLive` reports whether events are actually flowing, which is
 * how callers avoid counting the same comment twice.
 */
export function subscribeCommunityActivity(
  name: string,
  onEvent: (event: CommunityActivity) => void,
  options: { postId?: string; onLive?: (live: boolean) => void } = {},
): () => void {
  let active = true;
  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'community_activity',
        ...(options.postId ? { filter: `post_id=eq.${options.postId}` } : {}),
      },
      payload => { if (active) onEvent(payload.new as CommunityActivity); },
    )
    .subscribe(status => { if (active) options.onLive?.(status === 'SUBSCRIBED'); });
  return () => {
    active = false;
    options.onLive?.(false);
    void supabase.removeChannel(channel);
  };
}
