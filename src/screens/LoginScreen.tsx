import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAuth } from '../lib/auth-context';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

export function LoginScreen() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (submitting) return;
    setError(null);
    if (!email.trim() || !pw) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), pw);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    navigate('/home', { replace: true });
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:1;display:flex;flex-direction:column;padding:0 24px')}>
        <div style={css('height:52px;flex:none')} />
        <div style={css('font-size:28px;font-weight:800;letter-spacing:-.8px')}>Welcome Back 👋</div>
        <div style={css('margin-top:9px;font-size:14px;color:#8794A8')}>Login to continue your journey</div>
        <div style={css('height:32px;flex:none')} />
        <div style={css('font-size:13px;font-weight:700;letter-spacing:-.1px')}>Email</div>
        <div style={css('margin-top:9px;height:52px;border:1px solid #E6EAF1;border-radius:12px;display:flex;align-items:center;padding:0 16px')}>
          <input placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} style={css('flex:1;font-size:14.5px;height:100%')} />
        </div>
        <div style={css('margin-top:17px;font-size:13px;font-weight:700;letter-spacing:-.1px')}>Password</div>
        <div style={css('margin-top:9px;height:52px;border:1px solid #E6EAF1;border-radius:12px;display:flex;align-items:center;padding:0 16px;gap:10px')}>
          <input type={pwShow ? 'text' : 'password'} placeholder="Enter your password" value={pw} onChange={e => setPw(e.target.value)} style={css('flex:1;font-size:14.5px;height:100%')} />
          <div onClick={() => setPwShow(v => !v)} style={css('cursor:pointer;flex:none;display:flex')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pwShow ? '#0B5FEF' : '#94A3B8'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}>
              <path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" />
              <circle cx={12} cy={12} r={2.9} />
              {!pwShow && <path d="M4.5 19.5 19.5 4.5" />}
            </svg>
          </div>
        </div>
        <div style={css('margin-top:11px;display:flex;justify-content:flex-end')}>
          <div style={css('font-size:12.5px;font-weight:600;color:#0B5FEF;cursor:pointer;white-space:nowrap')}>Forgot Password?</div>
        </div>
        {error && <div style={css('margin-top:14px;font-size:12.5px;color:#EF4444;line-height:1.4')}>{error}</div>}
        <Hoverable
          onClick={handleLogin}
          style={{
            ...css('margin-top:22px;height:52px;border-radius:12px;background:#0B5FEF;box-shadow:0 10px 22px rgba(11,95,239,.30);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#FFFFFF;cursor:pointer;letter-spacing:-.2px'),
            opacity: submitting ? 0.65 : 1,
            pointerEvents: submitting ? 'none' : 'auto',
          }}
          hoverStyle={css('background:#0A52D6')}
        >
          {submitting ? 'Logging in…' : 'Login'}
        </Hoverable>
        <div onClick={() => setRemember(v => !v)} style={css('margin-top:18px;display:flex;align-items:center;gap:9px;cursor:pointer;align-self:flex-start')}>
          <div style={{ width: 18, height: 18, borderRadius: 5, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', border: remember ? '1.6px solid #0B5FEF' : '1.6px solid #C7CEDA', background: remember ? '#0B5FEF' : 'transparent' }}>
            {remember && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
          </div>
          <div style={css('font-size:13px;color:#475569;white-space:nowrap')}>Remember me</div>
        </div>
        <div style={css('margin-top:20px;display:flex;align-items:center;gap:12px')}>
          <div style={css('flex:1;height:1px;background:#EAEEF4')} />
          <div style={css('font-size:12px;color:#94A3B8;white-space:nowrap')}>or continue with</div>
          <div style={css('flex:1;height:1px;background:#EAEEF4')} />
        </div>
        <div style={css('margin-top:18px;display:flex;gap:14px')}>
          <Hoverable style={css('flex:1;height:52px;border:1px solid #E6EAF1;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;background:#fff')} hoverStyle={css('border-color:#CBD5E1')}>
            <div style={css("font:700 20px Arial,Helvetica,sans-serif;background:conic-gradient(from -50deg,#EA4335 0 25%,#FBBC05 0 50%,#34A853 0 75%,#4285F4 0);-webkit-background-clip:text;background-clip:text;color:transparent")}>G</div>
            <div style={css('font-size:14.5px;font-weight:600;color:#334155;white-space:nowrap')}>Continue with Google</div>
          </Hoverable>
        </div>
        <div style={css('flex:1')} />
        <div style={css('padding-bottom:38px;display:flex;justify-content:center;gap:6px;font-size:13.5px')}>
          <div style={css('color:#64748B;white-space:nowrap')}>Don't have an account?</div>
          <div onClick={() => navigate('/signup')} style={css('color:#0B5FEF;font-weight:700;cursor:pointer;white-space:nowrap')}>Sign Up</div>
        </div>
      </div>
    </PhoneShell>
  );
}
