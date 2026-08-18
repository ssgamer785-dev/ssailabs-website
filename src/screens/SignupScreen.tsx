import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAuth } from '../lib/auth-context';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

function EyeToggle({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={css('cursor:pointer;flex:none;display:flex')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={show ? '#0B5FEF' : '#94A3B8'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}>
        <path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" />
        <circle cx={12} cy={12} r={2.9} />
        {!show && <path d="M4.5 19.5 19.5 4.5" />}
      </svg>
    </div>
  );
}

const fieldLabel = css('font-size:13px;font-weight:700;letter-spacing:-.1px');
const fieldBox = css('margin-top:9px;height:52px;border:1px solid #E6EAF1;border-radius:12px;display:flex;align-items:center;padding:0 16px');
const fieldBoxWithTrailing = css('margin-top:9px;height:52px;border:1px solid #E6EAF1;border-radius:12px;display:flex;align-items:center;padding:0 16px;gap:10px');
const fieldInput = css('flex:1;font-size:14.5px;height:100%');

export function SignupScreen() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pw2Show, setPw2Show] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setError(null);
    setInfo(null);

    if (!fullName.trim() || !email.trim() || !pw) {
      setError('Please fill in all fields.');
      return;
    }
    if (pw.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (pw !== pw2) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: signUpError, needsEmailConfirmation } = await signUp(email.trim(), pw, fullName.trim());
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError);
      return;
    }
    if (needsEmailConfirmation) {
      setInfo('Account created. Check your email to confirm it, then log in.');
      return;
    }
    navigate('/home', { replace: true });
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:1;display:flex;flex-direction:column;padding:0 24px;overflow-y:auto')}>
        <div style={css('height:52px;flex:none')} />
        <div style={css('font-size:28px;font-weight:800;letter-spacing:-.8px')}>Create Account</div>
        <div style={css('margin-top:9px;font-size:14px;color:#8794A8')}>Start your trading journey</div>
        <div style={css('height:28px;flex:none')} />

        <div style={fieldLabel}>Full Name</div>
        <div style={fieldBox}>
          <input placeholder="Enter your name" value={fullName} onChange={e => setFullName(e.target.value)} style={fieldInput} />
        </div>

        <div style={{ ...fieldLabel, marginTop: 17 }}>Email</div>
        <div style={fieldBox}>
          <input placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} style={fieldInput} />
        </div>

        <div style={{ ...fieldLabel, marginTop: 17 }}>Password</div>
        <div style={fieldBoxWithTrailing}>
          <input type={pwShow ? 'text' : 'password'} placeholder="Create a password" value={pw} onChange={e => setPw(e.target.value)} style={fieldInput} />
          <EyeToggle show={pwShow} onClick={() => setPwShow(v => !v)} />
        </div>

        <div style={{ ...fieldLabel, marginTop: 17 }}>Confirm Password</div>
        <div style={fieldBoxWithTrailing}>
          <input type={pw2Show ? 'text' : 'password'} placeholder="Re-enter your password" value={pw2} onChange={e => setPw2(e.target.value)} style={fieldInput} />
          <EyeToggle show={pw2Show} onClick={() => setPw2Show(v => !v)} />
        </div>

        {error && <div style={css('margin-top:14px;font-size:12.5px;color:#EF4444;line-height:1.4')}>{error}</div>}
        {info && <div style={css('margin-top:14px;font-size:12.5px;color:#16A34A;line-height:1.4')}>{info}</div>}

        <Hoverable
          onClick={handleSubmit}
          style={{
            ...css('margin-top:22px;height:52px;border-radius:12px;background:#0B5FEF;box-shadow:0 10px 22px rgba(11,95,239,.30);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#FFFFFF;cursor:pointer;letter-spacing:-.2px'),
            opacity: submitting ? 0.65 : 1,
            pointerEvents: submitting ? 'none' : 'auto',
          }}
          hoverStyle={css('background:#0A52D6')}
        >
          {submitting ? 'Creating Account…' : 'Create Account'}
        </Hoverable>

        <div style={css('flex:1')} />
        <div style={css('padding-bottom:38px;display:flex;justify-content:center;gap:6px;font-size:13.5px')}>
          <div style={css('color:#64748B;white-space:nowrap')}>Already have an account?</div>
          <div onClick={() => navigate('/login')} style={css('color:#0B5FEF;font-weight:700;cursor:pointer;white-space:nowrap')}>Login</div>
        </div>
      </div>
    </PhoneShell>
  );
}
