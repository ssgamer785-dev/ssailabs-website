import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';

const PAGE_SIZE = 20;

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  body: string | null;
  isAnonymous: boolean;
  createdAt: string;
  authorName: string;
  isMine: boolean;
  pending?: boolean;
  failed?: boolean;
}

type CommentRow = {
  id: string; post_id: string; author_id: string; body: string | null;
  voice_url: string | null; voice_duration_seconds: number | null;
  is_anonymous: boolean; display_name: string; created_at: string;
  author_name: string; is_mine: boolean;
};

function toComment(r: CommentRow): PostComment {
  return {
    id: r.id,
    postId: r.post_id,
    authorId: r.author_id,
    body: r.body,
    isAnonymous: r.is_anonymous,
    createdAt: r.created_at,
    authorName: r.author_name,
    isMine: r.is_mine,
  };
}

export interface UseComments {
  comments: PostComment[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  addComment: (body: string, anonymous: boolean) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
}

/** Comments on one post: newest-first pages, live-updated, optimistic adds. */
export function useComments(postId: string | null): UseComments {
  const { user } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oldestRef = useRef<string | null>(null);

  const fetchPage = useCallback(async (before: string | null) => {
    if (!postId) return [];
    const { data, error: rpcError } = await supabase.rpc('post_comments', {
      p_post_id: postId,
      p_before: before,
      p_limit: PAGE_SIZE,
    });
    if (rpcError) throw new Error(rpcError.message);
    return ((data ?? []) as CommentRow[]).map(toComment);
  }, [postId]);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchPage(null);
      setHasMore(rows.length === PAGE_SIZE);
      oldestRef.current = rows.length ? rows[rows.length - 1].createdAt : null;
      // Keep any comment still in flight so it doesn't vanish mid-send.
      setComments(prev => [...rows, ...prev.filter(c => c.pending || c.failed)]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load comments.');
    }
  }, [fetchPage]);

  useEffect(() => {
    if (!postId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    refresh().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postId, refresh]);

  useEffect(() => {
    if (!postId || !user) return;
    let active = true;
    const sub = supabase
      .channel(`comments:${postId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        () => { if (active) void refresh(); })
      .subscribe();
    return () => { active = false; supabase.removeChannel(sub); };
  }, [postId, user, refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestRef.current) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(oldestRef.current);
      setHasMore(rows.length === PAGE_SIZE);
      if (rows.length) {
        oldestRef.current = rows[rows.length - 1].createdAt;
        setComments(prev => {
          const seen = new Set(prev.map(c => c.id));
          return [...prev, ...rows.filter(r => !seen.has(r.id))];
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more comments.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore]);

  const addComment = useCallback(async (body: string, anonymous: boolean) => {
    const text = body.trim();
    if (!text || !postId || !user) return;

    const clientId = crypto.randomUUID();
    const optimistic: PostComment = {
      id: clientId,
      postId,
      authorId: user.id,
      body: text,
      isAnonymous: anonymous,
      createdAt: new Date().toISOString(),
      authorName: anonymous ? 'Unknown User' : 'You',
      isMine: true,
      pending: true,
    };
    setComments(prev => [optimistic, ...prev]);

    const { error: insError } = await supabase.from('comments').insert({
      post_id: postId,
      author_id: user.id,
      body: text,
      is_anonymous: anonymous,
      client_id: clientId,
    });

    if (insError) {
      setComments(prev => prev.map(c => c.id === clientId ? { ...c, pending: false, failed: true } : c));
      setError(insError.message);
      return;
    }
    // The realtime echo refreshes the page, which replaces the optimistic row.
    setComments(prev => prev.filter(c => c.id !== clientId));
    await refresh();
  }, [postId, user, refresh]);

  const deleteComment = useCallback(async (id: string) => {
    const previous = comments;
    setComments(prev => prev.filter(c => c.id !== id));
    const { error: delError } = await supabase.from('comments').delete().eq('id', id);
    if (delError) {
      setComments(previous);
      setError(delError.message);
    }
  }, [comments]);

  return { comments, loading, loadingMore, hasMore, error, loadMore, addComment, deleteComment };
}
