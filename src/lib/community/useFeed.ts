import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { AttachmentKind, PostChannel, UserRole } from '../database.types';
import { deletePostMedia } from './media-api';
import { subscribeCommunityActivity } from './activity';
import { likeCountDelta } from './like-events';

const PAGE_SIZE = 15;

export interface FeedPost {
  id: string;
  /** Null on anonymous posts for everyone but their author and admins. */
  authorId: string | null;
  channel: PostChannel;
  title: string | null;
  body: string | null;
  instrument: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  attachment: AttachmentKind;
  storageKey: string | null;
  /** R2 key of the video's poster frame; null for every other attachment. */
  posterKey: string | null;
  mimeType: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  mediaPurged: boolean;
  chartSeed: number | null;
  isAnonymous: boolean;
  createdAt: string;
  authorName: string;
  authorRole: UserRole | null;
  isMine: boolean;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export type FeedRow = {
  id: string; author_id: string | null; channel: PostChannel; title: string | null; body: string | null;
  instrument: string | null; entry_price: number | null; stop_loss: number | null; take_profit: number | null;
  attachment: AttachmentKind; storage_key: string | null; poster_key: string | null;
  mime_type: string | null; size_bytes: number | null;
  file_name: string | null; media_purged: boolean; chart_seed: number | null; is_anonymous: boolean;
  display_name: string; created_at: string; updated_at: string; author_name: string;
  author_role: UserRole | null; is_mine: boolean; like_count: number; comment_count: number; liked_by_me: boolean;
};

/** The one place a `posts_feed` row becomes a `FeedPost`. */
export function toPost(r: FeedRow): FeedPost {
  return {
    id: r.id,
    authorId: r.author_id,
    channel: r.channel,
    title: r.title,
    body: r.body,
    instrument: r.instrument,
    entryPrice: r.entry_price,
    stopLoss: r.stop_loss,
    takeProfit: r.take_profit,
    attachment: r.attachment,
    storageKey: r.storage_key,
    posterKey: r.poster_key,
    mimeType: r.mime_type,
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    mediaPurged: r.media_purged,
    chartSeed: r.chart_seed,
    isAnonymous: r.is_anonymous,
    createdAt: r.created_at,
    authorName: r.author_name,
    authorRole: r.author_role,
    isMine: r.is_mine,
    likeCount: Number(r.like_count) || 0,
    commentCount: Number(r.comment_count) || 0,
    likedByMe: r.liked_by_me,
  };
}

/**
 * The only caller of `posts_feed` in the app.
 *
 * SECURITY INVOKER on the database side, so RLS still decides which rows come
 * back — a student gets exactly the posts they are allowed to see, whether the
 * page is bound for the Community feed or the two summary slots on Home.
 * Counts and `liked_by_me` arrive with the page, so a feed render is one round
 * trip rather than a query per post per counter.
 */
export async function fetchFeedPage(
  channel: PostChannel,
  before: string | null,
  limit: number,
): Promise<FeedPost[]> {
  const { data, error } = await supabase.rpc('posts_feed', {
    p_channel: channel,
    p_before: before,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as FeedRow[]).map(toPost);
}

export interface UseFeed {
  posts: FeedPost[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  deletePost: (post: FeedPost) => Promise<void>;
  /** Switches one of your own posts between named and anonymous. */
  setPostAnonymity: (postId: string, anonymous: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * One channel of the community feed: a page at a time, kept live by Realtime.
 *
 * Counts and liked-by-me come back with the page from posts_feed(), so
 * rendering a feed is a single round trip rather than a query per post.
 */
export function useFeed(channel: PostChannel): UseFeed {
  const { user } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const oldestRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    (before: string | null) => fetchFeedPage(channel, before, PAGE_SIZE),
    [channel],
  );

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchPage(null);
      setHasMore(rows.length === PAGE_SIZE);
      oldestRef.current = rows.length ? rows[rows.length - 1].createdAt : null;
      setPosts(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the feed.');
    }
  }, [fetchPage]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestRef.current) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(oldestRef.current);
      setHasMore(rows.length === PAGE_SIZE);
      if (rows.length) {
        oldestRef.current = rows[rows.length - 1].createdAt;
        // Guard against a row arriving twice if one landed mid-scroll.
        setPosts(prev => {
          const seen = new Set(prev.map(p => p.id));
          return [...prev, ...rows.filter(r => !seen.has(r.id))];
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more posts.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore]);

  // ---- realtime ------------------------------------------------------------

  useEffect(() => {
    if (!user) return;
    let active = true;
    // Once the activity stream is live it covers every post and comment,
    // anonymous ones included; the table listeners below then stand down so
    // nothing is counted twice. Against an older database it never goes live.
    let activityLive = false;

    const stopActivity = subscribeCommunityActivity(`feed-activity:${channel}`, event => {
      if (!active || event.channel !== channel) return;
      if (event.subject === 'post') {
        if (event.op === 'DELETE') setPosts(prev => prev.filter(p => p.id !== event.post_id));
        else void refresh();
        return;
      }
      const delta = event.op === 'INSERT' ? 1 : event.op === 'DELETE' ? -1 : 0;
      if (!delta) return;
      setPosts(prev => prev.map(p => p.id !== event.post_id ? p
        : { ...p, commentCount: Math.max(0, p.commentCount + delta) }));
    }, { onLive: live => { activityLive = live; } });

    const channelSub = supabase
      .channel(`feed:${channel}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
        if (!active || activityLive) return;
        const row = (payload.new ?? payload.old) as { id?: string; channel?: PostChannel } | null;
        if (row?.channel && row.channel !== channel) return;

        if (payload.eventType === 'DELETE') {
          setPosts(prev => prev.filter(p => p.id !== (payload.old as { id: string }).id));
          return;
        }
        // Re-read the top of the feed so the new/updated row arrives with its
        // counts and liked_by_me already resolved.
        void refresh();
      })
      // Counts move far more often than posts do; adjust them in place instead
      // of refetching the whole page for every like.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, payload => {
        if (!active) return;
        const row = (payload.new ?? payload.old) as { post_id: string; user_id: string };
        const delta = likeCountDelta(payload.eventType, row, user.id);
        if (!delta) return;
        setPosts(prev => prev.map(p => p.id !== row.post_id ? p : {
          ...p,
          likeCount: Math.max(0, p.likeCount + delta),
        }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, payload => {
        if (!active || activityLive) return;
        const row = (payload.new ?? payload.old) as { post_id: string };
        const delta = payload.eventType === 'INSERT' ? 1 : payload.eventType === 'DELETE' ? -1 : 0;
        if (!delta) return;
        setPosts(prev => prev.map(p => p.id !== row.post_id ? p
          : { ...p, commentCount: Math.max(0, p.commentCount + delta) }));
      })
      .subscribe();

    return () => {
      active = false;
      stopActivity();
      supabase.removeChannel(channelSub);
    };
  }, [channel, user, refresh]);

  // ---- mutations -----------------------------------------------------------

  const toggleLike = useCallback(async (postId: string) => {
    if (!user) return;
    const target = posts.find(p => p.id === postId);
    if (!target) return;
    const liked = target.likedByMe;

    // Optimistic; the realtime echo for our own row is ignored above.
    setPosts(prev => prev.map(p => p.id !== postId ? p : {
      ...p,
      likedByMe: !liked,
      likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)),
    }));

    const { error: mutError } = liked
      ? await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
      : await supabase.from('likes').insert({ post_id: postId, user_id: user.id });

    if (mutError) {
      setPosts(prev => prev.map(p => p.id !== postId ? p : {
        ...p,
        likedByMe: liked,
        likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)),
      }));
      setError(mutError.message);
    }
  }, [posts, user]);

  /** Switches one of your own Students posts between named and anonymous. */
  const setPostAnonymity = useCallback(async (postId: string, anonymous: boolean) => {
    const target = posts.find(p => p.id === postId);
    if (!target || !target.isMine) return;
    setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, isAnonymous: anonymous }));
    const { error: upError } = await supabase.from('posts').update({ is_anonymous: anonymous }).eq('id', postId);
    if (upError) {
      setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, isAnonymous: target.isAnonymous }));
      setError('Could not change how this post is signed. Please try again.');
      return;
    }
    void refresh();
  }, [posts, refresh]);

  const deletePost = useCallback(async (post: FeedPost) => {
    const previous = posts;
    setPosts(prev => prev.filter(p => p.id !== post.id));

    // Clear the R2 object first: once the row is gone we lose the key.
    if (post.storageKey) {
      try { await deletePostMedia(post.id); }
      catch (e) {
        setPosts(previous);
        setError(e instanceof Error ? e.message : 'Could not remove the attachment.');
        throw e;
      }
    }

    const { error: delError } = await supabase.from('posts').delete().eq('id', post.id);
    if (delError) {
      setPosts(previous);
      setError(delError.message);
      throw delError;
    }
  }, [posts]);

  return { posts, loading, loadingMore, error, hasMore, loadMore, toggleLike, deletePost, setPostAnonymity, refresh };
}
