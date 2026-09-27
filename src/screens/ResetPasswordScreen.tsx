import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../components/PhoneShell';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';

export function ResetPasswordScreen() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function update() {
    if (inFlight.current) return;
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { error: result } = await supabase.auth.updateUser({ password });
      if (result) { setError(result.message); return; }
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/login', { replace: true });
    } catch { setError('Could not update your password. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <PhoneShell>
    <div style={css('padding:32px 24px;display:flex;flex-direction:column;gap:16px')}>
      <h1 style={css('font-size:23px;font-weight:800')}>Choose a new password</h1>
      {loading ? <p>Restoring your reset link…</p> : !session ? <>
        <p role="alert" style={css('font-size:13px;line-height:1.5')}>This reset link has expired or is invalid. Request a new one.</p>
        <button type="button" onClick={() => navigate('/forgot-password')} style={css('color:var(--accent-ink);font-weight:700')}>Request another link</button>
      </> : <>
        <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="New password" aria-label="New password" style={css('height:48px;border:1px solid var(--border-4);border-radius:10px;padding:0 14px')} />
        <input type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Confirm password" aria-label="Confirm password" style={css('height:48px;border:1px solid var(--border-4);border-radius:10px;padding:0 14px')} />
        {error && <p role="alert" style={css('font-size:12px;color:var(--danger-ink)')}>{error}</p>}
        <button type="button" disabled={busy} onClick={() => void update()} style={css('height:48px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700')}>{busy ? 'Updating…' : 'Save password'}</button>
      </>}
    </div>
  </PhoneShell>;
}
