import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { registerWorker, subscribePush, supportsPush } from '../lib/notifications/push';
import { supabase } from '../lib/supabase';
import { playNotificationChime, unlockNotificationAudio } from '../lib/useNotificationSound';
import { foregroundNotificationSoundId, incomingStudentPostSoundId } from '../lib/notifications/sound-events';
import { notificationDestination } from '../lib/notifications/destination';
import { NOTIFICATIONS_CHANGED_EVENT, type AppNotification } from '../lib/notifications/useNotifications';
import { createIncomingGate } from '../lib/notifications/incoming-gate';

const REMIND_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const RESYNC_AFTER_MS = 6 * 60 * 60 * 1000;
const lastSynced = new Map<string, number>();
const syncing = new Map<string, Promise<void>>();

function ensureSubscribed(userId: string): Promise<void> {
  const pending = syncing.get(userId);
  if (pending) return pending;
  const request = subscribePush().then(() => { lastSynced.set(userId, Date.now()); })
    .finally(() => { syncing.delete(userId); });
  syncing.set(userId, request);
  return request;
}

function reminderKey(userId: string): string { return `tp:push-remind:${userId}`; }

function reminderDue(userId: string): boolean {
  try {
    const until = Number(localStorage.getItem(reminderKey(userId)) ?? 0);
    return !Number.isFinite(until) || Date.now() >= until;
  } catch { return true; }
}

function postpone(userId: string): void {
  try { localStorage.setItem(reminderKey(userId), String(Date.now() + REMIND_AFTER_MS)); }
  catch { /* Storage may be unavailable in private browsing. */ }
}

