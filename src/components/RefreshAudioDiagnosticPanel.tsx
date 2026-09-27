import { useSyncExternalStore, useState } from 'react';
import {
  getRefreshAudioDiagnostics,
  refreshAudioDiagnosticsEnabled,
  stopRefreshAudioDiagnostics,
  subscribeRefreshAudioDiagnostics,
  traceRefreshAudio,
} from '../lib/audio/refresh-diagnostics';

/** Opt-in Preview diagnostic; remove this component before the final release. */
export function RefreshAudioDiagnosticPanel() {
  const events = useSyncExternalStore(subscribeRefreshAudioDiagnostics, getRefreshAudioDiagnostics);
  const [expanded, setExpanded] = useState(false);
  if (!refreshAudioDiagnosticsEnabled()) return null;
  const origin = events[0]?.at ?? 0;
  const lines = events.map(item => `${((item.at - origin) / 1000).toFixed(2)}s ${item.event}${item.detail ? ` · ${item.detail}` : ''}`);

  return <section aria-label="Refresh audio diagnostic" style={{
    position: 'fixed', zIndex: 99999, left: 8, right: 8, bottom: 'max(8px, env(safe-area-inset-bottom))',
    maxHeight: expanded ? '48vh' : 'auto', overflow: 'auto', borderRadius: 12,
    background: '#071c38', color: '#fff', boxShadow: '0 4px 22px #0008',
    padding: 10, font: '12px/1.4 system-ui, sans-serif',
  }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Audio diagnostic</strong>
      <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide log' : 'Show log'}</button>
      <button type="button" onClick={() => traceRefreshAudio('heard: yes')}>Heard</button>
      <button type="button" onClick={() => traceRefreshAudio('heard: silent')}>Silent</button>
      <button type="button" onClick={() => traceRefreshAudio('heard: delayed')}>Delayed</button>
      <button type="button" onClick={stopRefreshAudioDiagnostics}>Close</button>
    </div>
    {expanded && <>
      <p style={{ margin: '8px 0' }}>Pull to refresh, then mark what you heard. The log stays on this device; it contains no account data.</p>
      <button type="button" onClick={() => { void navigator.clipboard?.writeText(lines.join('\n')); }}>Copy log</button>
      <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{lines.join('\n')}</pre>
    </>}
  </section>;
}
