import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { withPostMedia } from './multi-media';
import { subscribeCommunityActivity } from './activity';
import { useAuth } from '../auth-context';
import { feedKey, toPost, type FeedPost, type FeedRow } from './useFeed';
import { readView } from '../view-cache';
import { announceNotificationsChanged } from '../notifications/events';

/**
 * One post, by id, with everything the detail screen renders.
 *
 * This exists because the detail screen used to query `posts` directly for
 * four columns and invent the rest — a hard-coded author, a hard-coded
 * timestamp, a placeholder chart in place of whatever was actually attached,
 * and a bookmark that was local state and never reached the database. Reading
 * through `post_by_id` means the screen shows the post that exists rather than
 * a plausible one.
 *
 * RLS decides visibility: the function is SECURITY INVOKER, so a post the
 * caller may not see comes back as no rows, which is `notFound` below rather
 * than an error. The two are kept apart because "this post was deleted" and
 * "the network failed" call for different words on screen.
 */

export interface PostDetail extends FeedPost {
  bookmarkedByMe: boolean;
  /** The author's R2 avatar key. Null on an anonymous post, for non-admins. */
  authorAvatarKey: string | null;
}

type DetailRow = FeedRow & {
  bookmarked_by_me: boolean;
  author_avatar_key: string | null;
};

export interface UsePost {
  post: PostDetail | null;
  /** False while the post shown is the feed's copy (bookmark and avatar not read yet). */
  complete: boolean;
  loading: boolean;
  notFound: boolean;
  error: string | null;
  toggleLike: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * The feed's copy of a post the member has already seen in a channel: shown at
 * once (with the pictures prepared for that feed) while post_by_id completes
 * it behind. Its bookmark and the author's picture are not in a feed row, so
 * until then the copy says it is not complete and the bookmark waits.
 */
function feedCopy(userId: string | undefined, postId: string | null): PostDetail | null {
  if (!userId || !postId) return null;
  for (const channel of ['official', 'students'] as const) {
    const hit = readView<FeedPost[]>(feedKey(userId, channel))?.find(p => p.id === postId);
    if (hit) return { ...hit, bookmarkedByMe: false, authorAvatarKey: null };
  }
  return null;
}

export function usePost(postId: string | null): UsePost {
  const { user } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(() => feedCopy(user?.id, postId));
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(() => !feedCopy(user?.id, postId));
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!postId) { setNotFound(true); return; }
    const { data, error: rpcError } = await supabase.rpc('post_by_id', { p_post_id: postId });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const row = (data as unknown as DetailRow[] | null)?.[0];
    if (!row) {
      setNotFound(true);
      setPost(null);
      return;
    }
    const [withMedia] = await withPostMedia([toPost(row)]);
    setPost({
      ...withMedia,
      bookmarkedByMe: row.bookmarked_by_me,
      authorAvatarKey: row.author_avatar_key,
    });
    setComplete(true);
    setNotFound(false);
    setError(null);
  }, [postId]);

  useEffect(() => {
    let active = true;
    const copy = feedCopy(user?.id, postId);
    // A copy from the feed stays on screen while the full post is read; otherwise "Loading…".
    setPost(previous => (previous?.id === postId ? previous : copy));
    setComplete(false);
    setLoading(!copy);
    setNotFound(false);
    refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // user?.id only picks the copy; a refresh is keyed by the post itself.
  }, [refresh]);

  // Opening a post clears the notifications about it (a comment, a like, its
  // announcement), so the unread badge is true. Once per post per visit;
  // ignored where the function does not exist yet.
  const clearedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!post || !user || !postId || clearedFor.current === postId) return;
    clearedFor.current = postId;
    void supabase.rpc('mark_related_notifications_read', { p_post_id: postId }).then(({ data, error: clearError }) => {
      if (!clearError && Number(data) > 0) announceNotificationsChanged(user.id);
    });
  }, [post, postId, user]);

  // Live, like the feed: a like or comment landing while the post is open
  // should move the number under it.
  useEffect(() => {
    if (!postId || !user) return;
    let active = true;
    const sub = supabase
      .channel(`post:${postId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'likes', filter: `post_id=eq.${postId}` },
        () => { if (active) void refresh(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'posts', filter: `id=eq.${postId}` },
        () => { if (active) void refresh(); })
      .subscribe();
    // Edits to an anonymous post, and new comments of any kind, arrive here.
    const stopActivity = subscribeCommunityActivity(`post-activity:${postId}`, () => {
      if (active) void refresh();
    }, { postId });
    return () => { active = false; stopActivity(); supabase.removeChannel(sub); };
  }, [postId, user, refresh]);

  const toggleLike = useCallback(async () => {
    if (!post || !user) return;
    const liked = post.likedByMe;

    setPost(p => p && ({
      ...p,
      likedByMe: !liked,
      likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)),
    }));

    const { error: mutError } = liked
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });

    if (mutError) {
      // Put the number back rather than leaving a count that never happened.
      setPost(p => p && ({
        ...p,
        likedByMe: liked,
        likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)),
      }));
      setError(mutError.message);
    }
  }, [post, user]);

  const toggleBookmark = useCallback(async () => {
    // Not known yet for the feed's copy: wait for the full post rather than guess.
    if (!post || !user || !complete) return;
    const saved = post.bookmarkedByMe;
    setPost(p => p && ({ ...p, bookmarkedByMe: !saved }));

    const { error: mutError } = saved
      ? await supabase.from('bookmarks').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await supabase.from('bookmarks').insert({ post_id: post.id, user_id: user.id });

    if (mutError) {
      setPost(p => p && ({ ...p, bookmarkedByMe: saved }));
      setError(mutError.message);
    }
  }, [post, user, complete]);

  return { post, complete, loading, notFound, error, toggleLike, toggleBookmark, refresh };
}
