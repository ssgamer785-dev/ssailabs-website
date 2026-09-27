import { useRef, useSyncExternalStore, useState } from 'react';
import {
  clearRefreshAudioDiagnostics,
  getRefreshAudioDiagnostics,
  refreshAudioDiagnosticsEnabled,
  refreshAudioExperimentMode,
  stopRefreshAudioDiagnostics,
  subscribeRefreshAudioDiagnostics,
  summarizeRefreshAudioDiagnostics,
  traceRefreshAudio,
  userActivationSnapshot,
  type RefreshAudioDiagnostic,
} from '../lib/audio/refresh-diagnostics';
import { audioPreferenceEnabled } from '../lib/audio/preferences';
import { pushAvailability, sendTestPush } from '../lib/notifications/push';
import { useRefreshHandler } from './PhoneShell';

/**
 * Diagnostic-only refresh action. Public screens (/welcome, /login) register
 * no handler, so pull-to-refresh is inert there; this one arms the identical
 * touch-start prepare → touch-end play path so the test needs no sign-in.
 * On signed-in screens it simply runs alongside the real handlers.
 */
const diagnosticRefresh = () => { traceRefreshAudio('diagnostic-refresh-handler'); };

/** Device context a pasted log needs: Safari vs Chrome on iOS are both WebKit. */
function logHeader(events: readonly RefreshAudioDiagnostic[]): string[] {
  const nav = navigator as Navigator & { standalone?: boolean; audioSession?: { type?: string } };
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return [
    `ua: ${nav.userAgent}`,
    `build: ${typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev'} · origin: ${location.host} · push: ${pushAvailability()}/${typeof Notification === 'undefined' ? 'n/a' : Notification.permission}`,
    `standalone: ${standalone ? 'yes' : 'no'} · audioSession: ${nav.audioSession?.type ?? 'n/a'} · audio mode: ${refreshAudioExperimentMode()} · refresh/notification sound: ${audioPreferenceEnabled('refreshSound') ? 'on' : 'off'}/${audioPreferenceEnabled('notificationSound') ? 'on' : 'off'} · activation api: ${userActivationSnapshot() === 'n/a' ? 'no' : 'yes'}`,
    `captured: ${new Date().toISOString()}`,
    `summary: ${summarizeRefreshAudioDiagnostics(events)}`,
    '---',
  ];
}

/** Opt-in Preview diagnostic; remove this component before the final release. */
export function RefreshAudioDiagnosticPanel() {
  const events = useSyncExternalStore(subscribeRefreshAudioDiagnostics, getRefreshAudioDiagnostics);
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [silentMarks, setSilentMarks] = useState('');
  const [delayedMarks, setDelayedMarks] = useState('');
  const logRef = useRef<HTMLPreElement>(null);
  // Subscribed, not read once: Close leaves the event list untouched, so a
  // plain read never re-rendered and the panel stayed on screen.
  const enabled = useSyncExternalStore(subscribeRefreshAudioDiagnostics, refreshAudioDiagnosticsEnabled);
  useRefreshHandler(diagnosticRefresh, enabled);
  if (!enabled) return null;
  const origin = events[0]?.at ?? 0;
  const lines = events.map(item => `${((item.at - origin) / 1000).toFixed(2)}s ${item.event}${item.detail ? ` · ${item.detail}` : ''}`);

  // The Clipboard API is absent on plain-http origins (e.g. a LAN dev server)
  // and may reject; a silent failure would hand back a stale clipboard. Fall
  // back to selecting the log so iOS's own Copy menu can take it.
  const text = () => [...logHeader(events), ...lines].join('\n');

  // iOS share sheet: Messages, Mail, Notes or AirDrop, with no selecting.
  const share = async () => {
    try {
      if (!navigator.share) throw new Error('unavailable');
      await navigator.share({ title: 'Traders Planet audio log', text: text() });
      setCopyStatus('Shared ✓');
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') download();
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `traders-planet-audio-log-${Date.now()}.txt` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setCopyStatus('Saved as a .txt file (Files → Downloads).');
  };

  const testPush = async () => {
    setCopyStatus('Sending test notification…');
    try {
      const result = await sendTestPush();
      traceRefreshAudio('push-test', `attempted=${result.attempted} delivered=${result.delivered} statuses=${result.statuses.join(',') || '-'}`);
      setCopyStatus(result.attempted
        ? `Test sent to ${result.delivered}/${result.attempted} registered device(s) — push service status ${result.statuses.join(', ')}.`
        : 'No device is registered for this account yet — enable notifications first.');
    } catch (error) {
      traceRefreshAudio('push-test-failed', (error as Error)?.message);
      setCopyStatus(`Test failed: ${(error as Error)?.message}`);
    }
  };

  const copy = async () => {
    const content = text();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(content);
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
      <span style={{ opacity: .75 }}>{events.filter(item => item.event === 'refresh-fire').length} refreshes logged</span>
      <button type="button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide log' : 'Show log'}</button>
      <button type="button" onClick={stopRefreshAudioDiagnostics}>Close</button>
    </div>
    {expanded && <>
      <p style={{ margin: '8px 0' }}>Recording runs by itself: do your pulls WITHOUT tapping this panel (a tap here is a tap, and changes what is measured). Afterwards, note which refresh numbers were silent or late, save them below, then share the log. It stays on this device, survives a reload, and contains no account data.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 8px' }}>
        <label>Silent #s <input value={silentMarks} onChange={e => setSilentMarks(e.target.value.replace(/[^0-9,\- ]/g, ''))} placeholder="e.g. 7-12, 15" inputMode="numeric" style={{ width: 110 }} /></label>
        <label>Late #s <input value={delayedMarks} onChange={e => setDelayedMarks(e.target.value.replace(/[^0-9,\- ]/g, ''))} placeholder="e.g. 3" inputMode="numeric" style={{ width: 80 }} /></label>
        <button type="button" onClick={() => {
          traceRefreshAudio('user-marks', `silent=[${silentMarks.trim() || '-'}] late=[${delayedMarks.trim() || '-'}]`);
          setCopyStatus('Marks saved into the log.');
        }}>Save marks</button>
      </div>
      <button type="button" onClick={() => { void share(); }}>Share log</button>{' '}
      <button type="button" onClick={() => { void copy(); }}>Copy log</button>{' '}
      <button type="button" onClick={download}>Download .txt</button>{' '}
      <button type="button" onClick={() => { void testPush(); }}>Send test push</button>{' '}
      <button type="button" onClick={() => { setCopyStatus(''); clearRefreshAudioDiagnostics(); }}>Clear</button>
      {copyStatus && <p role="status" style={{ margin: '6px 0 0' }}>{copyStatus}</p>}
      <pre ref={logRef} style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text', WebkitUserSelect: 'text' }}>{text()}</pre>
    </>}
  </section>;
}
