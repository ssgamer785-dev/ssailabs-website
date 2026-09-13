import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { css } from '../../lib/css';

export type NavTab = 'home' | 'community' | 'calculator' | 'news' | 'chat';

const TABS: { tab: NavTab; route: string; label: string }[] = [
  { tab: 'home', route: '/home', label: 'Home' },
  { tab: 'community', route: '/community', label: 'Community' },
  { tab: 'calculator', route: '/calculator', label: 'Calculator' },
  { tab: 'news', route: '/news', label: 'News' },
  { tab: 'chat', route: '/chat', label: 'Chat' },
];

/**
 * Which tab owns a route, including the screens pushed on top of one. Derived
 * here rather than passed in, so a screen can never light the wrong tab and
 * every route answers "where am I?" the same way.
 */
function activeTabFor(pathname: string): NavTab | null {
  if (pathname.startsWith('/home')) return 'home';
  if (pathname.startsWith('/community') || pathname.startsWith('/create-post')) return 'community';
  if (pathname.startsWith('/calculator')) return 'calculator';
  if (pathname.startsWith('/news')) return 'news';
  if (pathname.startsWith('/chat') || pathname.startsWith('/admin-inbox')) return 'chat';
  // Profile, notifications and analysis sit outside the tab set: the bar still
  // shows, but nothing is lit, because none of these *is* a tab.
  return null;
}

/**
 * The tab the pill was last drawn on, remembered across mounts.
 *
 * Every screen renders its own <AuthenticatedBottomNav />, so navigating
 * unmounts one bar and mounts another: the pill would be a brand new element
 * already sitting at its destination, and a CSS transition has nothing to
 * animate from. Carrying the previous tab in module scope lets the fresh bar
 * paint one frame where the old one left off and then travel — which is what
 * makes the bar read as persistent rather than merely re-drawn.
 */
let lastIndex = -1;

/** Mirrors --accent in index.css; the SVGs need it as a literal. */
const ACTIVE = '#0B5FEF';
const IDLE = '#94A3B8';
/**
 * Idle labels are 10px, which WCAG counts as normal text and holds to 4.5:1.
 * #94A3B8 measured 2.56:1 on the bar; this is 4.76:1 on white and 4.72:1 at
 * the darkest point of the glass, so it passes AA wherever the bar sits.
 */
const IDLE_LABEL = '#64748B';

function icons(tab: NavTab, active: boolean): ReactNode {
  const stroke = active ? ACTIVE : IDLE;
  const common = { width: 23, height: 23, viewBox: '0 0 24 24', style: css('display:block') } as const;
  switch (tab) {
    case 'home':
      return active
        ? <svg {...common} fill={ACTIVE}><path d="M4.2 10.4 12 4.3l7.8 6.1V19a1.6 1.6 0 0 1-1.6 1.6H5.8A1.6 1.6 0 0 1 4.2 19z" /></svg>
        : <svg {...common} fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4.2 10.4 12 4.3l7.8 6.1V19a1.6 1.6 0 0 1-1.6 1.6H5.8A1.6 1.6 0 0 1 4.2 19z" /></svg>;
    case 'community':
      return active
        ? <svg {...common} fill={ACTIVE}><circle cx="9" cy="8.2" r="3.4" /><path d="M2.9 19.8c0-3.4 2.7-6.1 6.1-6.1s6.1 2.7 6.1 6.1z" /><circle cx="17.2" cy="8.9" r="2.5" /><path d="M16 13.8c2.9 0 5.1 2.5 5.1 5.4h-3.4c0-2-.5-3.9-1.7-5.4z" /></svg>
        : <svg {...common} fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5" /><path d="M16.3 5.8a3 3 0 0 1 0 5.9" /><path d="M16.8 14.4c2.3.5 4 2.5 4 5.2" /></svg>;
    case 'calculator':
      return active
        ? <svg {...common}><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" fill={ACTIVE} /><path d="M4.4 10h15.2M10 4.4v15.2" stroke="#FFFFFF" strokeWidth="1.6" /></svg>
        : <svg {...common} fill="none" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round"><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" /><path d="M4.4 10h15.2M10 4.4v15.2" /></svg>;
    case 'news':
      return active
        ? <svg {...common}><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" fill={ACTIVE} /><path d="M9.4 12.4h5.6M9.4 15.9h3.9" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" /></svg>
        : <svg {...common} fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" /><path d="M12.8 3.7v4.8H17.9" /><path d="M9.4 12.6h5.2M9.4 16h3.6" /></svg>;
    case 'chat':
      return active
        ? <svg {...common}><path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" fill={ACTIVE} /><path d="M8.4 12.2h7.2" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" /></svg>
        : <svg {...common} fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" /><path d="M9.1 12.2h.01M12 12.2h.01M14.9 12.2h.01" /></svg>;
  }
}

