import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { registerWorker, subscribePush, supportsPush } from '../lib/notifications/push';
import { supabase } from '../lib/supabase';
import { playNotificationChime } from '../lib/useNotificationSound';

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
    if (!user || !isActivated || !supportsPush()) { setOffer(false); return; }
    if (Notification.permission === 'granted') {
      void subscribePush().catch(() => {});
      setOffer(false);
    } else {
      setOffer(installed() && Notification.permission === 'default');
    }
  }, [user?.id, isActivated]);

  useEffect(() => {
    if (!user || !isActivated) return;
    const sub = supabase.channel(`app-notifications-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, payload => {
        const row = payload.new as { id?: string; read_at?: string | null };
        if (row.id && !row.read_at && document.visibilityState === 'visible') playNotificationChime(row.id);
      }).subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [user?.id, isActivated]);

  async function enable() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      setOffer(false);
      if (permission === 'granted') await subscribePush();
    } catch {
      setError('Notifications could not be enabled. Please try again later.');
    } finally {
      setBusy(false);
    }
  }

  if (!offer && !error) return null;
  return <div role="status" style={{ position: 'fixed', zIndex: 1000, bottom: 'calc(20px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', width: 'min(350px, calc(100vw - 32px))', borderRadius: 16, padding: 14, background: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 10px 35px rgba(0,0,0,.25)', border: '1px solid var(--border)' }}>
    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{error ?? 'Get chat and community updates on this device.'}</div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 9 }}>
      <button type="button" onClick={() => { setOffer(false); setError(null); }} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Later</button>
      {offer && <button type="button" disabled={busy} onClick={() => void enable()} style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>{busy ? 'Enabling…' : 'Enable notifications'}</button>}
    </div>
  </div>;
}
