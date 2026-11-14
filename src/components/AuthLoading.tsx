import { useEffect, useState } from 'react';
import { PhoneShell } from './PhoneShell';
import { css } from '../lib/css';
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
