import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import { toPost, type FeedPost, type FeedRow } from './useFeed';

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
  loading: boolean;
  notFound: boolean;
  error: string | null;
  toggleLike: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePost(postId: string | null): UsePost {
  const { user } = useAuth();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
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
    setPost({
      ...toPost(row),
      bookmarkedByMe: row.bookmarked_by_me,
      authorAvatarKey: row.author_avatar_key,
    });
    setNotFound(false);
    setError(null);
  }, [postId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

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
    return () => { active = false; supabase.removeChannel(sub); };
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
    if (!post || !user) return;
    const saved = post.bookmarkedByMe;
    setPost(p => p && ({ ...p, bookmarkedByMe: !saved }));

    const { error: mutError } = saved
      ? await supabase.from('bookmarks').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await supabase.from('bookmarks').insert({ post_id: post.id, user_id: user.id });

    if (mutError) {
      setPost(p => p && ({ ...p, bookmarkedByMe: saved }));
      setError(mutError.message);
    }
  }, [post, user]);

  return { post, loading, notFound, error, toggleLike, toggleBookmark, refresh };
}
