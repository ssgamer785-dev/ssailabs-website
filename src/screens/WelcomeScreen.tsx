import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import mark from '../assets/traders-planet-mark.png';

/**
 * The entry point for anyone not signed in.
 *
 * It replaces "Continue with Google" as the first thing a new user meets.
 * Worth recording why that was painless: the Google button on the login screen
 * was a div with no onClick and no signInWithOAuth behind it anywhere in the
 * codebase. There was no Google authentication to preserve — only a control
 * that looked like one.
 *
 * Two choices, deliberately unequal. Signing up is the whole width and carries
 * the accent; the admin route is a quiet line at the foot, reachable but never
 * competing. There is exactly one admin, so that link is for one person.
 */
export function WelcomeScreen() {
  const navigate = useNavigate();

  return (
    <PhoneShell>
      <div
        className="nav-space"
        style={css('flex:1;min-height:0;display:flex;flex-direction:column;padding:0 26px;overflow-y:auto')}
      >
        <div style={css('flex:1;min-height:34px')} />

        <img
          src={mark}
          alt=""
          width={78}
          height={78}
          style={css('width:78px;height:78px;border-radius:22px;align-self:center;flex:none;display:block;box-shadow:0 14px 34px rgba(var(--shadow-rgb),.20)')}
        />

        <div style={css('margin-top:22px;text-align:center;font-size:26px;font-weight:800;letter-spacing:-.9px;line-height:1.15')}>
          THE TRADERS<br />PLANET
        </div>
        <div style={css('margin-top:10px;text-align:center;font-size:13px;color:var(--text-muted);letter-spacing:.02em')}>
          Where traders are built
        </div>

        <div style={css('flex:1;min-height:38px')} />

        <Hoverable
          onClick={() => navigate('/login')}
          className="pressable"
          style={css('height:62px;border-radius:18px;background:var(--accent);box-shadow:0 14px 30px rgba(11,95,239,.32);' +
                     'display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;' +
                     'font-size:17px;font-weight:800;letter-spacing:.02em;color:var(--on-accent)')}
          hoverStyle={css('background:var(--accent-hover)')}
        >
          LOGIN / SIGN UP
        </Hoverable>

        <div style={css('margin-top:14px;text-align:center;font-size:12.5px;color:var(--text-faint);line-height:1.5')}>
          Members need an activation code to enter.
        </div>

        <div style={css('flex:none;height:30px')} />

        <div style={css('display:flex;align-items:center;gap:12px;flex:none')}>
          <div style={css('flex:1;height:1px;background:var(--hairline)')} />
          <div style={css('font-size:11px;color:var(--text-faint);letter-spacing:.06em;white-space:nowrap')}>OR</div>
          <div style={css('flex:1;height:1px;background:var(--hairline)')} />
        </div>

        <Hoverable
          onClick={() => navigate('/admin-login')}
          className="pressable"
          style={css('margin-top:22px;height:50px;border-radius:14px;border:1px solid var(--border);' +
                     'display:flex;align-items:center;justify-content:center;gap:9px;cursor:pointer;flex:none;' +
                     'font-size:13.5px;font-weight:700;letter-spacing:.05em;color:var(--text-tertiary)')}
          hoverStyle={css('border-color:var(--border-strong);background:var(--surface-hover)')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" />
          </svg>
          ADMIN LOGIN
        </Hoverable>

        <div style={css('flex:none;height:34px')} />
      </div>
    </PhoneShell>
  );
}
