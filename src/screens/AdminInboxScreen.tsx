import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { formatTime } from '../lib/chat/types';
import { useAdminConversations, openConversationWith, type AdminConversation } from '../lib/chat/useAdminConversations';
import { useConversationsPresence } from '../lib/chat/useConversationsPresence';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import { playMoneyRefreshSound } from '../lib/useMoneySound';
import { AppBackButton } from '../components/ui/AppBackButton';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { Avatar } from '../components/ui/Avatar';

/**
 * The admin's inbox: every activated member, and the thread with each.
 *
 * This screen used to be four hard-coded people — "Rahul Sharma", "Aman
 * Verma", "Vivek Kumar", "Mohit Patel" — with invented previews and invented
 * timestamps, identical on every install. Every row here now comes from
 * `admin_conversations()`, and a row can be tapped to open that member's real
 * thread, creating it if they have never written.
 *
 * The green dot is Realtime presence on the member's own conversation channel,
 * the same source the chat screen reads. It is shown only when it is true, and
 * only for the threads presence was resolved for.
 */

function Row({ item, online, onOpen, opening }: {
  item: AdminConversation;
  online: boolean;
  onOpen: () => void;
  opening: boolean;
}) {
  return (
    <Hoverable
      as="button"
      type="button"
      onClick={onOpen}
      aria-disabled={opening}
      className="row-focus"
      style={{
        ...css('width:100%;display:flex;align-items:center;gap:12px;padding:12px 0;cursor:pointer;border:0;background:transparent;text-align:left'),
        opacity: opening ? 0.55 : 1,
      }}
      hoverStyle={css('background:var(--surface-hover)')}
    >
      <div style={css('position:relative;flex:none')}>
        <Avatar name={item.fullName} avatarKey={item.avatarKey} size={46} />
        {online && (
          <div
            aria-label="Online"
            style={css('position:absolute;right:0;bottom:0;width:12px;height:12px;border-radius:50%;background:var(--success);border:2.4px solid var(--surface)')}
          />
        )}
      </div>

      <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
        <div style={css('display:flex;align-items:center;gap:6px;min-width:0')}>
          <div style={css('font-size:14.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {item.fullName}
          </div>
          {item.revealIdentity && (
            <div style={css('height:17px;padding:0 6px;border-radius:5px;background:var(--success-soft);color:var(--success-ink);display:flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:.05em;white-space:nowrap;flex:none')}>
              NAME SHARED
            </div>
          )}
        </div>
        {!item.revealIdentity && (
          <div style={css('font-size:11px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            Appears to others as Unknown User
          </div>
        )}
        <div style={{
          ...css('font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),
          color: item.lastMessagePreview ? 'var(--text-muted)' : 'var(--text-placeholder)',
        }}>
          {item.lastMessagePreview ?? (opening ? 'Opening…' : 'No messages yet')}
        </div>
      </div>

      <div style={css('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:7px')}>
        {item.lastMessageAt && (
          <div style={{
            ...css('font-size:11px;white-space:nowrap'),
            fontWeight: item.unreadCount ? 600 : 400,
            color: item.unreadCount ? 'var(--accent-ink)' : 'var(--text-faint)',
          }}>
            {formatTime(item.lastMessageAt)}
          </div>
        )}
        {item.unreadCount > 0 && (
          <div style={css('min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--on-accent)')}>
            {item.unreadCount}
          </div>
        )}
      </div>
    </Hoverable>
  );
}

export function AdminInboxScreen() {
  const navigate = useNavigate();
  const { conversations, loading, loadFailed, refresh } = useAdminConversations();
  useRefreshHandler(refresh);

  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presence = useConversationsPresence(useMemo(
    () => conversations.map(c => c.conversationId),
    [conversations],
  ));

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c =>
      c.fullName.toLowerCase().includes(q)
      || (c.lastMessagePreview ?? '').toLowerCase().includes(q));
  }, [conversations, search]);

  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);

  const open = useCallback(async (item: AdminConversation) => {
    if (opening) return;
    setError(null);

    // Already has a thread: go straight there, no round trip.
    if (item.conversationId) {
      navigate(`/chat/admin?c=${item.conversationId}`);
      return;
    }

    setOpening(item.studentId);
    const id = await openConversationWith(item.studentId);
    setOpening(null);
    if (!id) {
      setError(`Could not open a conversation with ${item.fullName}. Please try again.`);
      return;
    }
    void refresh();
    navigate(`/chat/admin?c=${id}`);
  }, [opening, navigate, refresh]);

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <AppBackButton fallback="/chat" />
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Inbox</div>
        {totalUnread > 0 && (
          <div style={css('flex:none;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--on-accent)')}>
            {totalUnread}
          </div>
        )}
        <div style={css('height:24px;padding:0 9px;border-radius:7px;background:var(--ink-chip);display:flex;align-items:center;gap:5px;flex:none')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={2.2} strokeLinejoin="round"><path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" /></svg>
          <div style={css('font-size:10px;font-weight:700;color:var(--on-accent);letter-spacing:.05em;white-space:nowrap')}>ADMIN VIEW</div>
        </div>
      </div>

      <div style={css('flex:none;margin:2px 20px 10px;background:var(--warning-soft);border:1px solid var(--warning-border);border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:flex-start')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--warning-ink)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-top:1px')}><circle cx="12" cy="12" r="8.5" /><path d="M12 8.2v.01M12 11v5" /></svg>
        <div style={css('flex:1;font-size:11.5px;color:var(--warning-ink-3);line-height:1.45;text-wrap:pretty')}>
          Real names are always visible to admins, even when a member appears as Unknown User to others.
        </div>
      </div>

      <div style={css('flex:none;margin:0 20px 8px;height:42px;border-radius:12px;background:var(--surface-secondary);display:flex;align-items:center;padding:0 14px;gap:10px')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={2} strokeLinecap="round" style={css('flex:none')}><circle cx="10.8" cy="10.8" r="6.4" /><path d="M15.6 15.6l4.2 4.2" /></svg>
        <input
          placeholder="Search members"
          aria-label="Search members"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={css('flex:1;min-width:0;font-size:14px;height:100%')}
        />
      </div>

      <div className="nav-space" style={css('flex:1;min-height:0;padding:0 20px;display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain')}>
        {loading ? (
          <div style={css('margin-top:20px;font-size:12.5px;color:var(--text-faint)')}>Loading members…</div>
        ) : loadFailed ? (
          <div role="alert" style={css('margin-top:16px;padding:14px;border-radius:13px;background:var(--danger-soft);display:flex;flex-direction:column;gap:10px;align-items:flex-start')}>
            <div style={css('font-size:12.5px;color:var(--danger-ink);line-height:1.5')}>
              Couldn&rsquo;t load the member list. This is a loading problem &mdash; don&rsquo;t
              read it as &ldquo;no members&rdquo;.
            </div>
            <Hoverable
              onClick={() => { playMoneyRefreshSound(); void refresh(); }}
              className="pressable"
              style={css('height:34px;padding:0 14px;border-radius:9px;border:1px solid var(--danger-border);display:flex;align-items:center;font-size:12px;font-weight:700;color:var(--danger-ink);cursor:pointer')}
              hoverStyle={css('background:var(--danger-soft)')}
            >
              Try again
            </Hoverable>
          </div>
        ) : conversations.length === 0 ? (
          <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px;text-align:center')}>
            <div style={css('width:62px;height:62px;border-radius:20px;background:var(--accent-tint);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;flex:none')}>
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
              </svg>
            </div>
            <div style={css('margin-top:18px;font-size:16px;font-weight:700;letter-spacing:-.3px')}>No activated members yet</div>
            <div style={css('margin-top:8px;font-size:12.5px;color:var(--text-muted);line-height:1.5;text-wrap:pretty')}>
              Members appear here once they redeem an activation code. Create one
              under Activation Codes.
            </div>
          </div>
        ) : shown.length === 0 ? (
          <div style={css('padding:30px 10px;text-align:center;font-size:12.5px;color:var(--text-faint);line-height:1.6')}>
            No member matches &ldquo;{search.trim()}&rdquo;.
          </div>
        ) : (
          <div style={css('padding-bottom:14px')}>
            {shown.map((item, i) => (
              <div key={item.studentId}>
                {i > 0 && <div style={css('height:1px;background:var(--surface-divider)')} />}
                <Row
                  item={item}
                  online={!!item.conversationId && presence.has(item.conversationId)}
                  opening={opening === item.studentId}
                  onOpen={() => void open(item)}
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" style={css('margin:10px 0 16px;font-size:12.5px;color:var(--danger-ink);line-height:1.45')}>
            {error}
          </div>
        )}
      </div>

      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
