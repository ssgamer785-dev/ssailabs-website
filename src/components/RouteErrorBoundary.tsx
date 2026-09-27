import { Component, type ReactNode } from 'react';
import { PhoneShell } from './PhoneShell';
import { css } from '../lib/css';
import { isChunkLoadError } from '../lib/lazy-retry';

const RELOAD_KEY = 'tp-chunk-reload-at';

/**
 * Catches a screen that failed to load or crashed, instead of leaving an empty
 * page. A screen whose code could not be fetched usually means the tab is
 * running an older build than the server now has, or the connection dropped:
 * the first case is fixed by one automatic reload (at most once a minute, so
 * it can never loop); the second by retrying when the connection returns.
 * The error itself is always logged, never hidden.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error('[app] a screen failed to render:', error);
    if (!isChunkLoadError(error)) return;
    if (navigator.onLine && reloadAllowed()) {
      markReload();
      window.location.reload();
      return;
    }
    window.addEventListener('online', this.retry, { once: true });
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.retry);
  }

  retry = () => {
    markReload();
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const network = isChunkLoadError(this.state.error);
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <PhoneShell>
        <div role="alert" style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;text-align:center;background:var(--surface)')}>
          <div style={css('font-size:16px;font-weight:700;color:var(--text-primary)')}>
            {network ? (offline ? 'You are offline' : 'This screen could not load') : 'Something went wrong on this screen'}
          </div>
          <div style={css('font-size:13px;line-height:1.5;color:var(--text-muted);max-width:280px')}>
            {network
              ? (offline ? 'It will open as soon as your connection is back.' : 'Check your connection and try again.')
              : 'Reloading usually fixes it. If it keeps happening, please contact support.'}
          </div>
          <button type="button" onClick={this.retry}
            style={css('margin-top:4px;min-height:44px;padding:10px 22px;border-radius:12px;background:var(--accent);color:var(--on-accent);font-size:14px;font-weight:700;cursor:pointer')}>
            Try again
          </button>
          <a href="/home" style={css('font-size:13px;color:var(--accent);padding:10px')}>Go to Home</a>
        </div>
      </PhoneShell>
    );
  }
}

function reloadAllowed(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - last > 60_000;
  } catch { return true; }
}

function markReload(): void {
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}
