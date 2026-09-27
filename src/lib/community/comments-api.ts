import { supabase } from '../supabase';

/**
 * Adds one comment without loading the thread. The feed's inline reply box
 * needs nothing else: it used to mount the whole comments hook per card, one
 * comments query and one realtime channel for every post on screen (TP-021).
 * Resolves with an error message, or null on success.
 */
export async function postComment(args: { postId: string; userId: string; body: string; anonymous: boolean }): Promise<string | null> {
  const text = args.body.trim();
  if (!text) return null;
  const { error } = await supabase.from('comments').insert({
    post_id: args.postId,
    author_id: args.userId,
    body: text,
    is_anonymous: args.anonymous,
    client_id: crypto.randomUUID(),
  });
  if (error) {
    console.error('[community] reply failed:', error);
    return 'Your reply was not sent. Please try again.';
  }
  return null;
}
