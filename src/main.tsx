import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lockAppZoom } from './lib/app-zoom';
import './index.css';
import { installNotificationAudioUnlock } from './lib/useNotificationSound';
import { preloadMoneyRefreshSound } from './lib/useMoneySound';

// Installed here rather than in a component effect: it is app-wide and
// lifetime-long, and StrictMode double-invokes effects, which would register
// it twice in development.
lockAppZoom();
installNotificationAudioUnlock();
preloadMoneyRefreshSound();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') preloadMoneyRefreshSound();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
