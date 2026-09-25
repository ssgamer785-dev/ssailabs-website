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
  const { notifications, loading, error, markRead, markAllRead, refresh } = useNotifications();
  useRefreshHandler(refresh);
  const [notifCat, setNotifCat] = useState<typeof NCATS[number]>('All');

  const isUnread = (n: AppNotification) => !n.readAt;

  function Rows({ when }: { when: 'today' | 'earlier' }) {
    const list = notifications.filter(n =>
      (when === 'today' ? isToday(n.createdAt) : !isToday(n.createdAt))
      && (notifCat === 'All' || categoryOf(n.kind) === notifCat));
    if (!list.length) return <div style={css('padding:10px 20px;font-size:13px;color:var(--text-faint)')}>Nothing here yet.</div>;
    return (
      <>
        {list.map(n => {
          const unread = isUnread(n);
          return (
            <div key={n.id} role="link" tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') { void markRead(n.id); navigate(notificationDestination(n)); } }} onClick={() => { void markRead(n.id); navigate(notificationDestination(n)); }} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', cursor: 'pointer', background: unread ? 'var(--accent-tint-2)' : 'transparent', borderLeft: unread ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <NotifIcon kind={n.kind} />
              <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
                <div style={{ fontSize: 13.5, fontWeight: unread ? 700 : 600, letterSpacing: '-.2px', lineHeight: 1.35 }}>{n.title}</div>
                <div style={css('font-size:12.5px;color:var(--text-muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{n.body}</div>
              </div>
              <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
                <div style={{ fontSize: 11, color: unread ? 'var(--accent-ink)' : 'var(--text-faint)', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap' }}>{whenLabel(n.createdAt)}</div>
                {unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
              </div>
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
        <div onClick={markAllRead} style={css('font-size:12.5px;font-weight:600;color:var(--accent-ink);cursor:pointer;flex:none;white-space:nowrap')}>Mark all read</div>
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
        <Rows when="today" />
        <div style={css('flex:none;padding:16px 20px 9px;font-size:11px;font-weight:700;color:var(--text-faint);letter-spacing:.07em;white-space:nowrap')}>EARLIER</div>
        <Rows when="earlier" />
        <div style={css('height:16px;flex:none')} />
        </>
        )}
      </div>
      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
