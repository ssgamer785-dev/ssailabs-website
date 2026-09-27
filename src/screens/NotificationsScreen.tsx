import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useNotifications, type AppNotification } from '../lib/notifications/useNotifications';
import type { NotificationKind } from '../lib/database.types';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { notificationDestination } from '../lib/notifications/destination';

const NCATS = ['All', 'Community', 'Chat'] as const;

const ICONS: Record<NotificationKind, [string, string, string]> = {
  signal: ['var(--accent-soft)', 'var(--accent-ink)', 'M4.2 16.8 9 11.4l3.4 3.2 2.7-2.6 4.7 4.6M14.6 5.2h5v5'],
  target: ['var(--success-soft)', 'var(--success-ink)', 'M12 3.6v16.8M12 3.6l4 4M12 3.6l-4 4M5 20.4h14'],
  like: ['var(--danger-soft)', 'var(--danger-ink)', 'M12 20.4S4.3 15.2 4.3 10a4.3 4.3 0 0 1 7.7-2.6A4.3 4.3 0 0 1 19.7 10c0 5.2-7.7 10.4-7.7 10.4z'],
  comment: ['var(--violet-soft)', 'var(--violet-ink)', 'M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z'],
  chat: ['var(--accent-soft)', 'var(--accent-ink)', 'M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z'],
  session: ['var(--warning-soft-3)', 'var(--warning-ink)', 'M12 7.4v5l3.4 2M12 3.9a8.1 8.1 0 1 1 0 16.2 8.1 8.1 0 0 1 0-16.2z'],
};

