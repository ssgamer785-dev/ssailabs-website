import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useAppState, initials } from '../lib/app-state';
import { useUnreadNotificationCount } from '../lib/notifications/useNotifications';
import { useHomeHighlights } from '../lib/community/useHomeHighlights';
import { getPostMediaUrl } from '../lib/community/media-api';
import { useLazyMediaUrl } from '../lib/media/useLazyMediaUrl';
import { formatDateTime } from '../lib/format-date-time';
import { Avatar } from '../components/ui/Avatar';
import { useAuth } from '../lib/auth-context';
import type { FeedPost } from '../lib/community/useFeed';
import { BrandHero } from '../components/ui/BrandHero';
import { indiaGreeting, msUntilNextIndiaHour } from '../lib/india-time';
import { PhoneShell, useRefreshHandler } from '../components/PhoneShell';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { AppSidebar } from '../components/ui/AppSidebar';

const quickAction = css('width:63px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer');
const quickIconWrap = css('width:52px;height:52px;border-radius:16px;background:var(--accent-tint);border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center');
const quickLabel = css('font-size:10.5px;font-weight:500;color:var(--text-tertiary-2);text-align:center;line-height:1.28');

/** Muted one-liner used for every loading / empty / error slot on Home. */
const homeNote = css('font-size:12px;color:var(--text-faint);line-height:1.5');

/** The Official card's frame, reused so a placeholder keeps the same footprint. */
const officialCardFrame = css('flex:none;margin:0 20px;background:var(--surface);border:1px solid var(--border-2);border-radius:16px;box-shadow:0 3px 14px rgba(var(--shadow-rgb),.05);padding:14px 15px 12px');
const homeNoteRow = { ...css('flex:none;margin:0 20px'), ...homeNote };
const officialCardNote = { ...officialCardFrame, ...homeNote };

