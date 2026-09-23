import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';

/**
 * Which of several conversations currently have the other person in them.
 *
 * The list version of usePeerPresence, for the admin inbox. It reads the same
 * `chat:<conversationId>` channels the conversation screen tracks itself into,
 * so "online" means the same thing in the list as it does inside the thread.
 *
 * Like the single-thread version it subscribes WITHOUT calling track(). An
 * admin sitting on the inbox is not in anybody's thread, and announcing
 * otherwise would put a green dot on every member's screen for as long as the
 * inbox was open.
 *
 * Realtime multiplexes every channel over one WebSocket, so N conversations
 * cost N join frames rather than N sockets — but that is still work, and an
 * inbox of a thousand members would spend it on rows nobody has scrolled to.
 * Hence the cap: presence is resolved for the first PRESENCE_LIMIT threads,
 * which are the ones the ordering has already put at the top.
 */

const PRESENCE_LIMIT = 40;

export function useConversationsPresence(conversationIds: (string | null)[]): Set<string> {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  // A new array identity every render would tear down and rebuild every
  // subscription on every render; the joined string is what actually changed.
  const ids = useMemo(
    () => conversationIds.filter((id): id is string => !!id).slice(0, PRESENCE_LIMIT),
    [conversationIds],
  );
  const key = ids.join(',');

  useEffect(() => {
    setOnline(new Set());
    if (!user || !ids.length) return;

    let active = true;
    const channels = ids.map(id => {
      const channel = supabase.channel(`chat:${id}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          if (!active) return;
          const others = Object.keys(channel.presenceState()).filter(k => k !== user.id);
          setOnline(prev => {
            const has = prev.has(id);
            const should = others.length > 0;
            if (has === should) return prev;
            const next = new Set(prev);
            if (should) next.add(id); else next.delete(id);
            return next;
          });
        })
        .subscribe(status => {
          if (!active) return;
          // A dropped socket is not evidence of absence, but it is no longer
          // evidence of presence either.
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setOnline(prev => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        });

      return channel;
    });

    return () => {
      active = false;
      for (const channel of channels) supabase.removeChannel(channel);
    };
    // `key` is the real dependency; `ids` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user]);

  return online;
}
