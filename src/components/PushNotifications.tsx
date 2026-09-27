import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { isInstalledApp, registerWorker, shareLoadedAssets, supportsPush } from '../lib/notifications/push';
import { ensureSubscribed, usePushSetup } from '../lib/notifications/usePushSetup';
import { supabase } from '../lib/supabase';
import { subscribeCommunityActivity } from '../lib/community/activity';
import { playNotificationChime } from '../lib/useNotificationSound';
import { foregroundNotificationSoundId, incomingStudentPostSoundId } from '../lib/notifications/sound-events';
import { notificationDestination } from '../lib/notifications/destination';
import { NOTIFICATIONS_CHANGED_EVENT, type AppNotification } from '../lib/notifications/useNotifications';
import { createIncomingGate } from '../lib/notifications/incoming-gate';

const REMIND_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const RESYNC_AFTER_MS = 6 * 60 * 60 * 1000;
const lastSynced = new Map<string, number>();

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

export function PushNotifications() {
  const navigate = useNavigate();
  const { user, isActivated } = useAuth();
  const push = usePushSetup();
  const [offer, setOffer] = useState(false);
  const [toast, setToast] = useState<{ id: string; body: string; url: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    void registerWorker().then(registration => { if (registration) return shareLoadedAssets(); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || !isActivated) { setOffer(false); return; }
    const userId = user.id;
    let active = true;
    const sync = () => {
      if (!active) return;
      if (supportsPush() && Notification.permission === 'granted') {
        setOffer(false);
        // Background repair only; a failure shows on the Notifications screen,
        // never as a banner the member did not ask for.
        if (Date.now() - (lastSynced.get(userId) ?? 0) >= RESYNC_AFTER_MS) {
          // Stamped on the attempt: a device that cannot subscribe waits for
          // the next window instead of retrying on every return to the app.
          lastSynced.set(userId, Date.now());
          void ensureSubscribed(userId).catch(() => {});
        }
        return;
      }
      const askable = supportsPush() && Notification.permission === 'default' && isInstalledApp();
      // iPhone/iPad browser tabs cannot subscribe at all: explain installing
      // instead of offering a button that can only fail.
      const installGuide = !supportsPush() && push.availability === 'install-required';
      setOffer((askable || installGuide) && reminderDue(userId));
    };
    sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; lastSynced.delete(userId); document.removeEventListener('visibilitychange', onVisible); };
  }, [user?.id, isActivated, push.availability]);

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
      id: string; author_id?: string | null; is_mine?: boolean; channel: string; title: string | null; body: string | null;
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
        // posts_feed, not the table: anonymous posts by others are only listed
        // there, and is_mine is how an anonymous post of our own stays silent.
        supabase.rpc('posts_feed', { p_channel: 'students', p_before: null, p_limit: 15 }),
      ]);
      if (!active) return;
      if (!notificationResult.error) {
        const fresh = initial ? notifications.baseline(notificationResult.data ?? []) : notifications.poll(notificationResult.data ?? []);
        if (!quiet) fresh.forEach(deliverNotification);
        if (fresh.length) window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId } }));
      }
      if (!postResult.error) {
        const rows = ((postResult.data ?? []) as { id: string; author_id: string | null; is_mine: boolean; channel: string; title: string | null; body: string | null }[])
          .map(r => ({ id: r.id, author_id: r.author_id, is_mine: r.is_mine, channel: r.channel, title: r.title, body: r.body }));
        const fresh = initial ? posts.baseline(rows) : posts.poll(rows);
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
    // Another member's anonymous post never reaches us as a posts row; its
    // activity cue triggers the same reconciliation, which sees it via posts_feed.
    const stopActivity = subscribeCommunityActivity(`app-activity-${user.id}`, event => {
      if (active && event.subject === 'post' && event.op === 'INSERT' && event.channel === 'students') void reconcile(false);
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
      stopActivity();
      void supabase.removeChannel(sub);
    };
  }, [user?.id, isActivated]);

  const installGuide = push.status === 'install-required';
  const message = push.error ?? push.notice
    ?? (installGuide
      ? 'On iPhone, notifications work in the installed app: tap Share, then "Add to Home Screen", and open The Traders Planet from your Home Screen.'
      : 'Get chat and community updates on this device.');
  const dismiss = () => { if (user && offer) postpone(user.id); setOffer(false); push.clearMessages(); };
  const showAction = !installGuide && !push.notice && (push.status === 'ask' || push.status === 'needs-retry');

  return <>{toast && <button type="button" role="status" aria-label={`Open notification: ${toast.body}`} onClick={() => { navigate(toast.url); setToast(null); }}
    style={{ position: 'fixed', zIndex: 840, top: 'calc(10px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', width: 'min(390px, calc(100vw - 24px))', minHeight: 64, border: '1px solid var(--border)', borderRadius: 16, padding: '11px 14px', background: 'var(--surface)', color: 'var(--text-primary)', textAlign: 'left', boxShadow: '0 12px 36px rgba(0,0,0,.2)', cursor: 'pointer' }}>
    <span style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--accent-ink)' }}>THE TRADERS PLANET</span>
    <span style={{ display: 'block', marginTop: 3, fontSize: 12.5, lineHeight: 1.4 }}>{toast.body}</span>
  </button>}{(offer || push.error || push.notice) && <div role="status" style={{ position: 'fixed', zIndex: 850, bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', width: 'min(350px, calc(100vw - 32px))', borderRadius: 16, padding: '16px 17px', background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 10px 35px rgba(0,0,0,.25)', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.2px' }}>{push.notice ? 'Notifications Enabled' : installGuide ? 'Get Notifications' : 'Enable Notifications'}</div>
    <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>{message}</div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 13 }}>
      <button type="button" onClick={dismiss} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{push.notice ? 'Done' : installGuide ? 'Got It' : 'Not Now'}</button>
      {showAction && <button type="button" disabled={push.busy} onClick={() => void push.enable()} style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{push.busy ? 'Enabling…' : push.status === 'needs-retry' ? 'Retry' : 'Allow'}</button>}
    </div>
  </div>}</>;
}
