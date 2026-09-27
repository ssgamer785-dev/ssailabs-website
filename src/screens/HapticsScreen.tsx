import { useEffect, useState } from 'react';
import { css } from '../lib/css';
import { getAudioPreferences, setAudioPreference, subscribeAudioPreferences, type AudioPreference } from '../lib/audio/preferences';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';

function ToggleRow({ label, setting, checked }: { label: string; setting: AudioPreference; checked: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => setAudioPreference(setting, !checked)}
      style={{ ...css('width:100%;min-height:64px;padding:12px 15px;display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid var(--border);border-radius:15px;background:var(--surface);color:var(--text-primary);text-align:left;cursor:pointer'), boxShadow: '0 3px 12px rgba(0,0,0,.035)' }}>
      <span style={css('font-size:14px;font-weight:600;letter-spacing:-.15px')}>{label}</span>
      <span aria-hidden="true" style={{ ...css('flex:none;width:44px;height:26px;padding:3px;border-radius:999px;transition:background .18s ease'), background: checked ? 'var(--accent)' : 'var(--surface-secondary)' }}>
        <span style={{ ...css('display:block;width:20px;height:20px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .18s ease'), transform: checked ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

export function HapticsScreen() {
  const [preferences, setPreferences] = useState(getAudioPreferences);
  useEffect(() => subscribeAudioPreferences(() => setPreferences(getAudioPreferences())), []);
  return (
    <PhoneShell>
      <header style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback="/home" />
        <h1 style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>HAPTICS</h1>
        <span aria-hidden="true" style={css('width:40px;flex:none')} />
      </header>
      <main style={css('flex:1;min-height:0;overflow-y:auto;padding:17px 20px 28px')}>
        <p style={css('margin:0 0 18px;color:var(--text-muted);font-size:13px;line-height:1.55')}>Choose which app sounds you want to hear. Your choices are saved for this account.</p>
        <div style={css('display:flex;flex-direction:column;gap:10px')}>
          <ToggleRow label="Refresh Sound" setting="refreshSound" checked={preferences.refreshSound} />
          <ToggleRow label="Notification Sound" setting="notificationSound" checked={preferences.notificationSound} />
        </div>
        <p style={css('margin:14px 2px 0;color:var(--text-faint);font-size:11px;line-height:1.5')}>Sound playback follows your browser and device audio permissions.</p>
      </main>
      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
