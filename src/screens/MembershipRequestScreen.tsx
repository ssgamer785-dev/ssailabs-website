import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { useAuth } from '../lib/auth-context';
import { submitMembershipRequest, type MembershipForm } from '../lib/activation';
import { hasOwnerWhatsApp, ownerWhatsAppUrl } from '../lib/owner-contact';

/**
 * "Become a member" — the route for someone without an activation code.
 *
 * Five fields, exactly the five asked for. Submitting stores a contact record
 * and grants nothing: the row is tied to auth.uid() by RLS, and the activation
 * gate never consults this table. Someone who submits this is in precisely the
 * position they were in before, plus the admin now knows they exist.
 *
 * After it is stored, WhatsApp opens with the request already drafted so the
 * owner hears about it immediately. The message is drafted, not sent — the
 * person presses Send — and the copy says so rather than implying otherwise.
 */

type Field = keyof MembershipForm;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Digits, spaces, dashes, brackets and one optional leading +. */
const MOBILE_RE = /^\+?[\d\s()-]{7,20}$/;

const LABELS: Record<Field, string> = {
  email: 'Email',
  name: 'Name',
  mobile: 'Mobile No.',
  tradingExperience: 'Trading Experience',
  address: 'Address',
};

const PLACEHOLDERS: Record<Field, string> = {
  email: 'you@example.com',
  name: 'Your full name',
  mobile: '+91 98765 43210',
  tradingExperience: 'How long have you traded, and what do you trade?',
  address: 'Where are you based?',
};

const ORDER: Field[] = ['email', 'name', 'mobile', 'tradingExperience', 'address'];

function validate(form: MembershipForm): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (!form.email.trim()) e.email = 'Enter your email.';
  else if (!EMAIL_RE.test(form.email.trim())) e.email = 'That doesn’t look like an email address.';

  if (!form.name.trim()) e.name = 'Enter your name.';
  else if (form.name.trim().length > 120) e.name = 'That name is too long.';

  if (!form.mobile.trim()) e.mobile = 'Enter your mobile number.';
  else if (!MOBILE_RE.test(form.mobile.trim())) e.mobile = 'Enter a valid mobile number.';

  if (!form.tradingExperience.trim()) e.tradingExperience = 'Tell us about your trading experience.';
  else if (form.tradingExperience.trim().length > 2000) e.tradingExperience = 'Please keep this under 2000 characters.';

  if (!form.address.trim()) e.address = 'Enter your address.';
  else if (form.address.trim().length > 500) e.address = 'Please keep this under 500 characters.';

  return e;
}