function installed(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PushNotifications() {
  const navigate = useNavigate();
  const { user, isActivated } = useAuth();
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; body: string; url: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void registerWorker().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || !isActivated || !supportsPush()) { setOffer(false); setError(null); return; }
    const userId = user.id;
    let active = true;
    const sync = () => {
      if (!active) return;
      if (Notification.permission === 'granted') {
        setOffer(false);
        if (Date.now() - (lastSynced.get(userId) ?? 0) >= RESYNC_AFTER_MS) {
          void ensureSubscribed(userId).catch(() => {});
        }
      } else {
        setOffer(installed() && Notification.permission === 'default' && reminderDue(userId));
      }
    };
    sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; lastSynced.delete(userId); document.removeEventListener('visibilitychange', onVisible); };
  }, [user?.id, isActivated]);

  useEffect(() => {
    if (!user || !isActivated) return;
    const userId = user.id;
    let active = true;
    const notifications = createIncomingGate<{
      id: string; user_id: string; kind: AppNotification['kind']; title: string;
      body: string | null; read_at: string | null; related_post_id: string | null;
      related_conversation_id: string | null; related_message_id?: string | null;
      related_comment_id?: string | null;
    }>();
    const posts = createIncomingGate<{
      id: string; author_id: string; channel: string; title: string | null; body: string | null;
    }>();
    const show = (id: string, body: string, url: string) => {
      if (!active || document.visibilityState !== 'visible') return;
      playNotificationChime(id);
      setToast({ id, body: body.slice(0, 180), url });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 5_000);
    };
    const deliverNotification = (row: Parameters<typeof notifications.insert>[0]) => {
      if (row.user_id !== userId || row.read_at) return;
      const id = foregroundNotificationSoundId(row, document.visibilityState === 'visible');
      if (!id) return;
      const item: AppNotification = {
        id: row.id, kind: row.kind, title: row.title, body: row.body,
        relatedPostId: row.related_post_id, relatedConversationId: row.related_conversation_id,
        relatedMessageId: row.related_message_id ?? null, relatedCommentId: row.related_comment_id ?? null,
        readAt: row.read_at, createdAt: '',
      };
      show(id, [row.title, row.body].filter(Boolean).join(' · '), notificationDestination(item));
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId } }));
    };
    const deliverPost = (row: Parameters<typeof posts.insert>[0]) => {
      const id = incomingStudentPostSoundId(row, userId, document.visibilityState === 'visible');
      if (id) show(id, `New Students Community post · ${row.title || row.body || 'Open post'}`, `/post?post=${encodeURIComponent(row.id)}`);
    };
    // A subscribed socket is fast, but a short visible-only reconciliation also
    // repairs INSERT events lost while the socket reconnects or the PWA resumes.
    const reconcile = async (initial: boolean, quiet = false) => {
      const [notificationResult, postResult] = await Promise.all([
        supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabase.from('posts').select('id,author_id,channel,title,body').eq('channel', 'students').order('created_at', { ascending: false }).limit(15),
      ]);
      if (!active) return;
      if (!notificationResult.error) {
        const fresh = initial ? notifications.baseline(notificationResult.data ?? []) : notifications.poll(notificationResult.data ?? []);
        if (!quiet) fresh.forEach(deliverNotification);
        if (fresh.length) window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId } }));
      }
      if (!postResult.error) {
        const fresh = initial ? posts.baseline(postResult.data ?? []) : posts.poll(postResult.data ?? []);
        if (!quiet) fresh.forEach(deliverPost);
      }
    };
    void reconcile(true);
    const sub = supabase.channel(`app-notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, payload => {
        const fresh = notifications.insert(payload.new as Parameters<typeof notifications.insert>[0]);
        if (fresh) deliverNotification(fresh);
      })
      // Student-community posts do not create per-recipient notification rows;
      // listen app-wide so a new post still chimes while the member is elsewhere.
      // Official posts already fan out notification rows in Postgres, so excluding
      // them here prevents a second event path from sounding the same announcement.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
        const fresh = posts.insert(payload.new as Parameters<typeof posts.insert>[0]);
        if (fresh) deliverPost(fresh);
      }).subscribe(status => {
        if (active && status === 'SUBSCRIBED') void reconcile(false);
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reconcile(false);
    }, 20_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void reconcile(false, true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      setToast(null);
      clearTimeout(toastTimer.current);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(sub);
    };
  }, [user?.id, isActivated]);

  async function enable() {
    if (busy) return;
    // This executes in the Allow button's trusted click before awaiting the OS prompt.
    unlockNotificationAudio();
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      setOffer(false);
      if (permission === 'granted') {
        if (user) await ensureSubscribed(user.id);
      } else if (user && permission === 'default') postpone(user.id);
    } catch {
      setError('Notifications could not be enabled. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (busy || !user) return;
    setBusy(true);
    setError(null);
    try { await ensureSubscribed(user.id); }
    catch { setError('Notifications could not be enabled. Please try again later.'); }
    finally { setBusy(false); }
  }

  const granted = supportsPush() && Notification.permission === 'granted';
  return <>{toast && <button type="button" role="status" aria-label={`Open notification: ${toast.body}`} onClick={() => { navigate(toast.url); setToast(null); }}
    style={{ position: 'fixed', zIndex: 840, top: 'calc(10px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', width: 'min(390px, calc(100vw - 24px))', minHeight: 64, border: '1px solid var(--border)', borderRadius: 16, padding: '11px 14px', background: 'var(--surface)', color: 'var(--text-primary)', textAlign: 'left', boxShadow: '0 12px 36px rgba(0,0,0,.2)', cursor: 'pointer' }}>
    <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--accent-ink)' }}>THE TRADERS PLANET</span>
    <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, lineHeight: 1.4 }}>{toast.body}</span>
  </button>}{(offer || error) && <div role="status" style={{ position: 'fixed', zIndex: 850, bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', width: 'min(350px, calc(100vw - 32px))', borderRadius: 16, padding: '16px 17px', background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 10px 35px rgba(0,0,0,.25)', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.2px' }}>Enable Notifications</div>
    <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>{error ?? 'Get chat and community updates on this device.'}</div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 13 }}>
      <button type="button" onClick={() => { if (user && offer) postpone(user.id); setOffer(false); setError(null); }} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Not Now</button>
      {(offer || granted) && <button type="button" disabled={busy} onClick={() => void (granted ? retry() : enable())} style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{busy ? 'Enabling…' : granted ? 'Retry' : 'Allow'}</button>}
    </div>
  </div>}</>;
}
