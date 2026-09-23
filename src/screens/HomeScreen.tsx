import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useAppState, initials } from '../lib/app-state';
import { useUnreadNotificationCount } from '../lib/notifications/useNotifications';
import { useHomeHighlights } from '../lib/community/useHomeHighlights';
import { getPostMediaUrl } from '../lib/community/media-api';
import { useLazyMediaUrl } from '../lib/media/useLazyMediaUrl';
import { timeAgo } from '../components/community/PostMedia';
import type { FeedPost } from '../lib/community/useFeed';
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

/** The two avatar tints the Recent Posts rows already used, alternating. */
const ROW_TINTS: [string, string][] = [
  ['var(--avatar-bg-2)', 'var(--avatar-ink-2)'],
  ['var(--avatar-bg-3)', 'var(--avatar-ink-3)'],
];

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
        <div style={css('font-size:11px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px')}>
          {post.authorName} · {timeAgo(post.createdAt)}
        </div>
      </div>
    </div>
  );
}

/** One "Recent Posts" row. The first has no rule above it, as before. */
function RecentPostRow({ post, index, onOpen }: { post: FeedPost; index: number; onOpen: () => void }) {
  const [bg, fg] = ROW_TINTS[index % ROW_TINTS.length];
  const title = headline(post);
  const first = index === 0;

  return (
    <div
      onClick={onOpen}
      style={first
        ? css('flex:none;margin:0 20px;display:flex;align-items:center;gap:11px;cursor:pointer')
        : css('flex:none;margin:16px 20px 0;padding-top:15px;border-top:1px solid var(--border);display:flex;align-items:center;gap:11px;cursor:pointer')}
    >
      <div style={{ ...css('width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none'), background: bg, color: fg }}>
        {initials(title)}
      </div>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {title}
        </div>
        <div style={css('font-size:11.5px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {previewLine(post, title)}
        </div>
      </div>
      <div style={css('font-size:11px;color:var(--text-faint);flex:none;white-space:nowrap')}>{timeAgo(post.createdAt)}</div>
    </div>
  );
}

/** The card's decorative line. A fixed path, not a plot — see MarketPattern. */
const MARKET_LINE =
  'M0 41Q35 34 52.5 38.5Q70 43 87.5 35Q105 27 122.5 30.5Q140 34 157.5 26.5' +
  'Q175 19 192.5 25Q210 31 227.5 26Q245 21 262.5 27Q280 33 297.5 23.5Q315 14 332.5 18T350 22';

/**
 * The Market Overview card's filler, and nothing more than that.
 *
 * There is no market-data source behind this app, so the card cannot show a
 * reading of anything. It used to say so in two lines of prose, which left the
 * largest, brightest element on Home explaining what it could not do. This is
 * the same admission made visually: chart geometry with no scale, no axis
 * ticks, no values and no labels — shapes a trader recognises as a chart and
 * cannot mistake for one, under the "Coming soon" badge that carries the
 * actual meaning.
 *
 * Every coordinate is a constant. Nothing here is derived from data, fetched,
 * or randomised, and the whole thing is aria-hidden so a screen reader is not
 * handed an ornament to describe. When a real feed exists this is what it
 * replaces.
 */
function MarketPattern() {
  return (
    <svg
      viewBox="0 0 350 59"
      width="100%"
      height="59"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={css('display:block;overflow:visible')}
    >
      <defs>
        <linearGradient id="mkt-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--on-accent)" stopOpacity="0.17" />
          <stop offset="100%" stopColor="var(--on-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rules, not axes: no ticks and no scale, so they read as texture. */}
      <g stroke="var(--on-accent)" strokeOpacity="0.08" strokeWidth="1">
        <path d="M0 14.5h350M0 30.5h350M0 46.5h350" />
      </g>

      {/* Candles, mixed rising and falling — the movement is a pattern, not a
          direction anyone should read anything into. */}
      <g fill="var(--on-accent)">
        <rect x="17.5" y="30" width="1" height="19" rx="0.5" opacity="0.14" /><rect x="15.5" y="34" width="5" height="11" rx="1.4" opacity="0.17" />
        <rect x="57.5" y="24" width="1" height="21" rx="0.5" opacity="0.2" /><rect x="55.5" y="28" width="5" height="12" rx="1.4" opacity="0.3" />
        <rect x="97.5" y="33" width="1" height="19" rx="0.5" opacity="0.14" /><rect x="95.5" y="37" width="5" height="10" rx="1.4" opacity="0.17" />
        <rect x="137.5" y="21" width="1" height="22" rx="0.5" opacity="0.2" /><rect x="135.5" y="25" width="5" height="13" rx="1.4" opacity="0.3" />
        <rect x="177.5" y="26" width="1" height="21" rx="0.5" opacity="0.14" /><rect x="175.5" y="31" width="5" height="11" rx="1.4" opacity="0.17" />
        <rect x="217.5" y="16" width="1" height="23" rx="0.5" opacity="0.2" /><rect x="215.5" y="20" width="5" height="13" rx="1.4" opacity="0.3" />
        <rect x="257.5" y="24" width="1" height="22" rx="0.5" opacity="0.14" /><rect x="255.5" y="29" width="5" height="12" rx="1.4" opacity="0.17" />
        <rect x="297.5" y="13" width="1" height="23" rx="0.5" opacity="0.2" /><rect x="295.5" y="17" width="5" height="13" rx="1.4" opacity="0.3" />
        <rect x="331.5" y="20" width="1" height="21" rx="0.5" opacity="0.2" /><rect x="329.5" y="24" width="5" height="11" rx="1.4" opacity="0.3" />
      </g>

      <path d={`${MARKET_LINE}L350 59L0 59Z`} fill="url(#mkt-area)" />
      {/* The line runs off both edges rather than ending in a marker dot: a
          dot would sit half-clipped on the bleed, and a terminal point on a
          chart reads as "here is the latest value", which is the one thing
          this card must not appear to say. */}
      <path d={MARKET_LINE} fill="none" stroke="var(--on-accent)" strokeOpacity="0.6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { userName } = useAppState();
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
            <div style={css('font-size:12px;color:var(--text-muted-2);white-space:nowrap')}>Good Morning 👋</div>
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

        {/* Market Overview.

            This card used to assert a market sentiment, a percentage move and
            a sparkline, all three hard-coded — there is no market-data source
            behind this app — so a trader was shown an invented read on the
            market every time they opened it. Nothing below states or implies a
            market condition: the badge says the feature is coming, and the rest
            is ornament. The card keeps its place, its size and its styling. */}
        <div style={css('flex:none;margin:0 20px;border-radius:20px;background:linear-gradient(150deg,var(--accent-grad-a) 0%,var(--accent-grad-b) 100%);box-shadow:0 14px 28px rgba(11,95,239,.28);padding:16px 18px 18px;color:var(--on-accent);overflow:hidden')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between')}>
            <div style={css('font-size:14.5px;font-weight:600;letter-spacing:-.2px;white-space:nowrap')}>Market Overview</div>
            <div style={css('height:22px;padding:0 9px;border-radius:7px;background:rgba(255,255,255,.16);display:flex;align-items:center;font-size:10.5px;font-weight:600;letter-spacing:.02em;white-space:nowrap')}>Coming soon</div>
          </div>
          <div style={css('margin-top:12px')}>
            <MarketPattern />
          </div>
        </div>

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
          <div style={quickAction} onClick={() => navigate('/community')}>
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
          <div style={quickAction} onClick={() => navigate('/news')}>
            <div style={quickIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" /><path d="M12.8 3.7v4.8H17.9" /><path d="M9.4 12.6h5.2M9.4 16h3.6" /></svg>
            </div>
            <div style={quickLabel}>News</div>
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
          highlights.recent.map((post, i) => (
            <RecentPostRow
              key={post.id}
              post={post}
              index={i}
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
