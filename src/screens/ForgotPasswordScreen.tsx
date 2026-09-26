import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { css } from '../lib/css';
import { supabase } from '../lib/supabase';

export function ForgotPasswordScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function send() {
    if (inFlight.current) return;
    if (!email.trim()) { setError('Enter your email address.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { error: result } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result) setError(result.status && result.status >= 500 ? 'The sign-in service is temporarily unavailable. Please try again.' : result.message);
      else setSent(true);
    } catch { setError('Could not reach the sign-in service. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <PhoneShell>
    <div style={css('height:52px;display:flex;align-items:center;padding:0 20px')}><AppBackButton fallback="/login" /></div>
    <div style={css('padding:24px;display:flex;flex-direction:column;gap:16px')}>
      <h1 style={css('font-size:23px;font-weight:800')}>Reset password</h1>
      <p style={css('font-size:13px;color:var(--text-muted);line-height:1.5')}>Enter your account email and we’ll send a reset link.</p>
      {sent ? <><p role="status" style={css('font-size:13px;line-height:1.5')}>If this email belongs to an account, check your inbox for a reset link.</p>
        <button type="button" onClick={() => navigate('/login')} style={css('height:46px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700')}>Back to login</button></> : <>
        <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Email address" aria-label="Email address" style={css('height:48px;border:1px solid var(--border-4);border-radius:10px;padding:0 14px')} />
        {error && <p role="alert" style={css('font-size:12px;color:var(--danger-ink)')}>{error}</p>}
        <button type="button" disabled={busy} onClick={() => void send()} style={css('height:48px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700')}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </>}
    </div>
  </PhoneShell>;
}