export function MembershipRequestScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState<MembershipForm>({
    email: user?.email ?? '', name: '', mobile: '', tradingExperience: '', address: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = useCallback((k: Field, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));
    setFormError(null);
  }, []);

  const whatsAppUrl = useMemo(() => ownerWhatsAppUrl({
    name: form.name, email: form.email, mobile: form.mobile,
    tradingExperience: form.tradingExperience, address: form.address,
  }), [form]);

  const submit = useCallback(async () => {
    if (submitting) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (!user?.id) { setFormError('Your session expired. Please sign in again.'); return; }

    setSubmitting(true);
    const result = await submitMembershipRequest(user.id, form);
    setSubmitting(false);
    if (!result.ok) { setFormError(result.message ?? null); return; }

    setDone(true);

    // Stored first, then handed off. If the popup is blocked or WhatsApp is
    // not installed the request is already safely recorded, so the worst case
    // is the owner hearing about it from the admin panel instead.
    if (whatsAppUrl) window.open(whatsAppUrl, '_blank', 'noopener,noreferrer');
  }, [form, submitting, user, whatsAppUrl]);

  if (done) {
    return (
      <PhoneShell>
        <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px;text-align:center')}>
          <div style={css('width:76px;height:76px;border-radius:26px;background:var(--success-soft);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--success-ink)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          </div>

          <div style={css('margin-top:26px;font-size:20px;font-weight:800;letter-spacing:-.5px;line-height:1.3;text-wrap:balance')}>
            WE WILL GET TO YOU IN 24-48 HOURS !
          </div>
          <div style={css('margin-top:14px;font-size:14px;font-weight:600;color:var(--text-muted);letter-spacing:-.1px')}>
            THANKYOU FOR YOUR PATIENCE
          </div>

          {whatsAppUrl && (
            <div style={css('margin-top:22px;font-size:12.5px;color:var(--text-faint);line-height:1.55;text-wrap:pretty')}>
              WhatsApp has opened with your details filled in. Press Send there to reach us straight away.
            </div>
          )}

          <Hoverable
            onClick={() => navigate('/activate', { replace: true })}
            className="pressable"
            style={css('margin-top:32px;height:52px;padding:0 30px;border-radius:15px;border:1px solid var(--border);' +
                       'display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;' +
                       'color:var(--text-tertiary);cursor:pointer;flex:none')}
            hoverStyle={css('border-color:var(--border-strong);background:var(--surface-hover)')}
          >
            Back to activation
          </Hoverable>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <AppBackButton fallback="/activate" />
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Become a Member</div>
      </div>

      <div className="nav-space" style={css('flex:1;min-height:0;overflow-y:auto;padding:4px 24px 0;display:flex;flex-direction:column;overscroll-behavior:contain')}>
        <div style={css('font-size:13px;color:var(--text-muted);line-height:1.55;text-wrap:pretty')}>
          Tell us about yourself and we&rsquo;ll be in touch with an activation code.
        </div>

        <div style={css('height:22px;flex:none')} />

        {ORDER.map(field => {
          const multiline = field === 'tradingExperience' || field === 'address';
          const invalid = !!errors[field];
          const frame = {
            ...css('margin-top:9px;border-radius:13px;background:var(--surface-inset);padding:0 15px;display:flex;align-items:center'),
            border: `1.5px solid ${invalid ? 'var(--danger-border)' : 'var(--border)'}`,
            minHeight: multiline ? 92 : 52,
          };
          const inner = css('flex:1;font-size:14.5px;color:var(--text-primary);background:transparent;width:100%');

          return (
            <div key={field} style={css('flex:none;margin-bottom:6px')}>
              <label htmlFor={`m-${field}`} style={css('font-size:12.5px;font-weight:700;letter-spacing:-.1px')}>
                {LABELS[field]}
              </label>
              <div style={frame}>
                {multiline ? (
                  <textarea
                    id={`m-${field}`}
                    value={form[field]}
                    onChange={e => set(field, e.target.value)}
                    placeholder={PLACEHOLDERS[field]}
                    rows={3}
                    aria-invalid={invalid}
                    style={{ ...inner, ...css('resize:none;padding:14px 0;line-height:1.5;font-family:inherit') }}
                  />
                ) : (
                  <input
                    id={`m-${field}`}
                    value={form[field]}
                    onChange={e => set(field, e.target.value)}
                    placeholder={PLACEHOLDERS[field]}
                    type={field === 'email' ? 'email' : field === 'mobile' ? 'tel' : 'text'}
                    inputMode={field === 'email' ? 'email' : field === 'mobile' ? 'tel' : 'text'}
                    autoComplete={field === 'email' ? 'email' : field === 'mobile' ? 'tel' : field === 'name' ? 'name' : 'off'}
                    aria-invalid={invalid}
                    style={{ ...inner, ...css('height:50px') }}
                  />
                )}
              </div>
              <div style={css('min-height:19px;padding-top:5px')}>
                {invalid && (
                  <div style={css('font-size:11.5px;color:var(--danger-ink);line-height:1.35')}>{errors[field]}</div>
                )}
              </div>
            </div>
          );
        })}

        {formError && (
          <div role="alert" style={css('margin-top:4px;font-size:12.5px;color:var(--danger-ink);line-height:1.45')}>
            {formError}
          </div>
        )}

        <Hoverable
          onClick={submit}
          className="pressable"
          aria-disabled={submitting}
          style={{
            ...css('margin-top:14px;height:56px;border-radius:16px;background:var(--accent);display:flex;' +
                   'align-items:center;justify-content:center;font-size:15.5px;font-weight:800;letter-spacing:.04em;' +
                   'color:var(--on-accent);cursor:pointer;flex:none;box-shadow:0 12px 26px rgba(11,95,239,.28)'),
            opacity: submitting ? 0.55 : 1,
            pointerEvents: submitting ? 'none' : 'auto',
          }}
          hoverStyle={css('background:var(--accent-hover)')}
        >
          {submitting ? 'SENDING…' : 'SUBMIT REQUEST'}
        </Hoverable>

        <div style={css('margin-top:14px;padding-bottom:30px;text-align:center;font-size:11.5px;color:var(--text-faint);line-height:1.5;text-wrap:pretty')}>
          {hasOwnerWhatsApp()
            ? 'We’ll open WhatsApp with your details ready to send.'
            : 'We’ll review your request and get back to you.'}
        </div>
      </div>
    </PhoneShell>
  );
}
