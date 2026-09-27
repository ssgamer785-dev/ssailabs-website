import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { PostChannel } from '../database.types';
import { fetchFeedPage, type FeedPost } from './useFeed';

/**
 * What Home shows: the newest Official post, and the two most recent posts
 * after it.
 *
 * Home is a summary, not a feed — it renders three rows in total — so it asks
 * for three rows per channel rather than pulling a Community page and throwing
 * most of it away. The extras are headroom: the hero comes out of the Official
 * results, and whatever is left merges with the student posts so the two
 * "Recent Posts" slots are still filled when the newest few posts all happen to
 * be official.
 *
 * Everything here goes through `fetchFeedPage`, the same `posts_feed` RPC the
 * Community screen uses, so permissions, anonymity and attachment metadata
 * behave identically in both places.
 */

/** Enough to fill one hero + two rows even when one channel is empty. */
const PER_CHANNEL = 3;
const RECENT_SLOTS = 2;

const CHANNELS: PostChannel[] = ['official', 'students'];

export interface HomeHighlights {
  /** Newest Official post, or null when there are none yet. */
  official: FeedPost | null;
  /** The next most recent posts across both channels, hero excluded. */
  recent: FeedPost[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function newestFirst(a: FeedPost, b: FeedPost): number {
  const byTime = b.createdAt.localeCompare(a.createdAt);
  // Ties broken on id so the order never flickers between two posts written in
  // the same millisecond.
  return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
}

export function useHomeHighlights(): HomeHighlights {
  const { user } = useAuth();
  const [official, setOfficial] = useState<FeedPost | null>(null);
  const [recent, setRecent] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Collapses a burst of Realtime events into one refetch. */
  const pendingReload = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /**
   * One load at a time. Mounting and subscribing can both ask for the data
   * within the same tick, and a burst of Realtime events can ask again while
   * the first request is still out. Overlapping requests are collapsed into
   * the one in flight, plus a single re-run if anything asked during it — so
   * the last answer is always current without firing a query per trigger.
   */
  const inFlight = useRef<Promise<void> | null>(null);
  const staleWhileLoading = useRef(false);

  const fetchInto = useCallback(async () => {
    try {
      const [officialPosts, studentPosts] = await Promise.all(
        CHANNELS.map(channel => fetchFeedPage(channel, null, PER_CHANNEL)),
      );

      const hero = officialPosts[0] ?? null;
      const rest = [...officialPosts.slice(1), ...studentPosts].sort(newestFirst);

      setOfficial(hero);
      setRecent(rest.slice(0, RECENT_SLOTS));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the latest posts.');
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      // Something changed mid-request; take the current answer, then redo it.
      staleWhileLoading.current = true;
      return inFlight.current;
    }

    const run = (async () => {
      await fetchInto();
      inFlight.current = null;
      if (staleWhileLoading.current) {
        staleWhileLoading.current = false;
        await load();
      }
    })();

    inFlight.current = run;
    return run;
  }, [fetchInto]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    load().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  // ---- realtime ------------------------------------------------------------

  useEffect(() => {
    if (!user) return;
    let active = true;

    const applyDelete = (id: string) => {
      // Drop it immediately so a deleted post cannot linger on screen, then
      // refill the slot it left behind.
      setOfficial(prev => (prev?.id === id ? null : prev));
      setRecent(prev => prev.filter(p => p.id !== id));
    };

    const scheduleReload = () => {
      clearTimeout(pendingReload.current);
      pendingReload.current = setTimeout(() => { if (active) void load(); }, 250);
    };

    const channel = supabase
      .channel('home:highlights')
      // Posts only. Home shows no like or comment counts, so subscribing to
      // those tables would be traffic with nothing to update.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
        if (!active) return;

        if (payload.eventType === 'DELETE') {
          applyDelete((payload.old as { id: string }).id);
          scheduleReload();
          return;
        }
        // An insert or edit is re-read rather than merged from the payload:
        // the row on the wire has no author name, counts or `liked_by_me`,
        // and those come resolved from posts_feed. It is three rows per
        // channel, not a feed page.
        scheduleReload();
      })
      .subscribe();

    return () => {
      active = false;
      clearTimeout(pendingReload.current);
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  return { official, recent, loading, error, reload: load };
}
