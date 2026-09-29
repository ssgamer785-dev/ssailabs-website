import type { ReactNode } from 'react';
import { css } from '../../lib/css';
import { usePushSetup, type PushStatus } from '../../lib/notifications/usePushSetup';
import { isAppleMobileWebKit } from '../../lib/notifications/push';

type Pill = { label: string; bg: string; ink: string };

const PILLS: Record<PushStatus, Pill> = {
  on: { label: 'Enabled', bg: 'var(--success-soft)', ink: 'var(--success-text)' },
  ask: { label: 'Not enabled', bg: 'var(--surface-secondary)', ink: 'var(--text-secondary)' },
  off: { label: 'Off on this device', bg: 'var(--surface-secondary)', ink: 'var(--text-secondary)' },
  denied: { label: 'Blocked', bg: 'var(--danger-soft)', ink: 'var(--danger-text)' },
  'needs-retry': { label: 'Needs attention', bg: 'var(--warning-soft-3)', ink: 'var(--warning-ink-3)' },
  expired: { label: 'Expired', bg: 'var(--warning-soft-3)', ink: 'var(--warning-ink-3)' },
  unavailable: { label: 'Unavailable', bg: 'var(--warning-soft-3)', ink: 'var(--warning-ink-3)' },
  'install-required': { label: 'Install required', bg: 'var(--accent-soft)', ink: 'var(--accent-ink)' },
  unsupported: { label: 'Not supported', bg: 'var(--surface-secondary)', ink: 'var(--text-secondary)' },
  insecure: { label: 'Not supported', bg: 'var(--surface-secondary)', ink: 'var(--text-secondary)' },
};

const PRIMARY = css('width:100%;min-height:48px;margin-top:14px;border:0;border-radius:14px;background:var(--accent);color:var(--on-accent);font-size:15px;font-weight:700;letter-spacing:-.15px;cursor:pointer;box-shadow:0 6px 16px rgba(11,95,239,.24)');
const SECONDARY = css('flex:1;min-height:44px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-primary);font-size:13.5px;font-weight:650;cursor:pointer');
const TEXT = css('margin:12px 0 0;font-size:13px;line-height:1.55;color:var(--text-muted)');

