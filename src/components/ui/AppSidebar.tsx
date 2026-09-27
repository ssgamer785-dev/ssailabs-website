import { useEffect, useRef, type ReactNode } from 'react';
import logo from '../../assets/traders-planet-logo.jpg';
import { useLocation, useNavigate } from 'react-router-dom';
import { css } from '../../lib/css';
import { useAuth } from '../../lib/auth-context';

/**
 * Every destination here is a route that already exists in App.tsx and was
 * already reachable before this menu did. The menu is a second door onto the
 * app's own map, not a place to put new ones.
 *
 * Admin Inbox is deliberately absent: it is an admin screen (it says so on the
 * page) but its route is not role-gated, so listing it for everyone would put
 * it in front of students for the first time. It stays where it already is.
 *
 * ADMIN_ITEMS below is the opposite case and is why it can be listed at all:
 * both of those routes sit behind RequireAdmin, and every function they call
 * re-checks is_admin() inside Postgres. Hiding them here is a courtesy to
 * students, not the thing that keeps them out.
 */
const ITEMS: { route: string; label: string; icon: ReactNode }[] = [
  {
    route: '/home', label: 'Home',
    icon: <path d="M4.2 10.4 12 4.3l7.8 6.1V19a1.6 1.6 0 0 1-1.6 1.6H5.8A1.6 1.6 0 0 1 4.2 19z" />,
  },
  {
    route: '/community', label: 'Community',
    icon: <g><circle cx="9" cy="8.2" r="3.1" /><path d="M3.4 19.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5" /><path d="M16.3 5.8a3 3 0 0 1 0 5.9" /><path d="M16.8 14.4c2.3.5 4 2.5 4 5.2" /></g>,
  },
  {
    route: '/calculator', label: 'Risk Calculator',
    icon: <g><rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" /><path d="M4.4 10h15.2M10 4.4v15.2" /></g>,
  },
  {
    route: '/economic-calendar', label: 'Economic Calendar',
    icon: <g><rect x="3.8" y="5.4" width="16.4" height="14.4" rx="3" /><path d="M8 3.4v3.6M16 3.4v3.6M3.8 10h16.4" /><path d="M7.8 13.6h2.4M13.8 13.6h2.4M7.8 16.8h2.4" /></g>,
  },
  {
    route: '/chat', label: 'Chat',
    icon: <path d="M20.2 12.2c0 3.7-3.7 6.8-8.2 6.8-.9 0-1.8-.1-2.6-.4l-4.6 1.8 1.4-3.4c-1.5-1.3-2.4-3-2.4-4.8 0-3.7 3.7-6.8 8.2-6.8s8.2 3.1 8.2 6.8z" />,
  },
  {
    route: '/notifications', label: 'Notifications',
    icon: <g><path d="M18 16.4H6l1.4-2.3V11a4.6 4.6 0 0 1 9.2 0v3.1z" /><path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" /></g>,
  },
  {
    route: '/haptics', label: 'HAPTICS',
    icon: <g><path d="M4 9v6M8 6v12M12 9v6M16 6v12M20 9v6" /></g>,
  },
  {
    route: '/profile', label: 'Profile',
    icon: <g><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></g>,
  },
];

/**
 * Admin-only destinations.
 *
 * Kept separate from ITEMS rather than filtered out of it, so that reading this
 * file makes the split obvious: nothing above this line is role-dependent, and
 * everything below it is.
 */
const ADMIN_ITEMS: { route: string; label: string; icon: ReactNode }[] = [
  {
    route: '/admin-inbox', label: 'Member Inbox',
    icon: <g><path d="M4 6.4h16v11.2H4z" /><path d="m4 7 8 5.6L20 7" /></g>,
  },
  {
    route: '/admin/activation-codes', label: 'Activation Codes',
    icon: <g><circle cx="8.4" cy="12" r="3.6" /><path d="M11.9 12h8.2M17.4 12v3M14.6 12v2.2" /></g>,
  },
  {
    route: '/admin/membership-requests', label: 'Membership Requests',
    icon: <g><rect x="5.4" y="3.8" width="13.2" height="16.4" rx="2.4" /><path d="M9 3.2h6v2.6H9z" /><path d="M9 11h6M9 14.8h4" /></g>,
  },
];

const FOCUSABLE = 'button, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The app's navigation menu, opened by the Home header's menu button.
 *
 * It lives inside the phone frame rather than the document, because the frame
 * is what the app looks like — an overlay on <body> would spill past the
 * device bezel on desktop.
 *
 * It stays mounted and is driven entirely by the `is-open` class, so the panel
 * can animate out before it goes away; index.css flips `visibility` only after
 * that transition, which is what keeps the links out of the tab order while
 * the menu is shut.
 */
