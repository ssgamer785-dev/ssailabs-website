import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary';
import {AuthProvider} from './lib/auth';
import {AuthGate} from './components/AuthGate';
import './index.css';

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
