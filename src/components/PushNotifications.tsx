import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { registerWorker, subscribePush, supportsPush } from '../lib/notifications/push';
import { supabase } from '../lib/supabase';
import { playNotificationChime, unlockNotificationAudio } from '../lib/useNotificationSound';
import { foregroundNotificationSoundId, incomingStudentPostSoundId } from '../lib/notifications/sound-events';

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
  const { user, isActivated } = useAuth();
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const sub = supabase.channel(`app-notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, payload => {
        const id = foregroundNotificationSoundId(payload.new as { id?: string; read_at?: string | null }, document.visibilityState === 'visible');
        if (id) playNotificationChime(id);
      })
      // Student-community posts do not create per-recipient notification rows;
      // listen app-wide so a new post still chimes while the member is elsewhere.
      // Official posts already fan out notification rows in Postgres, so excluding
      // them here prevents a second event path from sounding the same announcement.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
        const id = incomingStudentPostSoundId(payload.new as { id?: string; author_id?: string; channel?: string }, user.id, document.visibilityState === 'visible');
        if (id) playNotificationChime(id);
      }).subscribe();
    return () => { void supabase.removeChannel(sub); };
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

  if (!offer && !error) return null;
  const granted = supportsPush() && Notification.permission === 'granted';
  return <div role="status" style={{ position: 'fixed', zIndex: 850, bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', width: 'min(350px, calc(100vw - 32px))', borderRadius: 16, padding: '16px 17px', background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 10px 35px rgba(0,0,0,.25)', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.2px' }}>Enable Notifications</div>
    <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>{error ?? 'Get chat and community updates on this device.'}</div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 13 }}>
      <button type="button" onClick={() => { if (user && offer) postpone(user.id); setOffer(false); setError(null); }} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Not Now</button>
      {(offer || granted) && <button type="button" disabled={busy} onClick={() => void (granted ? retry() : enable())} style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{busy ? 'Enabling…' : granted ? 'Retry' : 'Allow'}</button>}
    </div>
  </div>;
}