function NotifIcon({ kind }: { kind: NotificationKind }) {
  const [bg, stroke, d] = ICONS[kind];
  return (
    <div style={{ width: 42, height: 42, borderRadius: 13, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </div>
  );
}

/** Categorises a notification kind into the screen's existing chip filters. */
function categoryOf(kind: NotificationKind): 'Community' | 'Chat' | 'Signals' {
  if (kind === 'like' || kind === 'comment' || kind === 'session') return 'Community';
  if (kind === 'chat') return 'Chat';
  return 'Signals';
}

/** The design splits the list into TODAY and EARLIER. */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

/** "8:02 AM" today, "Yesterday", else a short date — matches the mock's style. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(iso)) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

export function NotificationsScreen() {
  const navigate = useNavigate();
  const { notifications, loading, error, markRead, markAllRead, deleteNotification, deleteAllNotifications, refresh } = useNotifications();
  useRefreshHandler(refresh);
  const [notifCat, setNotifCat] = useState<typeof NCATS[number]>('All');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const isUnread = (n: AppNotification) => !n.readAt;

  async function removeNotification(id: string) {
    setDeletingId(id);
    setFeedback('Deleting notification…');
    try {
      await deleteNotification(id);
      setFeedback('Notification deleted.');
    } catch {
      setFeedback('The notification could not be deleted. Please retry.');
    } finally {
      setDeletingId(null);
    }
  }

  async function clearAllNotifications() {
    setDeletingAll(true);
    setFeedback('Clearing notifications…');
    try {
      await deleteAllNotifications();
      setConfirmClearAll(false);
      setFeedback('All notifications cleared.');
    } catch {
      setFeedback('Notifications could not be cleared. Please retry.');
    } finally {
      setDeletingAll(false);
    }
  }

  function renderRows(when: 'today' | 'earlier') {
    const list = notifications.filter(n =>
      (when === 'today' ? isToday(n.createdAt) : !isToday(n.createdAt))
      && (notifCat === 'All' || categoryOf(n.kind) === notifCat));
    if (!list.length) return <div style={css('padding:10px 20px;font-size:13px;color:var(--text-faint)')}>Nothing here yet.</div>;
    return (
      <>
        {list.map(n => {
          const unread = isUnread(n);
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'stretch', gap: 2, padding: '4px 12px 4px 0', background: unread ? 'var(--accent-tint-2)' : 'transparent', borderLeft: unread ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <button type="button" aria-label={`Open notification: ${n.title}`} onClick={() => { void markRead(n.id); navigate(notificationDestination(n)); }} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 4px 8px 17px', color: 'inherit', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
                <NotifIcon kind={n.kind} />
                <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
                  <div style={{ fontSize: 13.5, fontWeight: unread ? 700 : 600, letterSpacing: '-.2px', lineHeight: 1.35 }}>{n.title}</div>
                  <div style={css('font-size:12.5px;color:var(--text-muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{n.body}</div>
                </div>
                <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
                  <div style={{ fontSize: 11, color: unread ? 'var(--accent-ink)' : 'var(--text-faint)', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap' }}>{whenLabel(n.createdAt)}</div>
                  {unread && <div aria-label="Unread" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                </div>
              </button>
              <button type="button" aria-label={`Delete notification: ${n.title}`} title="Delete notification" disabled={!!deletingId || deletingAll} onClick={() => void removeNotification(n.id)} style={{ width: 44, minHeight: 44, flex: 'none', alignSelf: 'center', display: 'grid', placeItems: 'center', border: 0, borderRadius: 12, color: 'var(--text-faint)', background: 'transparent', cursor: deletingAll || deletingId ? 'wait' : 'pointer', opacity: deletingAll || deletingId ? .5 : 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback="/home" />
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Notifications</div>
        <div style={css('width:42px;flex:none')} />
      </div>
      <div style={css('flex:none;min-height:38px;padding:1px 20px 3px;display:flex;align-items:center;justify-content:flex-end;gap:16px')}>
        {feedback && <div role="status" aria-live="polite" style={css('flex:1;min-width:0;font-size:11.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{feedback}</div>}
        <button type="button" onClick={() => void markAllRead()} style={css('padding:7px 0;border:0;background:transparent;color:var(--accent-ink);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap')}>Mark all read</button>
        <button type="button" disabled={!notifications.length || deletingAll || !!deletingId} onClick={() => setConfirmClearAll(true)} style={{ padding: '7px 0', display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', color: notifications.length ? 'var(--danger-ink)' : 'var(--text-faint)', fontSize: 12, fontWeight: 600, cursor: notifications.length && !deletingAll && !deletingId ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>
          Clear all
        </button>
      </div>
      <div style={css('flex:none;padding:4px 20px 0;display:flex;gap:9px;overflow:hidden')}>
        {NCATS.map(c => {
          const on = notifCat === c;
          const count = c === 'All'
            ? notifications.filter(isUnread).length
            : notifications.filter(n => categoryOf(n.kind) === c && isUnread(n)).length;
          return (
            <div key={c} onClick={() => setNotifCat(c)} style={{ height: 34, padding: '0 14px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none', background: on ? 'var(--accent)' : 'var(--surface-secondary)', color: on ? 'var(--on-accent)' : 'var(--text-tertiary)', boxShadow: on ? '0 4px 12px rgba(11,95,239,.26)' : 'none' }}>
              {c}
              {count > 0 && <div style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, lineHeight: 1, background: on ? 'rgba(255,255,255,.24)' : 'var(--accent-soft-2)', color: on ? 'var(--on-accent)' : 'var(--accent-ink)' }}>{count}</div>}
            </div>
          );
        })}
      </div>
      <div className="nav-space" style={css('flex:1;min-height:0;padding:16px 0 0;display:flex;flex-direction:column;overflow-y:auto')}>
        {error && (
          <div style={css('padding:10px 20px;font-size:12px;color:var(--danger-ink);line-height:1.4')}>{error}</div>
        )}
        {loading ? (
          <div style={css('flex:1;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:var(--text-faint)')}>Loading notifications…</div>
        ) : notifications.length === 0 ? (
          <div style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:var(--text-faint);line-height:1.5;padding:0 34px')}>
            You're all caught up. New signals, replies and likes will show up here.
          </div>
        ) : (
        <>
        <div style={css('flex:none;padding:0 20px 9px;font-size:11px;font-weight:700;color:var(--text-faint);letter-spacing:.07em;white-space:nowrap')}>TODAY</div>
        {renderRows('today')}
        <div style={css('flex:none;padding:16px 20px 9px;font-size:11px;font-weight:700;color:var(--text-faint);letter-spacing:.07em;white-space:nowrap')}>EARLIER</div>
        {renderRows('earlier')}
        <div style={css('height:16px;flex:none')} />
        </>
        )}
      </div>
      <AuthenticatedBottomNav />
      {confirmClearAll && (
        <div onMouseDown={event => { if (event.target === event.currentTarget && !deletingAll) setConfirmClearAll(false); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22, background: 'rgba(7, 15, 31, .52)', backdropFilter: 'blur(4px)' }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="clear-notifications-title" aria-describedby="clear-notifications-description" style={{ width: '100%', maxWidth: 360, padding: 22, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--surface)', boxShadow: '0 20px 60px rgba(0,0,0,.24)' }}>
            <div style={css('font-size:16px;font-weight:700;letter-spacing:-.25px')} id="clear-notifications-title">Clear all notifications?</div>
            <div id="clear-notifications-description" style={css('margin-top:8px;font-size:13px;color:var(--text-muted);line-height:1.5')}>This removes notifications from your account only. Messages and community posts will not be deleted.</div>
            <div style={css('display:flex;justify-content:flex-end;gap:10px;margin-top:22px')}>
              <button type="button" autoFocus disabled={deletingAll} onClick={() => setConfirmClearAll(false)} style={css('min-height:42px;padding:0 15px;border:1px solid var(--border);border-radius:11px;background:var(--surface-secondary);color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer')}>Cancel</button>
              <button type="button" disabled={deletingAll} onClick={() => void clearAllNotifications()} style={css('min-height:42px;padding:0 15px;border:0;border-radius:11px;background:var(--danger-ink);color:white;font-size:13px;font-weight:650;cursor:pointer;opacity:' + (deletingAll ? '.7' : '1'))}>{deletingAll ? 'Clearing…' : 'Clear all'}</button>
            </div>
          </section>
        </div>
      )}
    </PhoneShell>
  );
}
