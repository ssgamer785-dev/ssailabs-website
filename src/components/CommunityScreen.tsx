import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAuth } from '../lib/auth-context';
import { useFeed, type FeedPost } from '../lib/community/useFeed';
import { useRefreshHandler } from './PhoneShell';
import { useComments } from '../lib/community/useComments';
import { PostMedia, timeAgo } from './community/PostMedia';
import { PollCard } from './community/PollCard';
import { resolveAuthorName } from '../lib/community/author-name';
import { initialsOf } from './ui/Avatar';
import logo from '../assets/traders-planet-logo.jpg';
import { AuthenticatedBottomNav } from './ui/AuthenticatedBottomNav';

function MaskAvatar({ size, online }: { size: number; online: boolean }) {
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-sunken-2)', border: '1px dashed var(--border-strong-2)' }}>
        <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted-2)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={8.4} r={3.3} />
          <path d="M5.6 19.6c0-3.4 2.9-5.8 6.4-5.8s6.4 2.4 6.4 5.8" />
        </svg>
      </div>
      {online && <div style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--border-on-accent)' }} />}
    </div>
  );
}

function InitialAvatar({ text, size, bg, color, online }: { text: string; size: number; bg: string; color: string; online: boolean }) {
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.38), fontWeight: 700 }}>
        {text}
      </div>
      {online && <div style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', border: '2px solid var(--border-on-accent)' }} />}
    </div>
  );
}

function LockMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={1.9} strokeLinejoin="round" style={css('display:block;flex:none')}>
      <rect x={5} y={10.4} width={14} height={9.6} rx={2.6} />
      <path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" />
    </svg>
  );
}

function SharedTag() {
  return (
    <div style={{ height: 16, padding: '0 6px', borderRadius: 5, background: 'var(--success-soft)', color: 'var(--success-ink)', display: 'flex', alignItems: 'center', fontSize: 8.5, fontWeight: 700, letterSpacing: '.05em', whiteSpace: 'nowrap', flex: 'none' }}>
      NAME SHARED
    </div>
  );
}

