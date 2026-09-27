import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { useChatOverview } from '../lib/chat/useChatOverview';
import { formatTime } from '../lib/chat/types';
import { PresenceIndicator, usePresence } from '../lib/presence/usePresence';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import logo from '../assets/traders-planet-mark.png';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';

/**
 * The Chat list.
 *
 * There are exactly two rows and there will only ever be two: the admin thread
 * and Help & Support. Member-to-member chat is not a feature that is switched
 * off, it is one the schema cannot express — `conversations` has a single
 * `student_id` and no second participant column, so there is nowhere for a
 * member-to-member thread to exist. This screen used to carry a card
 * explaining that absence; a lock icon and a notice about a feature nobody
 * asked for is the app apologising for itself, and it has been removed. The
 * Help & Support FAQ still answers the question for anyone who wonders.
 */

/** Matches a row against the search box. Empty query matches everything. */
function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some(f => f?.toLowerCase().includes(q));
}

export function ChatListScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { isAdmin } = useAuth();
  const { overview, refresh } = useChatOverview();
  useRefreshHandler(refresh);

  // Students see the Admin account's own authenticated Presence topic. This
  // works from the inbox without requiring the Admin to open this conversation.
  const presence = usePresence([{ kind: 'admin' }]);
  const adminPresence = presence.admin ?? 'unknown';

  const preview = overview?.lastMessagePreview ?? 'Start a conversation with the Admin';
  const unread = overview?.unreadCount ?? 0;

  // The search box was previously wired to state that nothing read, so typing
  // in it did nothing at all. With two rows a filter is the whole feature.
  const showAdminThread = useMemo(() => matches(search, 'Admin', preview), [search, preview]);
  const showSupport = useMemo(
    () => matches(search, 'Help & Support', 'Help and Support', 'Ask about courses, fees or access'),
    [search],
  );

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Chat</div>
      <div style={css('flex:none;margin:4px 20px 8px;height:44px;border-radius:12px;background:var(--surface-secondary);display:flex;align-items:center;padding:0 14px;gap:10px')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={2} strokeLinecap="round" style={css('flex:none')}><circle cx="10.8" cy="10.8" r="6.4" /><path d="M15.6 15.6l4.2 4.2" /></svg>
        <input
          placeholder="Search"
          aria-label="Search chats"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={css('flex:1;min-width:0;font-size:14px;height:100%')}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="pressable"
            style={css('flex:none;width:22px;height:22px;border:0;padding:0;border-radius:50%;background:var(--neutral-fill);display:flex;align-items:center;justify-content:center;cursor:pointer')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--surface)" strokeWidth={3.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>
      <div className="nav-space" style={css('flex:1;min-height:0;padding:6px 20px 0;display:flex;flex-direction:column;overflow-y:auto')}>
        {/* An admin has no student thread of their own, so the row below would
            be an empty conversation with themselves. The inbox is where their
            conversations actually are. */}
        {isAdmin && (
          <>
            <div
              onClick={() => navigate('/admin-inbox')}
              style={css('display:flex;align-items:center;gap:12px;padding:12px 0;cursor:pointer')}
            >
              <div style={css('width:46px;height:46px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;flex:none')}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.4h16v11.2H4z" /><path d="m4 7 8 5.6L20 7" /></svg>
              </div>
              <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
                <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Member Inbox</div>
                <div style={css('font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Every activated member and their thread</div>
              </div>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
            </div>
            <div style={css('height:1px;background:var(--surface-divider)')} />
          </>
        )}
        {showAdminThread && !isAdmin && (
          <div onClick={() => navigate('/chat/admin')} style={css('display:flex;align-items:center;gap:12px;padding:11px 0;cursor:pointer')}>
            <div style={css('position:relative;flex:none')}>
              <div style={css('width:46px;height:46px;border-radius:50%;background:var(--ink-chip-2);display:flex;align-items:center;justify-content:center;overflow:hidden')}>
                <img src={logo} alt="The Traders Planet" style={css('width:40px;height:40px;object-fit:contain')} />
              </div>
            </div>
            <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
              <div style={css('display:flex;align-items:center;gap:5px')}>
                <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Admin</div>
                <svg width="14" height="14" viewBox="0 0 24 24" style={css('display:block;flex:none')}><circle cx="12" cy="12" r="9.5" fill="var(--accent-ink)" /><path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="var(--on-accent)" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <PresenceIndicator status={adminPresence} />
              <div style={css('font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{preview}</div>
            </div>
            <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
              {overview?.lastMessageAt && (
                <div style={css('font-size:11px;font-weight:600;color:var(--accent-ink);white-space:nowrap')}>{formatTime(overview.lastMessageAt)}</div>
              )}
              {unread > 0 && (
                <div style={css('min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--on-accent)')}>{unread}</div>
              )}
            </div>
          </div>
        )}
        {showAdminThread && !isAdmin && showSupport && <div style={css('height:1px;background:var(--surface-divider)')} />}
        {showSupport && (
          // This row has always looked tappable and never was — cursor:pointer
          // with nothing behind it. It goes where the chevron implies.
          <div onClick={() => navigate('/profile/help')} style={css('display:flex;align-items:center;gap:12px;padding:13px 0;cursor:pointer')}>
            <div style={css('width:46px;height:46px;border-radius:50%;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;flex:none')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.4a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.8-2.2 3.2" /><path d="M12 16.6h.01" /></svg>
            </div>
            <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
              <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Help &amp; Support</div>
              <div style={css('font-size:12.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Ask about courses, fees or access</div>
            </div>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
          </div>
        )}
        {!showAdminThread && !showSupport && !isAdmin && (
          <div style={css('padding:34px 10px;text-align:center;font-size:12.5px;color:var(--text-faint);line-height:1.6;text-wrap:pretty')}>
            Nothing matches &ldquo;{search.trim()}&rdquo;.
          </div>
        )}
        <div style={css('height:16px;flex:none')} />
      </div>
      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
