import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lockAppZoom } from './lib/app-zoom';
import './index.css';
import { installNotificationAudioUnlock } from './lib/useNotificationSound';
import { preloadMoneyRefreshSound, resetMoneyRefreshAudioSession } from './lib/useMoneySound';
import { refreshAudioExperimentMode, traceRefreshAudio } from './lib/audio/refresh-diagnostics';
import { RefreshAudioDiagnosticPanel } from './components/RefreshAudioDiagnosticPanel';

// Installed here rather than in a component effect: it is app-wide and
// lifetime-long, and StrictMode double-invokes effects, which would register
// it twice in development.
lockAppZoom();
// The first load's pageshow fires before this module runs, so mark boot here.
// A reload also takes the separate tryAutoplay path, so record which it was.
traceRefreshAudio('boot', `${(performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown'} mode=${refreshAudioExperimentMode()}`);
installNotificationAudioUnlock();
preloadMoneyRefreshSound();
document.addEventListener('visibilitychange', () => {
  traceRefreshAudio('visibility', document.visibilityState);
  if (document.visibilityState === 'visible') preloadMoneyRefreshSound();
  else resetMoneyRefreshAudioSession();
});
window.addEventListener('pagehide', e => { traceRefreshAudio('pagehide', e.persisted ? 'to bfcache' : 'unload'); resetMoneyRefreshAudioSession(); });
window.addEventListener('pageshow', e => { traceRefreshAudio('pageshow', e.persisted ? 'from bfcache' : 'fresh load'); preloadMoneyRefreshSound(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RefreshAudioDiagnosticPanel />
  </StrictMode>,
);