function firstLine(text: string | null): string {
  return (text ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? '';
}

/** Headline for a post: its title, else the opening line of the body. */
function headline(post: FeedPost): string {
  return post.title?.trim() || firstLine(post.body) || 'Untitled post';
}

/**
 * The row's second line. Whatever the body still has to say once the headline
 * is taken out of it — and when the headline was the whole post, who wrote it,
 * which is the only thing a bare initials avatar does not already tell you.
 */
function previewLine(post: FeedPost, title: string): string {
  const rest = (post.body ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== title);

  if (rest.length) return rest.join(' ');
  if (post.attachment !== 'none' && post.fileName) return post.fileName;
  return post.authorName;
}

/**
 * The card's two body lines.
 *
 * A post carrying trade levels renders them in the shape the design was drawn
 * around ("Buy Above 3365" / "SL 3358 | TP 3380"); anything else falls back to
 * the first lines of its text. The headline is dropped when the body repeats
 * it, which official posts do — they title themselves from their own first line.
 */
function summaryLines(post: FeedPost): string[] {
  const levels: string[] = [];
  if (post.entryPrice !== null) {
    levels.push(`${post.instrument ? `${post.instrument} ` : ''}Buy Above ${post.entryPrice}`);
  }
  if (post.stopLoss !== null || post.takeProfit !== null) {
    levels.push([
      post.stopLoss !== null ? `SL ${post.stopLoss}` : null,
      post.takeProfit !== null ? `TP ${post.takeProfit}` : null,
    ].filter(Boolean).join(' | '));
  }
  if (levels.length) return levels;

  const title = headline(post);
  return (post.body ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && l !== title)
    .slice(0, 2);
}

/**
 * The chips under the card body, one per attachment the post actually has.
 *
 * Where a picture exists it is the chip: the video chip keeps its black tile
 * and play triangle but fills them with the real poster frame, and the image
 * chip shows the picture itself. Nothing is fetched until the card is on
 * screen, and a video contributes only its poster — never its own bytes.
 */
function AttachmentChips({ post }: { post: FeedPost }) {
  const isVideo = post.attachment === 'video';
  const isImage = post.attachment === 'image';
  const key = post.mediaPurged ? null : post.posterKey ?? (isImage ? post.storageKey : null);
  const { ref, url } = useLazyMediaUrl(key, getPostMediaUrl);

  if (post.mediaPurged || post.attachment === 'none') return null;

  if (post.attachment === 'pdf') {
    return (
      <div style={css('width:31px;height:31px;border-radius:9px;background:var(--danger-soft);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger-ink)" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
      </div>
    );
  }

  if (isImage) {
    return (
      <div ref={ref} style={css('position:relative;width:31px;height:31px;border-radius:9px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer')}>
        {url
          ? <img src={url} alt="" decoding="async" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.4" /><circle cx="9" cy="10" r="1.7" /><path d="M4.6 17.4l4.5-4.3 3.3 3.1 2.6-2.4 4.4 4" /></svg>}
      </div>
    );
  }

  if (!isVideo) return null;

  return (
    <div ref={ref} style={css('position:relative;width:38px;height:31px;border-radius:9px;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer')}>
      {url && <img src={url} alt="" decoding="async" style={css('position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:.72')} />}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--on-accent)" style={css('position:relative')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
    </div>
  );
}

/** "Latest Official Update" — the newest Official post, in the existing card. */
function OfficialUpdateCard({ post, onOpen }: { post: FeedPost; onOpen: () => void }) {
  return (
    <div onClick={onOpen} style={{ ...officialCardFrame, ...css('position:relative;overflow:hidden;cursor:pointer') }}>
      <svg width="168" height="86" viewBox="0 0 168 86" preserveAspectRatio="none" style={css('position:absolute;right:0;bottom:0;opacity:.85')}>
        <path d="M0,80 L16,74 L32,70 L48,60 L64,63 L80,50 L96,44 L112,32 L128,27 L144,15 L168,6 L168,86 L0,86 Z" fill="rgba(11,95,239,.09)" />
        <path d="M0,80 L16,74 L32,70 L48,60 L64,63 L80,50 L96,44 L112,32 L128,27 L144,15 L168,6" fill="none" stroke="rgba(11,95,239,.32)" strokeWidth={1.3} />
      </svg>
      <div style={css('position:absolute;top:14px;right:15px;width:36px;height:36px;border-radius:12px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center')}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 5.2c0-1 .8-1.8 1.8-1.8h1.9c.8 0 1.5.5 1.7 1.3l.7 2.5c.2.7-.1 1.5-.7 1.9l-1.2.8a11 11 0 0 0 4.4 4.4l.8-1.2c.4-.6 1.2-.9 1.9-.7l2.5.7c.8.2 1.3.9 1.3 1.7v1.9c0 1-.8 1.8-1.8 1.8C10.6 20.3 4.5 14.2 4.5 5.2z" /></svg>
      </div>
      <div style={css('position:relative;width:24px;height:3px;border-radius:2px;background:var(--gold)')} />
      <div style={css('position:relative;margin-top:9px;font-size:14.5px;font-weight:700;letter-spacing:-.25px;padding-right:44px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
        {headline(post)}
      </div>
      {summaryLines(post).map((line, i) => (
        <div key={i} style={css('position:relative;margin-top:' + (i === 0 ? '5px' : '0') + ';font-size:12.5px;color:var(--text-muted);line-height:1.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {line}
        </div>
      ))}
      <div style={css('position:relative;margin-top:13px;display:flex;align-items:center;gap:9px')}>
        <AttachmentChips post={post} />
        <div style={css('flex:1')} />
        <div style={css('max-width:155px;min-width:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right')}>
          <div style={css('width:100%;font-size:11px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{post.authorName}</div>
          <time dateTime={post.createdAt} style={css('font-size:10px;color:var(--text-faint);white-space:normal')}>{formatDateTime(post.createdAt)}</time>
        </div>
      </div>
    </div>
  );
}

/** One "Recent Posts" row. The first has no rule above it, as before. */
function RecentPostRow({ post, index, isAdmin, onOpen }: { post: FeedPost; index: number; isAdmin: boolean; onOpen: () => void }) {
  const title = headline(post);
  const first = index === 0;

  return (
    <div
      onClick={onOpen}
      style={first
        ? css('flex:none;margin:0 20px;display:flex;align-items:center;gap:11px;cursor:pointer')
        : css('flex:none;margin:16px 20px 0;padding-top:15px;border-top:1px solid var(--border);display:flex;align-items:center;gap:11px;cursor:pointer')}
    >
      <Avatar
        name={post.isAnonymous && !isAdmin ? 'Unknown User' : post.authorName}
        avatarKey={null}
        avatarUserId={post.isAnonymous && !isAdmin ? null : post.authorId}
        size={38}
      />
      <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {title}
        </div>
        <div style={css('font-size:11.5px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {previewLine(post, title)}
        </div>
      </div>
      <time dateTime={post.createdAt} style={css('font-size:10px;color:var(--text-faint);flex:none;white-space:normal;text-align:right;max-width:112px')}>{formatDateTime(post.createdAt)}</time>
    </div>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  // India time, not the device's: the app runs on Indian market hours, so a
  // member opening it from Dubai or London should be greeted for the session
  // everyone else is trading. Re-scheduled at each hour boundary rather than
  // polled — the wording changes four times a day, so a per-minute timer would
  // be 1,436 wake-ups that find nothing.
  const [greeting, setGreeting] = useState(() => indiaGreeting());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setGreeting(indiaGreeting());
      timer = window.setTimeout(tick, msUntilNextIndiaHour());
    };
    timer = window.setTimeout(tick, msUntilNextIndiaHour());
    return () => window.clearTimeout(timer);
  }, []);
  const { userName } = useAppState();
  const { isAdmin } = useAuth();
  const unread = useUnreadNotificationCount();
  const highlights = useHomeHighlights();
  useRefreshHandler(highlights.reload);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <PhoneShell scrollRef={scrollRef}>
      <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden')}>
        <div ref={scrollRef} className="nav-space" style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column')}>
        <div style={css('flex:none;padding:4px 20px 16px;display:flex;align-items:center;gap:14px')}>
          {/* Was a bare <div> with a cursor and no handler. Same box, same
              place, same glyph — now a real control that opens the menu. */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="pressable"
            style={css('width:44px;height:44px;border-radius:14px;background:var(--surface);box-shadow:0 3px 12px rgba(var(--shadow-rgb),.10);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;border:0;padding:0')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth={1.9} strokeLinecap="round" style={css('display:block')}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('font-size:12px;color:var(--text-muted-2);white-space:nowrap')}>{greeting} 👋</div>
            <div style={css('font-size:18px;font-weight:800;letter-spacing:-.45px;white-space:nowrap')}>{userName}</div>
          </div>
          {/* The bell stands on its own: no card, no border, no shadow. It keeps
              the 44px hit area the other header controls use, so the row stays
              aligned and the tap target stays thumb-sized. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            onClick={() => navigate('/notifications')}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('/notifications'); } }}
            style={css('position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;background:transparent;border:0')}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M18 16.4H6l1.4-2.3V11a4.6 4.6 0 0 1 9.2 0v3.1z" /><path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" /></svg>
            {unread > 0 && (
              /* Without the card behind it the badge hugs the glyph itself,
                 not the old 44px box, or it floats away from the bell. */
              <div style={css('position:absolute;top:5px;right:4px;min-width:17px;height:17px;padding:0 5px;border-radius:999px;background:var(--danger);border:2px solid var(--border-on-accent);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--on-accent);line-height:1')}>{unread}</div>
            )}
          </div>
          <div onClick={() => navigate('/profile')} style={css('width:44px;height:44px;border-radius:50%;background:var(--avatar-bg);color:var(--avatar-ink);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex:none;box-shadow:0 2px 8px rgba(var(--shadow-rgb),.10);cursor:pointer')}>{initials(userName)}</div>
        </div>

        {/* What stood here was the brightest element on Home and existed to
            say a feature was not built yet: a blue card holding a decorative
            chart under a "Coming soon" badge. This is the platform's own
            identity in its place. Still nothing derived from market data,
            because there is still no market-data source. */}
        <BrandHero />

        <div style={css('flex:none;padding:20px 18px 0;display:flex;justify-content:space-between')}>
          {/* Was '/analysis' with no post id, which now opens a post-detail
              screen with nothing to detail. The Official feed is what this tile
              has always meant. */}
          <div style={quickAction} onClick={() => navigate('/community')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.4" /><circle cx="9" cy="10" r="1.7" /><path d="M4.6 17.4l4.5-4.3 3.3 3.1 2.6-2.4 4.4 4" /></svg>
            </div>
            <div style={quickLabel}>Official<br /><br />Update</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/community?tab=students')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5" /><path d="M16.3 5.8a3 3 0 0 1 0 5.9" /><path d="M16.8 14.4c2.3.5 4 2.5 4 5.2" /></svg>
            </div>
            <div style={quickLabel}>Community</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/calculator')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinejoin="round"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" /><path d="M4.4 10h15.2M10 4.4v15.2" /></svg>
            </div>
            <div style={quickLabel}>Calculator</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/economic-calendar')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3.8" y="5.4" width="16.4" height="14.4" rx="3" /><path d="M8 3.4v3.6M16 3.4v3.6M3.8 10h16.4" /><path d="M7.8 13.6h2.4M13.8 13.6h2.4M7.8 16.8h2.4" /></svg>
            </div>
            <div style={quickLabel}>Calendar</div>
          </div>
          <div style={quickAction} onClick={() => navigate('/chat')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" /><path d="M9.1 12.2h.01M12 12.2h.01M14.9 12.2h.01" /></svg>
            </div>
            <div style={quickLabel}>Chat</div>
          </div>
        </div>

        <div style={css('flex:none;padding:22px 20px 11px;font-size:15px;font-weight:700;letter-spacing:-.3px')}>Latest Official Update</div>
        {highlights.loading ? (
          <div style={officialCardNote}>
            Loading the latest update…
          </div>
        ) : highlights.error ? (
          <div style={officialCardNote}>
            {highlights.error}
          </div>
        ) : highlights.official ? (
          <OfficialUpdateCard
            post={highlights.official}
            onOpen={() => navigate(`/post?post=${highlights.official!.id}`)}
          />
        ) : (
          <div style={officialCardNote}>
            No official updates yet. Analysis and signals from the team will appear here.
          </div>
        )}

        <div style={css('flex:none;padding:20px 20px 12px;font-size:15px;font-weight:700;letter-spacing:-.3px')}>Recent Posts</div>
        {highlights.loading ? (
          <div style={homeNoteRow}>Loading recent posts…</div>
        ) : highlights.error ? (
          <div style={homeNoteRow}>{highlights.error}</div>
        ) : highlights.recent.length === 0 ? (
          <div style={homeNoteRow}>
            No community posts yet. Be the first to share a setup.
          </div>
        ) : (
          highlights.recent.map((post, index) => (
            <RecentPostRow
              key={post.id}
              post={post}
              index={index}
              isAdmin={isAdmin}
              onOpen={() => navigate(`/post?post=${post.id}`)}
            />
          ))
        )}
        <div style={css('height:20px;flex:none')} />
        </div>
      </div>
      <AuthenticatedBottomNav />
      <AppSidebar
        open={menuOpen}
        unreadCount={unread}
        onClose={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}
      />
    </PhoneShell>
  );
}
