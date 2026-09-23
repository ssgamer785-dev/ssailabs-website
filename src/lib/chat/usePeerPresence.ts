import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';

/**
 * Whether the other side of a conversation is actually in it right now.
 *
 * This exists because the Chat list used to draw a green dot and the word
 * "Online" unconditionally — markup, not a fact. It said the admin was
 * available at three in the morning, and a member who wrote in on the strength
 * of it got silence. A status that is always true carries no information, and
 * the one it happens to give is the misleading one.
 *
 * It reads the same `chat:<conversationId>` Realtime channel the conversation
 * screen tracks itself into, so "online" here means precisely what it means
 * there: the peer has that thread open.
 *
 * It deliberately does NOT call channel.track(). Joining to look is a read;
 * joining to announce yourself would make sitting on the Chat list broadcast
 * you as present in a thread you have not opened, which would put the same lie
 * on the other person's screen from the other direction.
 */
export function usePeerPresence(conversationId: string | null | undefined): boolean {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);

  useEffect(() => {
    setOnline(false);
    if (!conversationId || !user) return;

    let active = true;
    const channel = supabase.channel(`chat:${conversationId}`, {
      // The key must match the conversation screen's, or our own entry (if one
      // ever appeared) could not be told apart from the peer's.
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        if (!active) return;
        const others = Object.keys(channel.presenceState()).filter(key => key !== user.id);
        setOnline(others.length > 0);
      })
      .subscribe(status => {
        if (!active) return;
        // A dropped socket is not evidence of absence, but claiming presence
        // through one is worse than claiming nothing.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setOnline(false);
        }
      });

    return () => { active = false; supabase.removeChannel(channel); };
  }, [conversationId, user]);

  return online;
}
