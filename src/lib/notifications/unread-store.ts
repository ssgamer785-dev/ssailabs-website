import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import { NOTIFICATIONS_CHANGED_EVENT } from './events';

/**
 * ONE source of the unread count for the whole page: the sidebar badge, the
 * app icon badge and anything else read this, so there is one Realtime
 * channel per signed-in member no matter how many screens show the number
 * (two channels with the same name cannot both subscribe).
 *
 * The count is asked of the database (my_unread_notification_count), never
 * tallied locally, so it is the same on every device the member is signed in
 * on. It is refreshed when any of the member's notification rows change, when
 * this device learns of a change, when the page becomes visible again and
 * when the connection returns.
 */
type Listener = (count: number) => void;

interface Store {
  userId: string;
  count: number;
  listeners: Set<Listener>;
  channel: RealtimeChannel | null;
  debounce: ReturnType<typeof setTimeout> | undefined;
  dispose: () => void;
  refresh: () => void;
}

let store: Store | null = null;

function announce(target: Store): void {
  target.listeners.forEach(listener => listener(target.count));
}

function createStore(userId: string): Store {
  const target: Store = { userId, count: 0, listeners: new Set(), channel: null, debounce: undefined, dispose: () => {}, refresh: () => {} };
  let active = true;

  const load = async () => {
    const { data, error } = await supabase.rpc('my_unread_notification_count');
    if (!active || error) return;
    const next = Number(data) || 0;
    if (next !== target.count) { target.count = next; announce(target); }
  };
  // A burst of row changes (mark all read, a fan-out) asks once.
  target.refresh = () => {
    clearTimeout(target.debounce);
    target.debounce = setTimeout(() => { void load(); }, 150);
  };

  const onChanged = (event: Event) => {
    if ((event as CustomEvent<{ userId?: string }>).detail?.userId === userId) target.refresh();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') target.refresh(); };
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  window.addEventListener('online', target.refresh);
  document.addEventListener('visibilitychange', onVisible);

  target.channel = supabase.channel(`notification-unread-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => target.refresh())
    .subscribe(status => { if (status === 'SUBSCRIBED') target.refresh(); });

  target.dispose = () => {
    active = false;
    clearTimeout(target.debounce);
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.removeEventListener('online', target.refresh);
    document.removeEventListener('visibilitychange', onVisible);
    if (target.channel) void supabase.removeChannel(target.channel);
  };
  void load();
  return target;
}

/** Calls `listener` now and on every change; returns the unsubscribe. */
export function subscribeUnreadCount(userId: string, listener: Listener): () => void {
  if (store && store.userId !== userId) { store.dispose(); store = null; }
  if (!store) store = createStore(userId);
  const current = store;
  current.listeners.add(listener);
  listener(current.count);
  return () => {
    current.listeners.delete(listener);
    // Kept alive across a screen change (unmount then mount) and torn down after.
    setTimeout(() => {
      if (store === current && current.listeners.size === 0) { current.dispose(); store = null; }
    }, 1000);
  };
}

/** Only for tests. */
export function resetUnreadStoreForTests(): void {
  store?.dispose();
  store = null;
}

/** The unread number for this member; 0 when signed out. */
export function useUnreadNotificationCount(): number {
  const { user } = useAuth();
  const userId = user?.id;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!userId) { setCount(0); return; }
    return subscribeUnreadCount(userId, setCount);
  }, [userId]);
  return count;
}
