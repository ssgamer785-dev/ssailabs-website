import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { subscribeCommunityActivity } from './activity';
import { mergeFirstPage } from './comments-merge';
import { mergeThreadPage } from './comment-threads';
import { useAuth } from '../auth-context';
import { friendlyError } from '../errors';

const PAGE_SIZE = 20;

export interface PostComment {
  id: string;
  postId: string;
  /** Null on anonymous comments for everyone but their author and admins. */
  authorId: string | null;
  body: string | null;
  isAnonymous: boolean;
  createdAt: string;
  authorName: string;
  isMine: boolean;
  /** The thread's top-level comment; null for a top-level comment (RC5 replies). */
  parentId: string | null;
  /** The comment this reply answered. */
  replyToId: string | null;
  /** Whom it answered, as this viewer may see them ("Unknown User" when anonymous; admins see the real name). */
  replyToName: string | null;
  pending?: boolean;
  failed?: boolean;
}

/** What a reply is answering; the composer shows it and can cancel it. */
export interface ReplyTarget { id: string; rootId: string; name: string }

type CommentRow = {
  id: string; post_id: string; author_id: string | null; body: string | null;
  voice_url: string | null; voice_duration_seconds: number | null;
  is_anonymous: boolean; display_name: string; created_at: string;
  author_name: string; is_mine: boolean;
  parent_comment_id?: string | null; reply_to_comment_id?: string | null; reply_to_name?: string | null;
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
    parentId: r.parent_comment_id ?? null,
    replyToId: r.reply_to_comment_id ?? null,
    replyToName: r.reply_to_name ?? null,
  };
}

export interface UseComments {
  comments: PostComment[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** false until the database has the RC5 thread reader (then replies are offered). */
  canReply: boolean;
  loadMore: () => Promise<void>;
  addComment: (body: string, anonymous: boolean, replyTo?: ReplyTarget | null) => Promise<void>;
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
  const [canReply, setCanReply] = useState(threadsAvailable !== false);
  const oldestRef = useRef<string | null>(null);

  /**
   * A page of threads (top-level comments with all their replies) where the
   * database has post_comment_threads; otherwise the flat RC4 reader, so the
   * app keeps working against a database the RC5 migration has not reached.
   */
  const fetchPage = useCallback(async (before: string | null) => {
    if (!postId) return [];
    if (threadsAvailable !== false) {
      const { data, error: rpcError } = await supabase.rpc('post_comment_threads' as 'post_comments', {
        p_post_id: postId,
        p_before: before,
        p_limit: PAGE_SIZE,
      });
      if (!rpcError) {
        threadsAvailable = true;
        setCanReply(true);
        return ((data ?? []) as CommentRow[]).map(toComment);
      }
      if (!isMissingFunction(rpcError)) throw new Error(rpcError.message);
      threadsAvailable = false;
      setCanReply(false);
    }
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
      const pageOldest = oldestTopLevel(rows);
      // Older pages the reader already loaded stay loaded (and so does the
      // paging position); only a first load or an emptied thread resets it.
      if (!oldestRef.current || !pageOldest || pageOldest < oldestRef.current) {
        oldestRef.current = pageOldest;
        setHasMore(topLevelCount(rows) === PAGE_SIZE);
      }
      setComments(prev => threadsAvailable ? mergeThreadPage(prev, rows) : mergeFirstPage(prev, rows));
      setError(null);
    } catch (e) {
      setError(friendlyError(e, 'Could not load comments.'));
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
        payload => {
          if (!active) return;
          const removed = payload.eventType === 'DELETE' ? (payload.old as { id?: string } | null)?.id : undefined;
          if (removed) setComments(prev => prev.filter(c => c.id !== removed));
          void refresh();
        })
      .subscribe();
    // Anonymous comments by others only arrive through the activity stream.
    const stopActivity = subscribeCommunityActivity(`comments-activity:${postId}`, event => {
      if (active && event.subject === 'comment') void refresh();
    }, { postId });
    return () => { active = false; stopActivity(); supabase.removeChannel(sub); };
  }, [postId, user, refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !oldestRef.current) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(oldestRef.current);
      setHasMore(topLevelCount(rows) === PAGE_SIZE);
      if (rows.length) {
        oldestRef.current = oldestTopLevel(rows) ?? oldestRef.current;
        setComments(prev => {
          const seen = new Set(prev.map(c => c.id));
          return [...prev, ...rows.filter(r => !seen.has(r.id))];
        });
      }
    } catch (e) {
      setError(friendlyError(e, 'Could not load more comments.'));
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore]);

  const addComment = useCallback(async (body: string, anonymous: boolean, replyTo?: ReplyTarget | null) => {
    const text = body.trim();
    if (!text || !postId || !user) return;
    const reply = replyTo && threadsAvailable ? replyTo : null;

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
      parentId: reply?.rootId ?? null,
      replyToId: reply?.id ?? null,
      replyToName: reply?.name ?? null,
      pending: true,
    };
    setComments(prev => [optimistic, ...prev]);

    const { error: insError } = await supabase.from('comments').insert({
      post_id: postId,
      author_id: user.id,
      body: text,
      is_anonymous: anonymous,
      client_id: clientId,
      // The database files the reply under the thread and names whom it
      // answers; it only needs the comment being answered.
      ...(reply ? { parent_comment_id: reply.id } : {}),
    } as never);

    if (insError) {
      setComments(prev => prev.map(c => c.id === clientId ? { ...c, pending: false, failed: true } : c));
      setError(friendlyError(insError, 'Your comment was not sent. Please try again.'));
      return;
    }
    // The realtime echo refreshes the page, which replaces the optimistic row.
    setComments(prev => prev.filter(c => c.id !== clientId));
    await refresh();
  }, [postId, user, refresh]);

  const deleteComment = useCallback(async (id: string) => {
    const previous = comments;
    setError(null);
    setComments(prev => prev.filter(c => c.id !== id));
    try {
      const { data, error: delError } = await supabase.from('comments').delete().eq('id', id).select('id');
      if (delError || !data?.length) throw new Error(delError?.message ?? 'This comment could not be deleted.');
    } catch (e) {
      setComments(previous);
      setError(friendlyError(e, 'This comment could not be deleted.'));
      throw e;
    }
  }, [comments]);

  return { comments, loading, loadingMore, hasMore, error, canReply, loadMore, addComment, deleteComment };
}

/** Learned once per page load: does the database have the RC5 thread reader? */
let threadsAvailable: boolean | undefined;

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
}

function topLevelCount(rows: PostComment[]): number {
  return rows.filter(r => !r.parentId).length;
}

/** Paging runs on top-level comments: a page brings its threads complete. */
function oldestTopLevel(rows: PostComment[]): string | null {
  const roots = rows.filter(r => !r.parentId).map(r => r.createdAt).sort();
  return roots[0] ?? (rows.length ? rows.map(r => r.createdAt).sort()[0] : null);
}