/** Numbered explicitly: the app's CSS reset removes list markers, and these steps are read in order. */
function Steps({ items }: { items: string[] }) {
  return (
    <div role="list" style={css('margin:12px 0 0;display:flex;flex-direction:column;gap:9px')}>
      {items.map((item, index) => (
        <div key={item} role="listitem" style={css('display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.5;color:var(--text-secondary)')}>
          <span aria-hidden="true" style={css('flex:none;width:22px;height:22px;border-radius:50%;background:var(--accent-soft);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700')}>{index + 1}</span>
          <span style={css('flex:1;min-width:0;padding-top:1px')}>{item}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The top of the Notifications screen: this device's push state and the one
 * action that fits it. "Enabled" is shown only when the browser holds a
 * subscription AND the server holds this device; permission alone is never
 * called enabled. The permission prompt appears only from the button here.
 */
export function PushSettingsCard() {
  const push = usePushSetup();
  const apple = isAppleMobileWebKit();
  const pill = PILLS[push.status];
  const working = push.busy;

  const enableButton = (label: string) => (
    <button type="button" disabled={working} onClick={() => void push.enable()} style={{ ...PRIMARY, opacity: working ? .7 : 1 }}>
      {working ? 'Enabling…' : label}
    </button>
  );

  let body: ReactNode;
  switch (push.status) {
    case 'on':
      body = (
        <>
          <div role="status" style={css('margin:12px 0 0;display:flex;align-items:center;gap:9px;font-size:15px;font-weight:700;color:var(--success-text)')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12.4 2.7 2.7L16.2 9.6" /></svg>
            Push Notifications Enabled
          </div>
          <p style={TEXT}>You will get alerts on this device even when the app is closed. Other devices you use are set up separately. Banner sounds and vibration come from your phone&apos;s notification settings, not from this app.</p>
          <div style={css('display:flex;gap:10px;margin-top:14px')}>
            <button type="button" disabled={working} onClick={() => void push.sendTest()} style={SECONDARY}>Send a test</button>
            <button type="button" disabled={working} onClick={() => void push.disable()} style={{ ...SECONDARY, color: 'var(--danger-text)' }}>Turn off on this device</button>
          </div>
        </>
      );
      break;
    case 'ask':
      body = (
        <>
          <p style={TEXT}>Get messages, announcements and community updates on this device, even when the app is closed.</p>
          {enableButton('Enable Notifications')}
        </>
      );
      break;
    case 'off':
      body = (
        <>
          <p style={TEXT}>Push notifications are off on this device. Your other devices are not affected, and your in-app notifications keep working.</p>
          {enableButton('Enable Notifications')}
        </>
      );
      break;
    case 'needs-retry':
      body = (
        <>
          <p style={TEXT}>Notifications are allowed, but this device is not registered yet.</p>
          {enableButton('Retry')}
        </>
      );
      break;
    case 'expired':
      body = (
        <>
          <p style={TEXT}>This device&apos;s notification subscription expired: the browser or the server dropped it, so alerts stopped. Enable it again to restore them.</p>
          {enableButton('Re-enable Notifications')}
        </>
      );
      break;
    case 'unavailable':
      body = (
        <>
          <p style={TEXT}>Push notifications are temporarily unavailable: the server could not register this device just now. Your in-app notifications still work.</p>
          {enableButton('Retry')}
        </>
      );
      break;
    case 'denied':
      body = (
        <>
          <p style={TEXT}>
            {apple
              ? 'Notifications are turned off for this app. Change it in iPhone Settings, then come back:'
              : 'Notifications are blocked for this site. Allow them in your browser, then come back:'}
          </p>
          <Steps items={apple
            ? ['Open the iPhone Settings app.', 'Tap Notifications, then The Traders Planet.', 'Turn on Allow Notifications.']
            : ['Open your browser\'s site settings for this page.', 'Set Notifications to Allow.', 'Return here and reload the page.']} />
          <p style={css('margin:10px 0 0;font-size:12px;line-height:1.5;color:var(--text-muted)')}>The app will not ask again until the setting is changed.</p>
        </>
      );
      break;
    case 'install-required':
      body = (
        <>
          <p style={TEXT}>On iPhone, push notifications work in the installed app. To install it:</p>
          <Steps items={['Open this page in Safari and tap the Share button.', 'Choose Add to Home Screen.', 'Open The Traders Planet from your Home Screen, then turn on notifications here.']} />
        </>
      );
      break;
    case 'insecure':
      body = <p style={TEXT}>Push notifications need a secure (https) connection.</p>;
      break;
    default:
      body = <p style={TEXT}>This browser does not support push notifications. Your in-app notifications still work. Use Chrome, Edge, Firefox or Safari, or the installed app on iPhone.</p>;
  }

  return (
    <section aria-labelledby="push-notifications-title" style={{ ...css('flex:none;margin:0 20px 14px;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)'), boxShadow: '0 3px 14px rgba(0,0,0,.04)' }}>
      <div style={css('display:flex;align-items:center;gap:12px')}>
        <div aria-hidden="true" style={css('width:42px;height:42px;border-radius:13px;background:var(--accent-soft);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 16.4H6l1.4-2.3V11a4.6 4.6 0 0 1 9.2 0v3.1z" /><path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" /></svg>
        </div>
        <div style={css('flex:1;min-width:0')}>
          <h2 id="push-notifications-title" style={css('margin:0;font-size:16px;font-weight:700;letter-spacing:-.25px')}>Push Notifications</h2>
        </div>
        <span style={{ ...css('flex:none;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:650;white-space:nowrap'), background: pill.bg, color: pill.ink }}>{pill.label}</span>
      </div>
      {body}
      {(push.error || push.notice) && (
        <div role="status" aria-live="polite" style={css('margin-top:12px;font-size:12.5px;line-height:1.5;color:' + (push.error ? 'var(--danger-text)' : 'var(--success-text)'))}>
          {push.error ?? (push.status === 'on' && push.notice === 'Push Notifications Enabled' ? null : push.notice)}
        </div>
      )}
    </section>
  );
}
