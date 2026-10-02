import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lockAppZoom } from './lib/app-zoom';
import './index.css';
import { installNotificationAudioUnlock } from './lib/useNotificationSound';
import { handleRefreshAudioLifecycle, preloadMoneyRefreshSound } from './lib/useMoneySound';
import { installPassiveInputTrace, refreshAudioDiagnosticsEnabled, refreshAudioExperimentMode, traceRefreshAudio } from './lib/audio/refresh-diagnostics';
import { RefreshAudioDiagnosticPanel } from './components/RefreshAudioDiagnosticPanel';
import { dropBootSplash } from './lib/boot-splash';

// Installed here rather than in a component effect: it is app-wide and
// lifetime-long, and StrictMode double-invokes effects, which would register
// it twice in development.
lockAppZoom();
// The first load's pageshow fires before this module runs, so mark boot here.
// A reload also takes the separate tryAutoplay path, so record which it was.
traceRefreshAudio('boot', `${(performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown'} mode=${refreshAudioExperimentMode()} build=${typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev'} standalone=${window.matchMedia?.('(display-mode: standalone)').matches ? 'yes' : 'no'}`);
if (refreshAudioDiagnosticsEnabled()) {
  // Other audio on the page changes the iOS audio category (voice notes and
  // video play as media playback; the microphone as play-and-record).
  for (const type of ['play', 'pause', 'ended'] as const) {
    document.addEventListener(type, event => {
      const media = event.target as HTMLMediaElement | null;
      if (media instanceof HTMLMediaElement) traceRefreshAudio(`media-${type}`, `${media.tagName.toLowerCase()} muted=${media.muted}`);
    }, true);
  }
  window.addEventListener('focus', () => traceRefreshAudio('focus'));
  window.addEventListener('blur', () => traceRefreshAudio('blur'));
}
installNotificationAudioUnlock();
installPassiveInputTrace();
preloadMoneyRefreshSound();
document.addEventListener('visibilitychange', () => {
  traceRefreshAudio('visibility', document.visibilityState);
  handleRefreshAudioLifecycle(document.visibilityState === 'visible' ? 'visible' : 'hidden');
});
window.addEventListener('pagehide', e => { traceRefreshAudio('pagehide', e.persisted ? 'to bfcache' : 'unload'); handleRefreshAudioLifecycle('pagehide', e.persisted); });
window.addEventListener('pageshow', e => { traceRefreshAudio('pageshow', e.persisted ? 'from bfcache' : 'fresh load'); handleRefreshAudioLifecycle('pageshow', e.persisted); });

// The first account request should not wait on a DNS lookup and a TLS handshake.
try {
  const api = new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;
  if (api !== location.origin && !document.querySelector(`link[rel=preconnect][href="${api}"]`)) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = api;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
} catch { /* no API address configured */ }

// Tells the start-up watchdog in index.html that the app is running.
(window as Window & { __tpBooted?: boolean }).__tpBooted = true;
// The React splash normally takes over index.html's splash within a frame or
// two of mounting; nothing may leave it covering the app if that never happens.
window.setTimeout(dropBootSplash, 10_000);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RefreshAudioDiagnosticPanel />
  </StrictMode>,
);