export function AppSidebar({ open, onClose, unreadCount = 0 }: {
  open: boolean;
  /** Also responsible for returning focus to whatever opened the menu. */
  onClose: () => void;
  unreadCount?: number;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Navigation visibility only. RequireAdmin gates the routes and the database
  // gates the data; this decides whether a student is shown a door they could
  // not open anyway.
  const { isAdmin } = useAuth();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus lands in the menu, not behind it.
    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;

      // Keep Tab inside the panel; without this the next stop is a link on the
      // page behind the scrim, which the user cannot see.
      const items = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const go = (route: string) => {
    onClose();
    if (route !== pathname) navigate(route);
  };

  /**
   * One row. Shared by both lists rather than copied, so an admin entry cannot
   * drift away from the look of the rest of the menu.
   */
  const item = ({ route, label, icon }: { route: string; label: string; icon: ReactNode }) => {
    const on = pathname === route;
    return (
      <button
        key={route}
        type="button"
        onClick={() => go(route)}
        aria-current={on ? 'page' : undefined}
        className="pressable"
        style={{
          ...css('height:46px;padding:0 12px;display:flex;align-items:center;gap:13px;border:0;cursor:pointer;border-radius:11px;text-align:left;width:100%'),
          background: on ? 'var(--accent-soft-5)' : 'transparent',
          color: on ? 'var(--accent-ink)' : 'var(--text-secondary)',
        }}
      >
        <svg
          width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
          style={css('flex:none;display:block')}
        >
          {icon}
        </svg>
        <span style={{ ...css('flex:1;font-size:14px;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), fontWeight: on ? 600 : 500 }}>
          {label}
        </span>
        {route === '/notifications' && unreadCount > 0 && (
          <span style={css('flex:none;min-width:19px;height:19px;padding:0 6px;border-radius:999px;background:var(--danger);color:var(--on-accent);display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;line-height:1')}>
            {unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className={open ? 'app-overlay is-open' : 'app-overlay'}
      style={css('position:absolute;left:0;right:0;top:0;bottom:0;z-index:60')}
    >
      <div
        className="overlay-scrim"
        aria-hidden="true"
        onClick={onClose}
        style={css('position:absolute;left:0;right:0;top:0;bottom:0;background:rgba(var(--shadow-rgb),.42)')}
      />
      <nav
        ref={panelRef}
        aria-label="Menu"
        className="overlay-panel"
        style={css(
          'position:absolute;left:0;top:0;bottom:0;width:278px;max-width:82%;background:var(--surface);' +
          'box-shadow:2px 0 24px rgba(var(--shadow-rgb),.16);display:flex;flex-direction:column',
        )}
      >
        <div style={css('flex:none;padding:calc(14px + env(safe-area-inset-top, 0px)) 14px 10px 16px;display:flex;align-items:center;gap:11px')}>
          {/* The real mark, in a circle. object-fit:contain inside a fixed
              square is what keeps a 1280x1024 asset from being stretched to
              round; the ring and tinted plate are what stop a light-cornered
              logo dissolving into the surface in light mode. */}
          <div
            style={css(
              'flex:none;width:38px;height:38px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;' +
              'background:var(--ink-chip-2);border:1px solid var(--border-3);box-shadow:0 2px 8px rgba(var(--shadow-rgb),.12)',
            )}
          >
            <img
              src={logo}
              alt=""
              aria-hidden="true"
              decoding="async"
              style={css('width:32px;height:32px;object-fit:contain;display:block')}
            />
          </div>
          <div style={css('flex:1;font-size:15.5px;font-weight:800;letter-spacing:-.35px;white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis')}>
            The Traders Planet
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="pressable icon-button"
            style={css('width:40px;height:40px;flex:none;display:flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;cursor:pointer;color:var(--text-primary);border-radius:50%')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" style={css('display:block')}>
              <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        </div>

        <div style={css('flex:none;height:1px;background:var(--surface-divider);margin:0 20px')} />

        <div style={css('flex:1;min-height:0;overflow-y:auto;padding:8px 12px calc(12px + env(safe-area-inset-bottom, 0px));display:flex;flex-direction:column;gap:2px')}>
          {ITEMS.map(item)}

          {/* Only the admin is shown these. The routes behind them are guarded
              by RequireAdmin and every function they call re-checks is_admin()
              in the database, so this is about not offering a student a door,
              not about keeping one shut. */}
          {isAdmin && (
            <>
              <div
                role="separator"
                style={css('margin:14px 12px 6px;padding-top:12px;border-top:1px solid var(--surface-divider);' +
                           'font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--text-faint)')}
              >
                ADMIN
              </div>
              {ADMIN_ITEMS.map(item)}
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
