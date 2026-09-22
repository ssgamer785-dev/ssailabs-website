import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import {
  createActivationCode, listActivationCodes,
  type AdminActivationCode, type CreatedCode,
} from '../lib/activation';

/**
 * Activation codes, for the admin.
 *
 * A code is shown in full exactly once — here, in the card at the top, right
 * after it is created. Nothing stores the plaintext, so once this card is
 * dismissed the code is unrecoverable and the list can only show its last four
 * characters. That is the point: a database dump cannot hand anyone a working
 * code. Losing one costs a tap, because they expire in 15 minutes anyway.
 */

const STATUS_STYLE: Record<AdminActivationCode['status'], string> = {
  ACTIVE:  'background:var(--success-soft);color:var(--success-ink)',
  USED:    'background:var(--accent-tint);color:var(--accent-ink)',
  EXPIRED: 'background:var(--neutral-fill);color:var(--text-faint)',
};

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/** Live countdown for the one code that still has a life. */
function useCountdown(expiresAt: string | undefined): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const t = window.setInterval(() => tick(n => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function AdminActivationCodesScreen() {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<AdminActivationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<CreatedCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = useCountdown(fresh?.expires_at);

  const refresh = useCallback(async () => {
    setCodes(await listActivationCodes(50));
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    setCopied(false);
    const made = await createActivationCode();
    setCreating(false);
    if (!made) { setError('Could not create a code. Please try again.'); return; }
    setFresh(made);
    void refresh();
  }, [creating, refresh]);

  const copy = useCallback(async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard needs a secure context and permission; the code is on screen
      // either way, so this is a convenience failing, not the feature.
      setError('Couldn’t copy automatically — select the code above.');
    }
  }, [fresh]);

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <AppBackButton fallback="/home" />
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Activation Codes</div>
        <Hoverable
          onClick={() => navigate('/admin/membership-requests')}
          style={css('height:28px;padding:0 11px;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;font-size:11px;font-weight:700;color:var(--text-tertiary);cursor:pointer;white-space:nowrap;flex:none')}
          hoverStyle={css('border-color:var(--border-strong);background:var(--surface-hover)')}
        >
          REQUESTS
        </Hoverable>
      </div>

      <div className="nav-space" style={css('flex:1;min-height:0;overflow-y:auto;padding:0 20px;display:flex;flex-direction:column;overscroll-behavior:contain')}>
        {fresh && (
          <div style={css('flex:none;border-radius:18px;padding:20px;background:var(--accent-tint);border:1.5px solid var(--accent-border);text-align:center')}>
            <div style={css('font-size:10.5px;font-weight:700;letter-spacing:.14em;color:var(--accent-ink)')}>NEW CODE</div>
            <div style={css('margin-top:12px;font-size:25px;font-weight:800;letter-spacing:.1em;color:var(--accent-ink);user-select:all')}>
              {fresh.code}
            </div>
            <div style={css('margin-top:9px;font-size:12px;color:var(--text-muted)')}>
              {remaining ? `Expires in ${remaining}` : 'Expired'}
            </div>
            <div style={css('margin-top:15px;display:flex;gap:9px')}>
              <Hoverable
                onClick={copy}
                className="pressable"
                style={css('flex:1;height:42px;border-radius:11px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--on-accent);cursor:pointer')}
                hoverStyle={css('background:var(--accent-hover)')}
              >
                {copied ? 'Copied' : 'Copy code'}
              </Hoverable>
              <Hoverable
                onClick={() => setFresh(null)}
                className="pressable"
                style={css('flex:none;width:86px;height:42px;border-radius:11px;border:1px solid var(--accent-border);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--accent-ink);cursor:pointer')}
                hoverStyle={css('background:var(--accent-soft)')}
              >
                Done
              </Hoverable>
            </div>
            <div style={css('margin-top:12px;font-size:11px;color:var(--text-faint);line-height:1.45;text-wrap:pretty')}>
              Shown once. It isn&rsquo;t stored anywhere, so copy it before you leave this card.
            </div>
          </div>
        )}

        <Hoverable
          onClick={create}
          className="pressable"
          aria-disabled={creating}
          style={{
            ...css('margin-top:16px;height:56px;border-radius:16px;background:var(--accent);display:flex;' +
                   'align-items:center;justify-content:center;gap:9px;font-size:15px;font-weight:800;' +
                   'letter-spacing:.03em;color:var(--on-accent);cursor:pointer;flex:none;' +
                   'box-shadow:0 12px 26px rgba(11,95,239,.26)'),
            opacity: creating ? 0.55 : 1,
            pointerEvents: creating ? 'none' : 'auto',
          }}
          hoverStyle={css('background:var(--accent-hover)')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={2.4} strokeLinecap="round">
            <path d="M12 5.5v13M5.5 12h13" />
          </svg>
          {creating ? 'CREATING…' : 'CREATE ACTIVATION CODE'}
        </Hoverable>

        {error && (
          <div role="alert" style={css('margin-top:12px;font-size:12.5px;color:var(--danger-ink);line-height:1.45')}>{error}</div>
        )}

        <div style={css('margin-top:26px;font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--text-faint);flex:none')}>
          HISTORY
        </div>

        {loading ? (
          <div style={css('margin-top:18px;font-size:12.5px;color:var(--text-faint)')}>Loading…</div>
        ) : codes.length === 0 ? (
          <div style={css('margin-top:18px;font-size:12.5px;color:var(--text-faint);line-height:1.5')}>
            No codes yet. Create one above and send it to the member.
          </div>
        ) : (
          <div style={css('margin-top:10px;display:flex;flex-direction:column;padding-bottom:26px')}>
            {codes.map(c => (
              <div key={c.id} style={css('padding:13px 0;border-bottom:1px solid var(--surface-divider);display:flex;align-items:center;gap:12px')}>
                <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
                  <div style={css('font-size:14px;font-weight:700;letter-spacing:.06em')}>
                    TP-••••-{c.code_hint}
                  </div>
                  <div style={css('font-size:11px;color:var(--text-faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                    {shortTime(c.created_at)} · expires {shortTime(c.expires_at)}
                    {c.redeemed_by_name ? ` · ${c.redeemed_by_name}` : ''}
                  </div>
                </div>
                <div style={css(`flex:none;height:22px;padding:0 9px;border-radius:7px;display:flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.06em;${STATUS_STYLE[c.status]}`)}>
                  {c.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
