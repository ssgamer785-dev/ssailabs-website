import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useNotifications, type AppNotification } from '../lib/notifications/useNotifications';
import { INBOX_FILTERS, inFilter, type InboxFilterKey, type NotificationCategory } from '../lib/notifications/categories';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { PushSettingsCard } from '../components/notifications/PushSettingsCard';
import { PreferencesCard } from '../components/notifications/PreferencesCard';
import { notificationDestination } from '../lib/notifications/destination';
import { relativeTime } from '../lib/notifications/relative-time';

/** Icon plate and stroke per category: [background, stroke, path]. */
const ICONS: Record<NotificationCategory, [string, string, string]> = {
  direct_messages: ['var(--accent-soft)', 'var(--accent-ink)', 'M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z'],
  official_announcements: ['var(--accent-soft)', 'var(--accent-ink)', 'M4 10.2v3.6h3.1L13 18.2V5.8L7.1 10.2H4zM16.4 9.4a4.1 4.1 0 0 1 0 5.2M18.7 7a7.4 7.4 0 0 1 0 10'],
  community_posts: ['var(--success-soft)', 'var(--success-ink)', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.4 19.2c0-3 2.5-5.2 5.6-5.2s5.6 2.2 5.6 5.2M16.2 5.3a3 3 0 0 1 0 5.6M17 14.2c2.2.5 3.8 2.3 3.8 5'],
  comments: ['var(--violet-soft)', 'var(--violet-ink)', 'M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z'],
  likes: ['var(--danger-soft)', 'var(--danger-ink)', 'M12 20.4S4.3 15.2 4.3 10a4.3 4.3 0 0 1 7.7-2.6A4.3 4.3 0 0 1 19.7 10c0 5.2-7.7 10.4-7.7 10.4z'],
  system: ['var(--warning-soft-3)', 'var(--warning-ink)', 'M12 3.5l7 2.6v5.4c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.1zM9 12l2.2 2.2L15.2 10'],
};

const SOURCE: Record<NotificationCategory, string> = {
  direct_messages: 'Direct message',
  official_announcements: 'Official announcement',
  community_posts: 'Students Community',
  comments: 'Your post',
  likes: 'Your post',
  system: 'System',
};

const EMPTY_TITLE: Record<InboxFilterKey, string> = {
  all: 'Nothing here yet.', messages: 'No messages yet.', announcements: 'No announcements yet.', community: 'No community activity yet.', system: 'No system notices.',
};

function NotifIcon({ category }: { category: NotificationCategory }) {
  const [bg, stroke, d] = ICONS[category];
  return (
    <div aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 13, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </div>
  );
}

/** The design splits the list into TODAY and EARLIER. */
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

type Tab = 'inbox' | 'settings';

export function NotificationsScreen() {
  const navigate = useNavigate();
  const { notifications, loading, error, markRead, markAllRead, deleteNotification, deleteAllNotifications, refresh, hasMore, loadingMore, loadMore } = useNotifications();
  useRefreshHandler(refresh);
  const [tab, setTab] = useState<Tab>('inbox');
  const [filter, setFilter] = useState<InboxFilterKey>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  // "5m ago" moves on while the screen stays open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const isUnread = (n: AppNotification) => !n.readAt;
  const unreadTotal = useMemo(() => notifications.filter(isUnread).length, [notifications]);
  const visible = useMemo(
    () => notifications.filter(n => inFilter(filter, n.category) && (!unreadOnly || isUnread(n))),
    [notifications, filter, unreadOnly],
  );

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
    const list = visible.filter(n => (when === 'today' ? isToday(n.createdAt) : !isToday(n.createdAt)));
    if (!list.length) return null;
    return (
      <>
        <div style={css('flex:none;padding:' + (when === 'today' ? '0' : '16px') + ' 20px 9px;font-size:11px;font-weight:700;color:var(--text-muted);letter-spacing:.07em;white-space:nowrap')}>{when === 'today' ? 'TODAY' : 'EARLIER'}</div>
        {list.map(n => {
          const unread = isUnread(n);
          return (
            <div key={n.id} data-testid="notification-row" data-unread={unread ? 'true' : 'false'} style={{ display: 'flex', alignItems: 'stretch', gap: 2, padding: '4px 12px 4px 0', background: unread ? 'var(--accent-tint-2)' : 'transparent', borderLeft: unread ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <button type="button" aria-label={`Open notification: ${n.title}`} onClick={() => { void markRead(n.id); navigate(notificationDestination(n)); }} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 4px 8px 17px', color: 'inherit', textAlign: 'left', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
                <NotifIcon category={n.category} />
                <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
                  <div style={{ fontSize: 13.5, fontWeight: unread ? 700 : 600, letterSpacing: '-.2px', lineHeight: 1.35 }}>{n.title}</div>
                  {n.body && <div style={css('font-size:12.5px;color:var(--text-muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{n.body}</div>}
                  <div style={css('font-size:11px;color:var(--text-muted);line-height:1.3')}>{SOURCE[n.category]}</div>
                </div>
                <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
                  <div style={{ fontSize: 11, color: unread ? 'var(--accent-ink)' : 'var(--text-muted)', fontWeight: unread ? 600 : 400, whiteSpace: 'nowrap' }}>{relativeTime(n.createdAt, now)}</div>
                  {unread && <div aria-label="Unread" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />}
                </div>
              </button>
              <button type="button" aria-label={`Delete notification: ${n.title}`} title="Delete notification" disabled={!!deletingId || deletingAll} onClick={() => void removeNotification(n.id)} style={{ width: 44, minHeight: 44, flex: 'none', alignSelf: 'center', display: 'grid', placeItems: 'center', border: 0, borderRadius: 12, color: 'var(--text-muted)', background: 'transparent', cursor: deletingAll || deletingId ? 'wait' : 'pointer', opacity: deletingAll || deletingId ? .5 : 1 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          );
        })}
      </>
    );
  }

  const tabButton = (key: Tab, label: string, badge?: number) => {
    const on = tab === key;
    return (
      <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={on} aria-controls={`panel-${key}`} onClick={() => setTab(key)}
        style={{ flex: 1, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 0, borderRadius: 11, fontSize: 13.5, fontWeight: on ? 700 : 600, cursor: 'pointer', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: on ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>
        {label}
        {!!badge && badge > 0 && <span style={{ minWidth: 19, height: 19, padding: '0 6px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, lineHeight: 1, background: 'var(--accent)', color: 'var(--on-accent)' }}>{badge > 99 ? '99+' : badge}</span>}
      </button>
    );
  };

  const chipCount = (key: InboxFilterKey) => notifications.filter(n => isUnread(n) && inFilter(key, n.category)).length;

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback="/home" />
        <h1 style={css('flex:1;margin:0;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Notifications</h1>
        <div style={css('width:42px;flex:none')} />
      </div>
      <div className="nav-space" style={css('flex:1;min-height:0;padding:8px 0 0;display:flex;flex-direction:column;overflow-y:auto')}>
        <PushSettingsCard />
        <div role="tablist" aria-label="Notifications" style={css('flex:none;margin:0 20px 12px;padding:4px;display:flex;gap:4px;border-radius:14px;background:var(--surface-secondary)')}>
          {tabButton('inbox', 'Inbox', unreadTotal)}
          {tabButton('settings', 'Settings')}
        </div>

        {tab === 'settings' ? (
          <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings"><PreferencesCard /></div>
        ) : (
          <div role="tabpanel" id="panel-inbox" aria-labelledby="tab-inbox" style={css('display:flex;flex-direction:column;flex:1;min-height:0')}>
            <div style={css('flex:none;padding:0 20px 8px;display:flex;align-items:center;gap:8px')}>
              <div role="group" aria-label="Show" style={css('display:flex;padding:3px;border-radius:11px;background:var(--surface-secondary);gap:2px')}>
                {([['all', 'All'], ['unread', 'Unread']] as const).map(([key, label]) => {
                  const on = (key === 'unread') === unreadOnly;
                  return <button key={key} type="button" aria-pressed={on} onClick={() => setUnreadOnly(key === 'unread')} style={{ minHeight: 32, padding: '0 12px', border: 0, borderRadius: 9, fontSize: 12.5, fontWeight: on ? 700 : 600, cursor: 'pointer', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-tertiary)', boxShadow: on ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>{label}{key === 'unread' && unreadTotal > 0 ? ` (${unreadTotal > 99 ? '99+' : unreadTotal})` : ''}</button>;
                })}
              </div>
              <div style={css('flex:1;min-width:0;text-align:right;display:flex;justify-content:flex-end;gap:14px;align-items:center')}>
                <button type="button" onClick={() => void markAllRead()} disabled={unreadTotal === 0} style={css('padding:7px 0;border:0;background:transparent;color:var(--accent-ink);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;opacity:' + (unreadTotal === 0 ? '.45' : '1'))}>Mark all read</button>
                <button type="button" disabled={!notifications.length || deletingAll || !!deletingId} onClick={() => setConfirmClearAll(true)} style={{ padding: '7px 0', display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', color: notifications.length ? 'var(--danger-text)' : 'var(--text-faint)', fontSize: 12, fontWeight: 600, cursor: notifications.length && !deletingAll && !deletingId ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></svg>
                  Clear all
                </button>
              </div>
            </div>
            <div style={css('flex:none;padding:0 20px 6px;min-height:20px;font-size:11.5px;color:var(--text-muted)')}>
              {feedback && <div role="status" aria-live="polite" style={css('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{feedback}</div>}
            </div>
            <div role="group" aria-label="Type" style={css('flex:none;padding:2px 20px 12px;display:flex;gap:9px;overflow-x:auto')}>
              {INBOX_FILTERS.map(f => {
                const on = filter === f.key;
                const count = chipCount(f.key);
                return (
                  <button key={f.key} type="button" aria-pressed={on} onClick={() => setFilter(f.key)} style={{ height: 34, padding: '0 14px', border: 0, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none', background: on ? 'var(--accent)' : 'var(--surface-secondary)', color: on ? 'var(--on-accent)' : 'var(--text-tertiary)', boxShadow: on ? '0 4px 12px rgba(11,95,239,.26)' : 'none' }}>
                    {f.label}
                    {count > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, lineHeight: 1, background: on ? 'rgba(255,255,255,.24)' : 'var(--accent-soft-2)', color: on ? 'var(--on-accent)' : 'var(--accent-ink)' }}>{count > 99 ? '99+' : count}</span>}
                  </button>
                );
              })}
            </div>
            {error && (
              <div role="alert" style={css('padding:10px 20px;font-size:12px;color:var(--danger-text);line-height:1.4;display:flex;align-items:center;gap:10px')}>
                <span style={css('flex:1')}>{error}</span>
                <button type="button" onClick={() => void refresh()} style={css('flex:none;min-height:36px;padding:0 12px;border-radius:10px;font-size:12px;font-weight:700;color:var(--accent);cursor:pointer')}>Retry</button>
              </div>
            )}
            {loading ? (
              <div style={css('padding:36px 20px;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:var(--text-muted)')}>Loading notifications…</div>
            ) : notifications.length === 0 && error ? null : notifications.length === 0 ? (
              <div style={css('padding:36px 34px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:var(--text-muted);line-height:1.5')}>
                You&apos;re all caught up. Messages, announcements and comments will show up here.
              </div>
            ) : visible.length === 0 ? (
              <div style={css('padding:30px 34px;text-align:center;font-size:12.5px;color:var(--text-muted);line-height:1.5')}>
                {unreadOnly ? (filter === 'all' ? 'No unread notifications.' : `No unread notifications in ${INBOX_FILTERS.find(f => f.key === filter)?.label}.`) : EMPTY_TITLE[filter]}
              </div>
            ) : (
              <>
                {renderRows('today')}
                {renderRows('earlier')}
                {hasMore && (
                  <button type="button" onClick={() => void loadMore()} disabled={loadingMore}
                    style={css('flex:none;margin:10px auto 0;min-height:44px;padding:0 18px;font-size:12.5px;font-weight:600;color:var(--accent-ink);cursor:pointer')}>
                    {loadingMore ? 'Loading…' : 'Load earlier notifications'}
                  </button>
                )}
              </>
            )}
            <div style={css('height:16px;flex:none')} />
          </div>
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
              <button type="button" disabled={deletingAll} onClick={() => void clearAllNotifications()} style={css('min-height:42px;padding:0 15px;border:0;border-radius:11px;background:var(--danger-solid);color:white;font-size:13px;font-weight:650;cursor:pointer;opacity:' + (deletingAll ? '.7' : '1'))}>{deletingAll ? 'Clearing…' : 'Clear all'}</button>
            </div>
          </section>
        </div>
      )}
    </PhoneShell>
  );
}
