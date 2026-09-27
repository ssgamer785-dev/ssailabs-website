import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lockAppZoom } from './lib/app-zoom';
import './index.css';
import { installNotificationAudioUnlock } from './lib/useNotificationSound';
import { preloadMoneyRefreshSound, resetMoneyRefreshAudioSession } from './lib/useMoneySound';
import { traceRefreshAudio } from './lib/audio/refresh-diagnostics';
import { RefreshAudioDiagnosticPanel } from './components/RefreshAudioDiagnosticPanel';

// Installed here rather than in a component effect: it is app-wide and
// lifetime-long, and StrictMode double-invokes effects, which would register
// it twice in development.
lockAppZoom();
installNotificationAudioUnlock();
preloadMoneyRefreshSound();
document.addEventListener('visibilitychange', () => {
  traceRefreshAudio('visibility', document.visibilityState);
  if (document.visibilityState === 'visible') preloadMoneyRefreshSound();
  else resetMoneyRefreshAudioSession();
});
window.addEventListener('pagehide', () => { traceRefreshAudio('pagehide'); resetMoneyRefreshAudioSession(); });
window.addEventListener('pageshow', () => { traceRefreshAudio('pageshow'); preloadMoneyRefreshSound(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RefreshAudioDiagnosticPanel />
  </StrictMode>,
);
