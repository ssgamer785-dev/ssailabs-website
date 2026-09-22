import { useCallback, useState } from 'react';
import { css } from '../../lib/css';
import { Hoverable } from '../../lib/Hoverable';
import { useAuth } from '../../lib/auth-context';

/**
 * "Continue with Google", for the Login and Signup screens.
 *
 * One component rather than the same markup twice, so the two screens cannot
 * drift apart — this replaces a control that used to exist on Login as a div
 * with no onClick behind it.
 *
 * It owns its own busy state but not its errors: the parent screens each have
 * an error slot already, in a place that suits their layout, and a second
 * message rendered here would compete with it. So a failure is handed up.
 *
 * On success this function never returns — the browser has left for Google by
 * then — which is why `busy` is cleared only on the failure path. Leaving it
 * set is deliberate: during the redirect the button should stay disabled
 * rather than flick back to normal for the last frame before the page goes.
 *
 * Colours are the auth screens' own palette rather than theme tokens: both
 * screens are wrapped in `theme-light` and written against these hex values,
 * so a token here would be the odd one out in its own file.
 */
export function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setBusy(false);
      onError(error);
    }
  }, [busy, onError, signInWithGoogle]);

  return (
    <Hoverable
      onClick={start}
      role="button"
      aria-disabled={busy}
      aria-label="Continue with Google"
      className="pressable"
      style={{
        ...css('width:100%;height:52px;border:1px solid #E6EAF1;border-radius:12px;background:#fff;' +
               'display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer'),
        opacity: busy ? 0.6 : 1,
        pointerEvents: busy ? 'none' : 'auto',
      }}
      hoverStyle={css('border-color:#CBD5E1;background:#FBFCFE')}
    >
      {busy ? (
        <div style={css('font-size:14.5px;font-weight:600;color:#64748B;white-space:nowrap')}>
          Opening Google…
        </div>
      ) : (
        <>
          {/* The wordmark's four colours via a conic gradient clipped to the
              glyph — no image request for a single letter. */}
          <div
            aria-hidden="true"
            style={css("font:700 20px Arial,Helvetica,sans-serif;background:conic-gradient(from -50deg," +
                       "#EA4335 0 25%,#FBBC05 0 50%,#34A853 0 75%,#4285F4 0);" +
                       "-webkit-background-clip:text;background-clip:text;color:transparent")}
          >
            G
          </div>
          <div style={css('font-size:14.5px;font-weight:600;color:#334155;white-space:nowrap')}>
            Continue with Google
          </div>
        </>
      )}
    </Hoverable>
  );
}

/** The "or continue with" rule both screens put above the button. */
export function AuthDivider({ label = 'or continue with' }: { label?: string }) {
  return (
    <div style={css('margin-top:20px;display:flex;align-items:center;gap:12px;flex:none')}>
      <div style={css('flex:1;height:1px;background:#EAEEF4')} />
      <div style={css('font-size:12px;color:#94A3B8;white-space:nowrap')}>{label}</div>
      <div style={css('flex:1;height:1px;background:#EAEEF4')} />
    </div>
  );
}