/**
 * The app's persistent tab bar, and the strongest piece of glass in the UI.
 *
 * It is one translucent layer with a bright top edge and a soft depth shadow;
 * content scrolls underneath rather than being walled off by an opaque strip.
 * The selected pill slides between tabs on a spring so the eye can follow it.
 *
 * The bottom inset is honoured with env(safe-area-inset-bottom); the matching
 * --nav-space in index.css is what screens reserve so the last row of content
 * clears the bar by exactly its height and no more.
 */
export function AuthenticatedBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeTabFor(pathname);
  const index = active ? TABS.findIndex(t => t.tab === active) : -1;

  // Where the pill is actually drawn, which lags `index` by one frame after a
  // navigation so the transition has somewhere to travel from — see lastIndex.
  const [drawn, setDrawn] = useState(() => (lastIndex >= 0 && index >= 0 ? lastIndex : index));
  const [travelling, setTravelling] = useState(false);

  useEffect(() => {
    if (index < 0) return;                        // no tab owns this route
    lastIndex = index;
    if (drawn === index) return;

    // Honour a reduced-motion preference by simply being there already.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setDrawn(index); return; }

    // One frame at the old position, so the browser has two values to
    // interpolate between rather than a single committed one.
    const raf = requestAnimationFrame(() => { setDrawn(index); setTravelling(true); });
    return () => cancelAnimationFrame(raf);
  }, [index, drawn]);

  // While the pill is in flight it stretches a little along its direction of
  // travel and settles back — the one place the UI behaves like a liquid
  // rather than a solid. Released on its own timer so that the travel effect
  // re-running (which it does the moment `drawn` catches up) cannot cancel it.
  useEffect(() => {
    if (!travelling) return;
    const timer = window.setTimeout(() => setTravelling(false), 210);
    return () => window.clearTimeout(timer);
  }, [travelling]);

  return (
    <nav
      aria-label="Main"
      className="app-nav glass"
      style={css(
        'position:absolute;left:0;right:0;bottom:0;z-index:30;display:flex;align-items:stretch;' +
        "padding:9px 8px calc(9px + env(safe-area-inset-bottom, 12px));" +
        "font-family:'Poppins',-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif",
      )}
    >
      {/* The selected treatment: a soft glass lozenge that travels rather than
          redrawing. Hidden entirely when no tab owns the route. */}
      <div
        aria-hidden="true"
        className="nav-pill"
        style={{
          ...css('position:absolute;top:5px;bottom:auto;height:46px;border-radius:15px;pointer-events:none'),
          left: '8px',
          width: `calc((100% - 16px) / ${TABS.length})`,
          transform:
            `translate3d(calc(${Math.max(drawn, 0)} * 100%), 0, 0)` +
            (travelling ? ' scale(1.07, 0.9)' : ' scale(1, 1)'),
          opacity: index < 0 ? 0 : 1,
        }}
      />
      {TABS.map(({ tab, route, label }) => {
        const on = tab === active;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => navigate(route)}
            aria-current={on ? 'page' : undefined}
            className="pressable"
            style={css(
              'flex:1;min-width:0;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;' +
              'border:0;background:transparent;padding:6px 2px;cursor:pointer;border-radius:15px',
            )}
          >
            <span className={on ? 'nav-item-icon is-active' : 'nav-item-icon'} style={css('display:block')}>{icons(tab, on)}</span>
            <span
              className="nav-item-label"
              style={{
                ...css('font-size:10px;letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%'),
                color: on ? ACTIVE : IDLE_LABEL,
                fontWeight: on ? 600 : 500,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
