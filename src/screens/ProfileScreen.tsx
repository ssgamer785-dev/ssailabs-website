import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAppState } from '../lib/app-state';
import { useAuth } from '../lib/auth-context';
import { useTheme, type Theme } from '../lib/theme';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { Avatar } from '../components/ui/Avatar';

function Row({ icon, label, trailing, onClick }: { icon: ReactNode; label: string; trailing?: string; onClick?: () => void }) {
  // Rows that navigate are real buttons: focusable, operable from the keyboard
  // and announced as controls. Rows with nowhere to go stay plain, so the tab
  // order never stops on something that does nothing. The 56px height already
  // clears the 44px touch target, and the styling is unchanged either way.
  const interactive = !!onClick;
  return (
    <Hoverable
      as={interactive ? 'button' : 'div'}
      {...(interactive ? { type: 'button' as const, className: 'row-focus' } : {})}
      onClick={onClick}
      style={css('width:100%;height:56px;padding:0 22px;display:flex;align-items:center;gap:14px;cursor:pointer;text-align:left;border:0;background:transparent')}
      hoverStyle={css('background:var(--surface-hover)')}
    >
      {icon}
      <div style={css('flex:1;font-size:14px;font-weight:500;white-space:nowrap')}>{label}</div>
      {trailing && <div style={css('font-size:12.5px;font-weight:600;color:var(--text-faint);flex:none;white-space:nowrap')}>{trailing}</div>}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
    </Hoverable>
  );
}

const rowIcon = css('flex:none');

/**
 * Light / Dark, on the settings list where the rest of the preferences live.
 *
 * Two real buttons rather than a switch: a switch implies on/off, and neither
 * theme is the "off" one. Both are always reachable by keyboard, both say which
 * is chosen through aria-pressed as well as through colour, and each is 44px
 * tall so the row is a comfortable target on a phone.
 */
function ThemeChoice() {
  const { theme, setTheme } = useTheme();

  const option = (value: Theme, label: string, glyph: string) => {
    const on = theme === value;
    return (
      <button
        type="button"
        onClick={() => setTheme(value)}
        aria-pressed={on}
        aria-label={`${label} theme`}
        className="pressable"
        style={{
          ...css('flex:1;min-width:0;height:44px;display:flex;align-items:center;justify-content:center;gap:7px;' +
                 'border-radius:10px;cursor:pointer;font-size:13.5px;letter-spacing:-.1px;white-space:nowrap'),
          background: on ? 'var(--surface)' : 'transparent',
          color: on ? 'var(--accent-ink)' : 'var(--text-muted)',
          border: on ? '1px solid var(--accent-border-2)' : '1px solid transparent',
          fontWeight: on ? 600 : 500,
        }}
      >
        <span aria-hidden="true" style={css('font-size:14px;line-height:1')}>{glyph}</span>
        {label}
      </button>
    );
  };

  return (
    <div style={css('flex:none;padding:14px 22px 4px;display:flex;flex-direction:column;gap:9px')}>
      <div style={css('font-size:11px;font-weight:700;color:var(--text-faint);letter-spacing:.07em;white-space:nowrap')}>APPEARANCE</div>
      <div
        role="group"
        aria-label="Theme"
        style={css('display:flex;gap:4px;padding:4px;border-radius:13px;background:var(--surface-secondary)')}
      >
        {option('light', 'Light', '\u2600\uFE0F')}
        {option('dark', 'Dark', '\uD83C\uDF19')}
      </div>
    </div>
  );
}


export function ProfileScreen() {
  const navigate = useNavigate();
  const { userName, reveal } = useAppState();
  const { signOut, user, profile } = useAuth();
  const myIdentity = reveal ? userName : 'Unknown User';

  // The email always exists on the session; the phone is nullable on profiles
  // and most accounts will not have one, so it gets a prompt rather than a
  // blank line or an invented number.
  const email = user?.email ?? '';
  const phone = profile?.phone?.trim() ?? '';

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback="/home" />
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;padding-right:32px')}>Profile</div>
      </div>
      <div style={css('flex:none;padding:10px 24px 22px;display:flex;align-items:center;gap:18px')}>
        <div style={css('flex:none;border-radius:50%;box-shadow:0 6px 18px rgba(var(--shadow-rgb),.10)')}>
          <Avatar name={userName} avatarKey={profile?.avatar_key} size={86} fontSize={26} />
        </div>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:5px;min-width:0')}>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{userName}</div>
          {email && <div style={css('font-size:12.5px;color:var(--text-muted-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{email}</div>}
          <div style={{ ...css('font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), color: phone ? 'var(--text-muted-2)' : 'var(--text-placeholder)' }}>
            {phone || 'No phone number added'}
          </div>
        </div>
      </div>
      <div style={css('flex:none;height:1px;background:var(--surface-divider);margin:0 20px')} />
      <div style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column')}>
        <ThemeChoice />
        <div style={css('height:1px;background:var(--surface-divider);margin:14px 22px 0')} />
        <Row
          icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></svg>}
          label="Personal Information" onClick={() => navigate('/profile/personal')}
        />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
        <Row
          icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" /><circle cx="12" cy="12" r="2.9" /><path d="M4.5 19.5 19.5 4.5" /></svg>}
          label="Name Visibility" trailing={myIdentity} onClick={() => navigate('/profile/name-visibility')}
        />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><rect x="5" y="10.4" width="14" height="9.6" rx="2.6" /><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" /></svg>} label="Change Password" />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
        <Row
          icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M18 16.4H6l1.4-2.3V11a4.6 4.6 0 0 1 9.2 0v3.1z" /><path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" /></svg>}
          label="Notifications" onClick={() => navigate('/notifications')}
        />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" /></svg>} label="Privacy Policy" onClick={() => navigate('/profile/privacy')} />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" /><path d="M9.4 12.6h5.2M9.4 16h3.6" /></svg>} label="Terms &amp; Conditions" onClick={() => navigate('/profile/terms')} />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.4a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.8-2.2 3.2" /><path d="M12 16.6h.01" /></svg>} label="Help &amp; Support" onClick={() => navigate('/profile/help')} />
        <div style={css('height:1px;background:var(--surface-divider);margin:0 22px')} />
      </div>
      <div style={{ ...css('flex:none;padding:0 20px'), paddingBottom: 'calc(16px + var(--nav-space))' }}>
        <Hoverable onClick={handleLogout} style={css('height:50px;border-radius:12px;background:var(--danger-soft-3);border:1px solid var(--danger-border);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--danger-ink);cursor:pointer')} hoverStyle={css('background:var(--danger-soft-5)')}>
          Logout
        </Hoverable>
      </div>
      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
