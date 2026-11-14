import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pendingDestination } from '../lib/notifications/destination';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import { useAuth } from '../lib/auth-context';
import { formatCodeInput, redeemActivationCode } from '../lib/activation';

/**
 * The activation gate.
 *
 * Deliberately not written as a block or an error. Someone reaching this has
 * signed in successfully — they are a step short of the app, not locked out of
 * it — so the screen reads as the next step, and the way forward for someone
 * without a code is offered as plainly as the code field itself.
 *
 * It decides nothing. redeem_activation_code() does, inside Postgres, against
 * auth.uid(). This screen sends a string and renders the answer.
 */
export function ActivationScreen() {
  const navigate = useNavigate();
  const { isActivated, signOut, refreshProfile } = useAuth();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Someone who is already through should never see this screen — arriving
  // here by back button or a stale link goes straight on.
  useEffect(() => {
    if (isActivated) navigate(pendingDestination() ?? '/home', { replace: true });
  }, [isActivated, navigate]);

  // Eight characters and a fixed shape: worth focusing, not worth a keyboard
  // popping up over the copy on a phone before it has been read.
  useEffect(() => {
    if (window.matchMedia('(min-width: 481px)').matches) inputRef.current?.focus();
  }, []);

  const ready = code.replace(/[^A-Z0-9]/gi, '').length >= 10; // TP + 8

  const activate = useCallback(async () => {
    if (submitting || !ready) return;
    setSubmitting(true);
    setError(null);

    const result = await redeemActivationCode(code);
    if (!result.ok) {
      setSubmitting(false);
      setError(result.message ?? null);
      return;
    }

    // The profile is the source of truth for the guard, so it has to be re-read
    // before navigating; otherwise RequireActivated still sees the stale row
    // and bounces straight back here.
    await refreshProfile();
    navigate(pendingDestination() ?? '/home', { replace: true });
  }, [code, navigate, ready, refreshProfile, submitting]);

  return (
    <PhoneShell>
      <div
        className="nav-space"
        style={css('flex:1;min-height:0;display:flex;flex-direction:column;padding:0 26px;overflow-y:auto')}
      >
        <div style={css('flex:none;height:46px;display:flex;align-items:center;justify-content:flex-end')}>
          <div
            onClick={() => { void signOut().then(() => navigate('/welcome', { replace: true })); }}
            style={css('font-size:12.5px;font-weight:600;color:var(--text-faint);cursor:pointer;white-space:nowrap')}
          >
            Sign out
          </div>
        </div>

        <div style={css('font-size:11px;font-weight:700;letter-spacing:.16em;color:var(--text-faint)')}>
          THE TRADERS PLANET
        </div>

        <div style={css('margin-top:16px;font-size:27px;font-weight:800;letter-spacing:-.9px;line-height:1.15')}>
          PUT YOUR<br />ACTIVATION CODE
        </div>
        <div style={css('margin-top:12px;font-size:13.5px;color:var(--text-muted);line-height:1.55;text-wrap:pretty')}>
          Enter the code from your mentor to unlock The Traders Planet.
        </div>

        <div style={css('margin-top:28px;flex:none')}>
          <input
            ref={inputRef}
            value={code}
            onChange={e => { setCode(formatCodeInput(e.target.value)); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void activate(); } }}
            placeholder="TP-XXXX-XXXX"
            aria-label="Activation code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            style={{
              ...css('width:100%;height:62px;border-radius:16px;background:var(--surface-inset);' +
                     'text-align:center;font-size:21px;font-weight:700;letter-spacing:.16em;' +
                     'color:var(--text-primary);transition:border-color 140ms var(--ease-out)'),
              border: `1.5px solid ${error ? 'var(--danger-border)' : 'var(--border)'}`,
            }}
          />

          {/* Reserved height: the layout must not jump when an error appears. */}
          <div style={css('min-height:34px;margin-top:10px')}>
            {error && (
              <div role="alert" style={css('font-size:12.5px;color:var(--danger-ink);line-height:1.45;text-wrap:pretty')}>
                {error}
              </div>
            )}
          </div>
        </div>

        <Hoverable
          onClick={activate}
          className="pressable"
          aria-disabled={!ready || submitting}
          style={{
            ...css('height:58px;border-radius:16px;background:var(--accent);display:flex;align-items:center;' +
                   'justify-content:center;font-size:16px;font-weight:800;letter-spacing:.04em;' +
                   'color:var(--on-accent);cursor:pointer;flex:none'),
            boxShadow: ready ? '0 12px 28px rgba(11,95,239,.30)' : 'none',
            opacity: !ready || submitting ? 0.5 : 1,
            pointerEvents: !ready || submitting ? 'none' : 'auto',
          }}
          hoverStyle={css('background:var(--accent-hover)')}
        >
          {submitting ? 'ACTIVATING…' : 'ACTIVATE'}
        </Hoverable>

        <div style={css('flex:1;min-height:36px')} />

        <div style={css('flex:none;padding:20px 0 32px;border-top:1px solid var(--hairline)')}>
          <div style={css('text-align:center;font-size:13px;color:var(--text-muted)')}>
            Don&rsquo;t have an activation code?
          </div>
          <Hoverable
            onClick={() => navigate('/become-a-member')}
            className="pressable"
            style={css('margin-top:14px;height:54px;border-radius:15px;border:1.5px solid var(--accent-border);' +
                       'background:var(--accent-tint);display:flex;align-items:center;justify-content:center;' +
                       'font-size:14.5px;font-weight:800;letter-spacing:.05em;color:var(--accent-ink);cursor:pointer')}
            hoverStyle={css('background:var(--accent-soft)')}
          >
            BECOME A MEMBER
          </Hoverable>
        </div>
      </div>
    </PhoneShell>
  );
}
