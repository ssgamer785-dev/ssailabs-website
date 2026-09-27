import { useRef, useSyncExternalStore, useState } from 'react';
import {
  getRefreshAudioDiagnostics,
  refreshAudioDiagnosticsEnabled,
  stopRefreshAudioDiagnostics,
  subscribeRefreshAudioDiagnostics,
  traceRefreshAudio,
} from '../lib/audio/refresh-diagnostics';
import { audioPreferenceEnabled } from '../lib/audio/preferences';

/** Device context a pasted log needs: Safari vs Chrome on iOS are both WebKit. */
function logHeader(): string[] {
  const nav = navigator as Navigator & { standalone?: boolean; audioSession?: { type?: string } };
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return [
    `ua: ${nav.userAgent}`,
    `standalone: ${standalone ? 'yes' : 'no'} · audioSession: ${nav.audioSession?.type ?? 'n/a'} · refreshSound pref: ${audioPreferenceEnabled('refreshSound') ? 'on' : 'off'}`,
    `captured: ${new Date().toISOString()}`,
    '---',
  ];
}

/** Opt-in Preview diagnostic; remove this component before the final release. */
export function RefreshAudioDiagnosticPanel() {
  const events = useSyncExternalStore(subscribeRefreshAudioDiagnostics, getRefreshAudioDiagnostics);
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const logRef = useRef<HTMLPreElement>(null);
  if (!refreshAudioDiagnosticsEnabled()) return null;
  const origin = events[0]?.at ?? 0;
  const lines = events.map(item => `${((item.at - origin) / 1000).toFixed(2)}s ${item.event}${item.detail ? ` · ${item.detail}` : ''}`);

  // The Clipboard API is absent on plain-http origins (e.g. a LAN dev server)
  // and may reject; a silent failure would hand back a stale clipboard. Fall
  // back to selecting the log so iOS's own Copy menu can take it.
  const copy = async () => {
    const text = [...logHeader(), ...lines].join('\n');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied ✓ — paste it into the chat.');
    } catch {
      const log = logRef.current;
      if (log) window.getSelection()?.selectAllChildren(log);
      setCopyStatus('Automatic copy blocked — the log is selected: long-press it and choose Copy.');
    }
  };

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
      <button type="button" onClick={() => { void copy(); }}>Copy log</button>
      {copyStatus && <p role="status" style={{ margin: '6px 0 0' }}>{copyStatus}</p>}
      <pre ref={logRef} style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text', WebkitUserSelect: 'text' }}>{[...logHeader(), ...lines].join('\n')}</pre>
    </>}
  </section>;
}
