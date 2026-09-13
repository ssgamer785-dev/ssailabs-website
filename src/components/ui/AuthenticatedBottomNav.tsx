import type { ReactNode } from 'react';
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

/** Mirrors --accent in index.css; the SVGs need it as a literal. */
const ACTIVE = '#0B5FEF';
const IDLE = '#94A3B8';
/**
 * Idle labels are 10px, which WCAG counts as normal text and holds to 4.5:1.
 * #94A3B8 measured 2.56:1 on the bar; this is 4.76:1 on the bar's surface.
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
 * The app's persistent tab bar.
 *
 * A solid surface separated from the content by a hairline and lifted by a
 * soft shadow. The selected tab is marked by colour and weight alone — it
 * carries no background of its own, so every tab sits directly on the bar.
 *
 * The bottom inset is honoured with env(safe-area-inset-bottom); the matching
 * --nav-space in index.css is what screens reserve so the last row of content
 * clears the bar by exactly its height and no more.
 */
export function AuthenticatedBottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeTabFor(pathname);

  return (
    <nav
      aria-label="Main"
      className="app-nav"
      style={css(
        'position:absolute;left:0;right:0;bottom:0;z-index:30;display:flex;align-items:stretch;' +
        'padding:9px 8px calc(9px + env(safe-area-inset-bottom, 12px))',
      )}
    >
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