function SwitchEl({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 42, height: 25, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', background: on ? 'var(--accent)' : 'var(--switch-track)', transition: 'background .18s ease' }}>
      <div style={{ width: 19, height: 19, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 3px rgba(var(--shadow-rgb),.28)' }} />
    </div>
  );
}

function Heart({ on, size }: { on: boolean; size: number }) {
  const d = 'M12 20.8S3.9 15.4 3.9 9.9A4.55 4.55 0 0 1 12 7.1a4.55 4.55 0 0 1 8.1 2.8c0 5.5-8.1 10.9-8.1 10.9z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path d={d} fill={on ? 'var(--danger-ink)' : 'none'} stroke={on ? 'var(--danger-ink)' : 'var(--text-muted)'} strokeWidth={1.7} strokeLinejoin="round" />
    </svg>
  );
}

const VERIFIED = (
  <svg width="14" height="14" viewBox="0 0 24 24" style={css('display:block;flex:none')}>
    <circle cx="12" cy="12" r="9.5" fill="var(--accent-ink)" />
    <path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="var(--on-accent)" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Reply row on a student post — posts a real comment. */
function ReplyRow({ postId, anonymous }: { postId: string; anonymous: boolean }) {
  const { addComment } = useComments(postId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    await addComment(text, anonymous);
    setText('');
    setSending(false);
  }

  return (
    <div style={css('display:flex;align-items:center;gap:9px')}>
      <div style={css('flex:1;height:38px;border-radius:999px;background:var(--surface-secondary);display:flex;align-items:center;padding:0 14px')}>
        <input
          placeholder="Write a reply..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
          style={css('flex:1;font-size:12.5px;height:100%')}
        />
      </div>
      <Hoverable as="div" onClick={send} style={css('width:36px;height:36px;border-radius:50%;background:var(--accent-soft-2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:var(--accent-soft-3)')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--accent-ink)" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
      </Hoverable>
    </div>
  );
}

/** Long-press (or right-click) to delete your own post — same gesture as chat. */
function useLongPressDelete(enabled: boolean) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useCallback(() => {
    if (enabled) timer.current = setTimeout(() => setConfirming(true), 500);
  }, [enabled]);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  return { confirming, setConfirming, start, cancel };
}

function DeleteBar({ onDelete, onCancel, busy }: { onDelete: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div style={css('display:flex;align-items:center;gap:10px;padding-top:2px')}>
      <button type="button" disabled={busy} onClick={onDelete} style={css('font-size:11.5px;font-weight:700;color:var(--danger-ink);cursor:pointer;white-space:nowrap')}>{busy ? 'Deleting…' : 'Delete post'}</button>
      <div onClick={onCancel} style={css('font-size:11.5px;font-weight:600;color:var(--text-faint);cursor:pointer;white-space:nowrap')}>Cancel</div>
    </div>
  );
}

/** A real drop shadow rather than a coloured glow. */
const FAB_SHADOW = 'box-shadow:0 1px 2px rgba(var(--shadow-rgb),.14),0 8px 18px rgba(11,95,239,.24)';


/**
 * The two channels, and what distinguishes them.
 *
 * Kept as data rather than branches so the header, the switcher and the empty
 * state all read from one place — the previous screen decided "is this
 * Official?" in eight separate conditionals and drifted between them.
 */
const CHANNELS = {
  official: {
    name: 'Official Updates',
    tab: 'Official',
    blurb: 'Analysis and signals from the team',
    empty: 'No official updates yet. Analysis and signals from the team will appear here.',
  },
  students: {
    name: 'Students Community',
    tab: 'Students',
    blurb: 'Ideas and questions from members',
    empty: 'No student posts yet. Be the first to share an idea with the group.',
  },
} as const;

/**
 * The channel identity bar.
 *
 * A channel needs a face, a name and a line saying what it carries, in that
 * order — it is how a reader knows, without reading a post, which room they
 * are in. The Official channel gets the real Traders Planet logo; Students
 * gets a members glyph, because a student channel has no single author to put
 * a face to.
 */
function ChannelHeader({ channel, badge }: { channel: keyof typeof CHANNELS; badge: ReactNode }) {
  const meta = CHANNELS[channel];
  const official = channel === 'official';

  return (
    <div style={css('flex:none;display:flex;align-items:center;gap:11px;padding:8px 18px 10px;min-width:0')}>
      <div
        style={css(
          'flex:none;width:42px;height:42px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;' +
          (official
            ? 'background:var(--ink-chip-2);border:1px solid var(--border-3)'
            : 'background:var(--accent-soft);border:1px solid var(--accent-border-2)'),
        )}
      >
        {official ? (
          <img src={logo} alt="" aria-hidden="true" decoding="async" style={css('width:36px;height:36px;object-fit:contain;display:block')} />
        ) : (
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5" />
            <path d="M16.3 5.8a3 3 0 0 1 0 5.9" /><path d="M16.8 14.4c2.3.5 4 2.5 4 5.2" />
          </svg>
        )}
      </div>

      <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <div style={css('display:flex;align-items:center;gap:5px;min-width:0')}>
          <h1 style={css('margin:0;font-size:16px;font-weight:800;letter-spacing:-.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {meta.name}
          </h1>
          {official && VERIFIED}
        </div>
        <div style={css('font-size:11.5px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {meta.blurb}
        </div>
      </div>

      {badge}
    </div>
  );
}

/** The channel switcher: two segments, compact, under the identity bar. */
function ChannelSwitch({ value, onChange }: {
  value: keyof typeof CHANNELS;
  onChange: (next: keyof typeof CHANNELS) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Community channel"
      style={css('flex:none;margin:0 18px 10px;padding:3px;background:var(--surface-track);border-radius:999px;display:flex;gap:3px')}
    >
      {(Object.keys(CHANNELS) as (keyof typeof CHANNELS)[]).map(key => {
        const active = key === value;
        return (
          <Hoverable
            key={key}
            as="button"
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !active && onChange(key)}
            className="row-focus"
            style={{
              ...css('flex:1;min-width:0;height:36px;border-radius:999px;display:flex;align-items:center;justify-content:center;' +
                     'font-size:13.5px;cursor:pointer;white-space:nowrap;border:0'),
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--on-accent)' : 'var(--text-tertiary)',
              fontWeight: active ? 600 : 500,
              boxShadow: active ? '0 2px 8px rgba(11,95,239,.24)' : 'none',
            }}
            hoverStyle={active ? {} : css('background:var(--surface-hover)')}
          >
            {CHANNELS[key].tab}
          </Hoverable>
        );
      })}
    </div>
  );
}

export function CommunityScreen({ initialTab = 'official', adminView = false, asOthers = false, reveal: revealProp, userName, onToggleReveal }: {
  initialTab?: 'official' | 'students';
  adminView?: boolean;
  asOthers?: boolean;
  reveal?: boolean;
  /** The signed-in user's real name; supplied by the caller from the profile. */
  userName: string;
  onToggleReveal?: () => void;
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [myReveal, setMyReveal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const feed = useFeed(tab);
  useRefreshHandler(feed.refresh);

  // `adminView` / `asOthers` are the design's preview modes; a real admin
  // session also gets the admin treatment.
  const admin = adminView || (isAdmin && !asOthers);
  const others = asOthers;
  const reveal = revealProp !== undefined ? revealProp : myReveal;

  function handleToggleReveal() {
    if (onToggleReveal) onToggleReveal();
    else setMyReveal(v => !v);
  }

  const isOfficial = tab === 'official';
  const isStudents = tab === 'students';
  // Students may post to their own channel; only an admin may post Official.
  // Unchanged from before — the database enforces it either way, and this is
  // what keeps the button from appearing where the write would be refused.
  const canCompose = isStudents || admin;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) void feed.loadMore();
  }, [feed]);

  const viewBadge = (admin || others) ? (
    <div style={{
      ...css('height:22px;padding:0 9px;border-radius:7px;flex:none;display:flex;align-items:center;gap:5px'),
      background: admin ? 'var(--ink-chip)' : 'var(--accent-soft)',
      border: admin ? 'none' : '1px solid var(--accent-border-2)',
    }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={admin ? 'var(--on-accent)' : 'var(--accent-ink)'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {admin
          ? <path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" />
          : <g><circle cx={12} cy={8.4} r={3.3} /><path d="M5.6 19.6c0-3.4 2.9-5.8 6.4-5.8s6.4 2.4 6.4 5.8" /></g>}
      </svg>
      <div style={{
        ...css('font-size:9.5px;font-weight:700;letter-spacing:.05em;white-space:nowrap'),
        color: admin ? 'var(--on-accent)' : 'var(--accent-ink)',
      }}>
        {admin ? 'ADMIN VIEW' : 'USER VIEW'}
      </div>
    </div>
  ) : null;

  return (
    <div style={css('position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:var(--surface);overflow:hidden;color:var(--text-primary)')}>
      <ChannelHeader channel={tab} badge={viewBadge} />
      <ChannelSwitch value={tab} onChange={setTab} />

      <div style={css('flex:1;min-height:0;background:var(--surface-sunken);display:flex;flex-direction:column;overflow:hidden;border-top:1px solid var(--border-3)')}>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="nav-space"
          /* overscroll-behavior:contain stops a flick at the end of the feed
             dragging the page behind it; -webkit-overflow-scrolling keeps the
             momentum curve on iOS. */
          style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;overscroll-behavior:contain;-webkit-overflow-scrolling:touch')}
        >
          {isStudents && others && (
            <div style={css('background:var(--accent-tint-2);border-bottom:1px solid var(--accent-border-2);padding:10px 18px;display:flex;gap:10px;align-items:flex-start')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-top:1px')}><path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" /><circle cx="12" cy="12" r="2.9" /></svg>
              <div style={css('flex:1;font-size:11.5px;color:var(--text-secondary);line-height:1.45;text-wrap:pretty')}>Member view — this is exactly what other students see. Names stay <strong style={css('font-weight:700')}>Unknown User</strong> unless a member shares them.</div>
            </div>
          )}
          {isStudents && admin && (
            <div style={css('background:var(--warning-soft);border-bottom:1px solid var(--warning-border);padding:10px 18px;display:flex;gap:10px;align-items:flex-start')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning-ink)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-top:1px')}><path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" /></svg>
              <div style={css('flex:1;font-size:11.5px;color:var(--warning-ink-3);line-height:1.45;text-wrap:pretty')}>Admin view — real names are always visible to you, even when a member posts as Unknown User.</div>
            </div>
          )}

          {feed.error && (
            <div role="alert" style={css('background:var(--surface);padding:14px 18px;font-size:12px;color:var(--danger-ink);line-height:1.4')}>{feed.error}</div>
          )}

          {feed.loading ? (
            <div style={css('flex:1;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:var(--text-faint)')}>Loading posts…</div>
          ) : feed.posts.length === 0 ? (
            <div style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:var(--text-faint);line-height:1.5;padding:0 34px;text-wrap:pretty')}>
              {CHANNELS[tab].empty}
            </div>
          ) : (
            feed.posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                official={isOfficial}
                admin={admin}
                others={others}
                reveal={reveal}
                userName={userName}
                onToggleReveal={handleToggleReveal}
                onOpen={() => navigate(`/post?post=${post.id}`)}
                onToggleLike={() => feed.toggleLike(post.id)}
                onDelete={() => feed.deletePost(post)}
              />
            ))
          )}

          {feed.loadingMore && (
            <div style={css('padding:12px 0 16px;text-align:center;font-size:11.5px;color:var(--text-faint)')}>Loading more…</div>
          )}
        </div>
      </div>

      {canCompose && (
        <Hoverable
          as="button"
          type="button"
          className="pressable"
          aria-label={isOfficial ? 'Post an official update' : 'Create a post'}
          onClick={() => navigate(isOfficial ? '/create-post?channel=official' : '/create-post')}
          style={css('position:absolute;right:18px;bottom:calc(18px + var(--nav-space));width:54px;height:54px;border-radius:50%;background:var(--accent);border:0;' + FAB_SHADOW + ';display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:20')}
          hoverStyle={css('background:var(--accent-hover)')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5.5v13M5.5 12h13" /></svg>
        </Hoverable>
      )}

      <AuthenticatedBottomNav />
    </div>
  );
}

/**
 * One post in a channel.
 *
 * This replaces two divergent card renderers — one for Official, one for
 * Students — that had drifted into different paddings, different action rows
 * and, in the Official case, a pair of PDF/Video buttons with nothing behind
 * them. One component means the two channels cannot drift again, and the
 * difference between them is now only what it should be: who the author is.
 *
 * Laid out as a channel row rather than a card. No rounded box, no shadow, no
 * gap between posts — just a flat row on the sunken background with a hairline
 * under it, which is what lets a long feed read as one continuous surface
 * instead of a stack of floating objects. Media runs the full width of the row
 * for the same reason: the attachment is usually the point of the post, and a
 * card inset shrinks it for nothing.
 *
 * Every behaviour from before is preserved: tap to open the real post, tap the
 * heart to like, long-press (or right-click) your own post to delete, the
 * name-visibility switch on your own student post, and the inline reply.
 */
function PostCard({ post, official, admin, others, reveal, userName, onToggleReveal, onOpen, onToggleLike, onDelete }: {
  post: FeedPost;
  official: boolean;
  admin: boolean;
  others: boolean;
  reveal: boolean;
  userName: string;
  onToggleReveal: () => void;
  onOpen: () => void;
  onToggleLike: () => void;
  onDelete: () => Promise<void>;
}) {
  const press = useLongPressDelete(post.isMine || admin);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pressHandlers = {
    onPointerDown: press.start,
    onPointerUp: press.cancel,
    onPointerLeave: press.cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (post.isMine || admin) { e.preventDefault(); press.setConfirming(true); }
    },
  };

  // Who the reader is told wrote this — one shared decision (resolveAuthorName)
  // rather than logic duplicated per screen, which is exactly how this used
  // to show "Unknown User" on your own revealed post: this screen and Post
  // Detail each re-implemented the rule and each got the same detail wrong.
  const showRealName = official || admin || (post.isMine && reveal) || !post.isAnonymous;
  const shownName = resolveAuthorName({
    official, isAdminViewer: admin, isMine: post.isMine, reveal,
    isAnonymous: post.isAnonymous, authorName: post.authorName, myName: userName,
  });
  const initials = initialsOf(shownName);

  const role = official
    ? 'Admin'
    : post.isMine
      ? (admin
          ? (reveal ? 'You · name shared' : 'You · appears as Unknown User')
          : others ? 'Student' : (reveal ? 'You · name visible' : 'You · posting anonymously'))
      : (admin && post.isAnonymous ? 'Student · appears as Unknown User' : 'Student');

  const hasAttachment = post.attachment !== 'none';
  const isPoll = post.attachment === 'poll';
  const hasInteractiveMedia = post.attachment === 'pdf' || post.attachment === 'file' || post.attachment === 'voice';

  return (
    <article
      style={css('background:var(--surface);border-bottom:1px solid var(--surface-divider);padding:13px 0 9px;display:flex;flex-direction:column;gap:9px')}
      {...pressHandlers}
    >
      {/* ---- author ---- */}
      <header style={css('display:flex;align-items:center;gap:10px;padding:0 18px;min-width:0')}>
        {official ? (
          <div style={css('flex:none;width:36px;height:36px;border-radius:50%;background:var(--ink-chip-2);display:flex;align-items:center;justify-content:center;overflow:hidden')}>
            <img src={logo} alt="" aria-hidden="true" decoding="async" style={css('width:31px;height:31px;object-fit:contain;display:block')} />
          </div>
        ) : showRealName ? (
          <InitialAvatar text={initials} size={36} bg="var(--avatar-bg)" color="var(--avatar-ink)" online={false} />
        ) : (
          <MaskAvatar size={36} online={false} />
        )}

        <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
          <div style={css('display:flex;align-items:center;gap:5px;min-width:0')}>
            <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
              {shownName}
            </div>
            {official ? VERIFIED : post.isMine && reveal ? <SharedTag /> : post.isAnonymous ? <LockMark /> : null}
          </div>
          <div style={css('font-size:11px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{role}</div>
        </div>

        <time style={css('flex:none;font-size:11px;color:var(--text-faint);white-space:nowrap')}>{timeAgo(post.createdAt)}</time>
        {(post.isMine || admin) && <button type="button" aria-label="Post options" onClick={e => { e.stopPropagation(); press.setConfirming(true); }} style={css('font-size:19px;color:var(--text-muted);padding:2px 5px;line-height:1')}>⋯</button>}
      </header>

      {/* ---- body ---- */}
      {(post.title || post.body) && (
        <div onClick={onOpen} style={css('padding:0 18px;display:flex;flex-direction:column;gap:4px;cursor:pointer')}>
          {post.title && (
            <div style={css('font-size:15px;font-weight:700;letter-spacing:-.3px;line-height:1.3;text-wrap:pretty')}>{post.title}</div>
          )}
          {post.body && (
            <div style={css('font-size:13.5px;line-height:1.5;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word')}>{post.body}</div>
          )}
        </div>
      )}

      {post.entryPrice != null && (
        <div onClick={onOpen} style={css('padding:0 18px;font-size:12.5px;color:var(--text-muted);cursor:pointer;font-variant-numeric:tabular-nums')}>
          SL {post.stopLoss ?? '—'} · TP {post.takeProfit ?? '—'}
        </div>
      )}

      {/* ---- attachment ----
          A poll, document, and voice player own their own taps, so
          neither sits inside the onOpen wrapper. Image and video do: tapping
          the picture opens the post, which is what a reader expects, and the
          video component stops its own click before it reaches here. */}
      {hasAttachment && (
        isPoll ? (
          <div style={css('padding:2px 18px 3px')}><PollCard postId={post.id} /></div>
        ) : hasInteractiveMedia ? (
          <div style={css('padding:0 18px')}><PostMedia post={post} height={150} /></div>
        ) : (
          // Full-bleed. The media is the post; an 18px inset on both sides
          // costs it 36px of width for nothing but a card outline.
          <div onClick={onOpen} style={css('cursor:pointer')}><PostMedia post={post} height={202} /></div>
        )
      )}

      {/* ---- your own name visibility, on your own student post ---- */}
      {post.isMine && !official && !admin && !others && (
        <div style={css('margin:0 18px;background:var(--accent-tint-2);border:1px solid var(--accent-border-2);border-radius:12px;padding:9px 11px;display:flex;align-items:center;gap:11px')}>
          <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <div style={css('font-size:12px;font-weight:700;letter-spacing:-.15px;white-space:nowrap')}>Show my real name on this post</div>
            <div style={css('font-size:11px;color:var(--text-muted);line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
              {reveal ? `Others now see ${userName}` : 'Others see you as Unknown User'}
            </div>
          </div>
          <SwitchEl on={reveal} onClick={onToggleReveal} />
        </div>
      )}

      {/* ---- actions ---- */}
      <div style={css('padding:0 18px;display:flex;align-items:center;gap:20px')}>
        <Hoverable
          as="button"
          type="button"
          onClick={onToggleLike}
          aria-pressed={post.likedByMe}
          aria-label={`${post.likeCount} like${post.likeCount === 1 ? '' : 's'}`}
          className="row-focus"
          style={css('display:flex;align-items:center;gap:7px;cursor:pointer;border:0;background:transparent;padding:5px 0')}
          hoverStyle={css('opacity:.72')}
        >
          <Heart on={post.likedByMe} size={19} />
          <span style={css('font-size:12.5px;font-weight:600;color:var(--text-secondary);font-variant-numeric:tabular-nums')}>{post.likeCount}</span>
        </Hoverable>

        <Hoverable
          as="button"
          type="button"
          onClick={onOpen}
          aria-label={`${post.commentCount} comment${post.commentCount === 1 ? '' : 's'}`}
          className="row-focus"
          style={css('display:flex;align-items:center;gap:7px;cursor:pointer;border:0;background:transparent;padding:5px 0')}
          hoverStyle={css('opacity:.72')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z" /></svg>
          <span style={css('font-size:12.5px;font-weight:600;color:var(--text-secondary);font-variant-numeric:tabular-nums')}>{post.commentCount}</span>
        </Hoverable>

        <div style={css('flex:1')} />

        <Hoverable
          as="button"
          type="button"
          onClick={onOpen}
          aria-label="Open post"
          className="row-focus"
          style={css('display:flex;align-items:center;gap:5px;cursor:pointer;border:0;background:transparent;padding:5px 0;font-size:11.5px;font-weight:600;color:var(--accent-ink);white-space:nowrap')}
          hoverStyle={css('opacity:.72')}
        >
          Open
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Hoverable>
      </div>

      {/* Inline reply, on student posts only — an Official update is a
          broadcast, and its replies belong on the post itself. */}
      {!official && (
        <div style={css('padding:0 18px 2px')}>
          <ReplyRow postId={post.id} anonymous={!reveal} />
        </div>
      )}

      {press.confirming && (
        <div style={css('padding:0 18px 4px')}>
          <DeleteBar busy={deleting} onDelete={() => {
            if (deleting) return;
            setDeleting(true); setDeleteError(null);
            void onDelete().then(() => press.setConfirming(false))
              .catch(e => setDeleteError(e instanceof Error ? e.message : 'Could not delete this post.'))
              .finally(() => setDeleting(false));
          }} onCancel={() => press.setConfirming(false)} />
          {deleteError && <div role="alert" style={css('font-size:11px;color:var(--danger-ink);padding-top:4px')}>{deleteError}</div>}
        </div>
      )}
    </article>
  );
}
