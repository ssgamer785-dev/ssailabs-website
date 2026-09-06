import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import {AuthProvider} from './lib/auth';
import {AuthGate} from './components/AuthGate';
import {desktop} from './lib/desktop';
import './index.css';

/*
 * File → Print… in the desktop window's menu, and the Ctrl+P that goes with
 * it. Chromium does not bind Ctrl+P inside an Electron window on its own, so
 * the menu item asks the page to print itself — the same `window.print()` the
 * app's own Print buttons call, so the same @media print rules apply and the
 * customer bill and production slip come out exactly as they do on the web.
 * The website has no such bridge and this does nothing there.
 */
desktop?.onPrintRequested(() => window.print());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        {/* Nothing behind this gate renders until an authorised Admin is
            signed in. Row Level Security enforces the same rule in the
            database, so skipping the gate would still yield no data. */}
        <AuthGate>
          <App />
        </AuthGate>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
