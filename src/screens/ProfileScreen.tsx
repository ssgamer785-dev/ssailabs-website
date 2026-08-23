import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAppState, initials } from '../lib/app-state';
import { useAuth } from '../lib/auth-context';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

function Row({ icon, label, trailing, onClick }: { icon: ReactNode; label: string; trailing?: string; onClick?: () => void }) {
  return (
    <Hoverable onClick={onClick} style={css('height:56px;padding:0 22px;display:flex;align-items:center;gap:14px;cursor:pointer')} hoverStyle={css('background:#FAFBFD')}>
      {icon}
      <div style={css('flex:1;font-size:14px;font-weight:500;white-space:nowrap')}>{label}</div>
      {trailing && <div style={css('font-size:12.5px;font-weight:600;color:#94A3B8;flex:none;white-space:nowrap')}>{trailing}</div>}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C2CAD6" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
    </Hoverable>
  );
}

const rowIcon = css('flex:none');

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
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Profile</div>
      <div style={css('flex:none;padding:10px 24px 22px;display:flex;align-items:center;gap:18px')}>
        <div style={css('width:86px;height:86px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;flex:none;box-shadow:0 6px 18px rgba(15,23,42,.10)')}>{initials(userName)}</div>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:5px;min-width:0')}>
          <div style={css('font-size:18px;font-weight:800;letter-spacing:-.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{userName}</div>
          {email && <div style={css('font-size:12.5px;color:#8794A8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{email}</div>}
          <div style={{ ...css('font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'), color: phone ? '#8794A8' : '#B6BFCC' }}>
            {phone || 'No phone number added'}
          </div>
        </div>
      </div>
      <div style={css('flex:none;height:1px;background:#F1F4F9;margin:0 20px')} />
      <div style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column')}>
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></svg>} label="Personal Information" />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
        <Row
          icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" /><circle cx="12" cy="12" r="2.9" /><path d="M4.5 19.5 19.5 4.5" /></svg>}
          label="Name Visibility" trailing={myIdentity} onClick={() => navigate('/profile/name-visibility')}
        />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><rect x="5" y="10.4" width="14" height="9.6" rx="2.6" /><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" /></svg>} label="Change Password" />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
        <Row
          icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M18 16.4H6l1.4-2.3V11a4.6 4.6 0 0 1 9.2 0v3.1z" /><path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" /></svg>}
          label="Notifications" onClick={() => navigate('/notifications')}
        />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" /></svg>} label="Privacy Policy" />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><path d="M6.6 3.6h6.3L18 8.5v11.9H6.6z" /><path d="M9.4 12.6h5.2M9.4 16h3.6" /></svg>} label="Terms &amp; Conditions" />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
        <Row icon={<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={rowIcon}><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.4a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 1.8-2.2 3.2" /><path d="M12 16.6h.01" /></svg>} label="Help &amp; Support" />
        <div style={css('height:1px;background:#F1F4F9;margin:0 22px')} />
      </div>
      <div style={css('flex:none;padding:0 20px 40px')}>
        <Hoverable onClick={handleLogout} style={css('height:50px;border-radius:12px;background:#FEF2F3;border:1px solid #FBD5D9;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#EF4444;cursor:pointer')} hoverStyle={css('background:#FDE7E9')}>
          Logout
        </Hoverable>
      </div>
    </PhoneShell>
  );
}
