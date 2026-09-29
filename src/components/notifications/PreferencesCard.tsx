import { css } from '../../lib/css';
import { NOTIFICATION_SETTINGS } from '../../lib/notifications/categories';
import { useNotificationPreferences } from '../../lib/notifications/usePreferences';

/** One switch, drawn like the app's other switches (Haptics, name visibility). */
function SettingRow({ label, description, checked, disabled, onToggle }: {
  label: string; description: string; checked: boolean; disabled: boolean; onToggle: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onToggle}
      style={{ ...css('width:100%;min-height:64px;padding:11px 0;display:flex;align-items:center;justify-content:space-between;gap:14px;border:0;border-top:1px solid var(--border-2);background:transparent;color:var(--text-primary);text-align:left;cursor:pointer'), opacity: disabled ? .55 : 1 }}>
      <span style={css('display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <span style={css('font-size:14px;font-weight:650;letter-spacing:-.15px')}>{label}</span>
        <span style={css('font-size:12px;line-height:1.4;color:var(--text-tertiary)')}>{description}</span>
      </span>
      <span aria-hidden="true" style={{ ...css('flex:none;width:44px;height:26px;padding:3px;border-radius:999px;transition:background .18s ease'), background: checked ? 'var(--accent)' : 'var(--switch-track)' }}>
        <span style={{ ...css('display:block;width:20px;height:20px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .18s ease'), transform: checked ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

/**
 * What the member wants to hear about. One switch per kind of event, kept in
 * Supabase for the account (so it follows them to every device). A switch
 * governs both the in-app list and push; each device is enabled separately
 * in the card above. Busy kinds (likes, Students Community posts) start off.
 */
export function PreferencesCard() {
  const { preferences, state, error, saving, setPreference } = useNotificationPreferences();
  const locked = state !== 'ready';
  return (
    <section aria-labelledby="notification-settings-title" style={{ ...css('flex:none;margin:0 20px 16px;padding:14px 16px 6px;border:1px solid var(--border);border-radius:18px;background:var(--surface)'), boxShadow: '0 3px 14px rgba(0,0,0,.04)' }}>
      <h2 id="notification-settings-title" style={css('margin:0 0 4px;font-size:15px;font-weight:700;letter-spacing:-.2px')}>What you get notified about</h2>
      <p style={css('margin:0 0 10px;font-size:12px;line-height:1.5;color:var(--text-tertiary)')}>
        Applies to your notification list and to push. Turn on Push Notifications above on each device where you want alerts.
      </p>
      {NOTIFICATION_SETTINGS.map(setting => (
        <SettingRow key={setting.key} label={setting.label} description={setting.description}
          checked={preferences[setting.key]} disabled={locked || saving === setting.key}
          onToggle={() => void setPreference(setting.key, !preferences[setting.key])} />
      ))}
      <div style={css('min-height:22px;padding:8px 0 6px')}>
        {state === 'loading' && <span role="status" style={css('font-size:12px;color:var(--text-muted)')}>Loading your settings…</span>}
        {error && <span role="alert" style={css('font-size:12px;line-height:1.45;color:var(--danger-text)')}>{error}</span>}
      </div>
    </section>
  );
}
