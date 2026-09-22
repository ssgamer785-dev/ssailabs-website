import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth-context';

/**
 * The single admin's sign-in. Username and password, nothing else.
 *
 * No email field, no Google, and no sign-up link — there is one admin and the
 * account is provisioned in Supabase, not created here.
 *
 * The credentials are never in this file or anywhere else in the bundle. The
 * username is compared server-side against ADMIN_USERNAME and the password is
 * handed to Supabase Auth by server/admin-auth.ts; what comes back is an
 * ordinary Supabase session, which is why every existing is_admin() policy
 * keeps working without knowing this screen exists.
 */
export function AdminLoginScreen() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async () => {
    if (submitting) return;
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubmitting(false);
        setError(body?.error ?? 'Incorrect username or password.');
        return;
      }

      // The server verified the credentials; this installs the session it
      // returned so the rest of the app is signed in as the admin normally.
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (sessionError) {
        setSubmitting(false);
        setError('Could not start your session. Please try again.');
        return;
      }

      await refreshProfile();
      navigate('/admin/activation-codes', { replace: true });
    } catch {
      setSubmitting(false);
      setError('Could not reach the server. Check your connection and try again.');
    }
  }, [navigate, password, refreshProfile, submitting, username]);

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <AppBackButton fallback="/welcome" />
      </div>

      <div className="nav-space" style={css('flex:1;min-height:0;display:flex;flex-direction:column;padding:0 26px;overflow-y:auto')}>
        <div style={css('width:56px;height:56px;border-radius:18px;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" />
          </svg>
        </div>

        <div style={css('margin-top:20px;font-size:25px;font-weight:800;letter-spacing:-.75px')}>Admin Login</div>
        <div style={css('margin-top:9px;font-size:13.5px;color:var(--text-muted);line-height:1.5')}>
          Restricted to The Traders Planet administrator.
        </div>

        <div style={css('height:28px;flex:none')} />

        <label htmlFor="admin-username" style={css('font-size:12.5px;font-weight:700;letter-spacing:-.1px')}>Username</label>
        <div style={{
          ...css('margin-top:9px;height:54px;border-radius:13px;background:var(--surface-inset);display:flex;align-items:center;padding:0 15px'),
          border: `1.5px solid ${error ? 'var(--danger-border)' : 'var(--border)'}`,
        }}>
          <input
            id="admin-username"
            value={username}
            onChange={e => { setUsername(e.target.value); setError(null); }}
            placeholder="Admin username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={css('flex:1;height:100%;font-size:14.5px;color:var(--text-primary)')}
          />
        </div>

        <label htmlFor="admin-password" style={css('margin-top:16px;font-size:12.5px;font-weight:700;letter-spacing:-.1px')}>Password</label>
        <div style={{
          ...css('margin-top:9px;height:54px;border-radius:13px;background:var(--surface-inset);display:flex;align-items:center;padding:0 15px;gap:10px'),
          border: `1.5px solid ${error ? 'var(--danger-border)' : 'var(--border)'}`,
        }}>
          <input
            id="admin-password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void login(); } }}
            placeholder="Password"
            autoComplete="current-password"
            enterKeyHint="go"
            style={css('flex:1;height:100%;font-size:14.5px;color:var(--text-primary)')}
          />
          <div
            onClick={() => setShow(v => !v)}
            role="button"
            aria-label={show ? 'Hide password' : 'Show password'}
            style={css('cursor:pointer;flex:none;display:flex')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={show ? 'var(--accent-ink)' : 'var(--text-faint)'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}>
              <path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" />
              <circle cx={12} cy={12} r={2.9} />
              {!show && <path d="M4.5 19.5 19.5 4.5" />}
            </svg>
          </div>
        </div>

        <div style={css('min-height:34px;margin-top:12px')}>
          {error && (
            <div role="alert" style={css('font-size:12.5px;color:var(--danger-ink);line-height:1.45;text-wrap:pretty')}>
              {error}
            </div>
          )}
        </div>

        <Hoverable
          onClick={login}
          className="pressable"
          aria-disabled={submitting}
          style={{
            ...css('height:56px;border-radius:15px;background:var(--accent);display:flex;align-items:center;' +
                   'justify-content:center;font-size:16px;font-weight:800;color:var(--on-accent);cursor:pointer;' +
                   'flex:none;box-shadow:0 12px 26px rgba(11,95,239,.28)'),
            opacity: submitting ? 0.55 : 1,
            pointerEvents: submitting ? 'none' : 'auto',
          }}
          hoverStyle={css('background:var(--accent-hover)')}
        >
          {submitting ? 'Signing in…' : 'Login'}
        </Hoverable>

        <div style={css('flex:1;min-height:20px')} />
        <div style={css('padding-bottom:34px;text-align:center;font-size:11.5px;color:var(--text-faint);line-height:1.5')}>
          There is one administrator account. It cannot be created here.
        </div>
      </div>
    </PhoneShell>
  );
}
