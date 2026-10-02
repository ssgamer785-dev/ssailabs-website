import { useEffect, useState } from 'react';
import { PhoneShell } from './PhoneShell';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import logo from '../assets/traders-planet-mark.png';

/** Shown only if authentication outlasts the launch splash's fail-safe. */
export function AuthLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  return <PhoneShell>
    <div role="status" style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px;text-align:center;background:var(--surface)')}>
      <div style={css('width:70px;height:70px;border-radius:20px;background:var(--ink-chip);display:flex;align-items:center;justify-content:center')}>
        <img src={logo} alt="The Traders Planet" style={css('width:54px;height:54px;object-fit:contain')} />
      </div>
      <div style={css('font-size:14px;font-weight:700;color:var(--text-primary)')}>THE TRADERS PLANET</div>
      <div style={css('font-size:12.5px;line-height:1.5;color:var(--text-muted)')}>
        {slow ? 'Still connecting. Check your connection and try again.' : 'Loading your account…'}
      </div>
      {slow && <button type="button" onClick={() => window.location.reload()} style={css('margin-top:3px;padding:10px 19px;border-radius:11px;background:var(--accent);color:var(--on-accent);font-size:12.5px;font-weight:700;cursor:pointer')}>Retry</button>}
    </div>
  </PhoneShell>;
}

/**
 * The profile could not be read and none is saved on this device (a first
 * launch here while offline, or the server unreachable). Says so plainly and
 * retries by itself; never sends an activated member to the code screen.
 */
export function ProfileUnavailable() {
  const { retryProfile, signOut } = useAuth();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return <PhoneShell>
    <div role="alert" style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;text-align:center;background:var(--surface)')}>
      <div style={css('width:70px;height:70px;border-radius:20px;background:var(--ink-chip);display:flex;align-items:center;justify-content:center')}>
        <img src={logo} alt="The Traders Planet" style={css('width:54px;height:54px;object-fit:contain')} />
      </div>
      <div style={css('font-size:16px;font-weight:700;color:var(--text-primary)')}>{offline ? 'You are offline' : 'Can\u2019t reach The Traders Planet'}</div>
      <div style={css('font-size:13px;line-height:1.5;color:var(--text-muted);max-width:290px')}>
        Your account is safe. We will reconnect automatically as soon as the connection is back.
      </div>
      <button type="button" onClick={retryProfile} style={css('margin-top:4px;min-height:44px;padding:10px 22px;border-radius:12px;background:var(--accent);color:var(--on-accent);font-size:14px;font-weight:700;cursor:pointer')}>Try again</button>
      <button type="button" onClick={() => { void signOut(); }} style={css('font-size:13px;color:var(--accent);padding:10px;background:none;cursor:pointer')}>Sign out</button>
    </div>
  </PhoneShell>;
}
