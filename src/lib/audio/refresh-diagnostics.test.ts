import { describe, expect, it } from 'bun:test';
import { nextRefreshNumber, summarizeRefreshAudioDiagnostics, type RefreshAudioDiagnostic } from './refresh-diagnostics';

const trace = (event: string, detail?: string): RefreshAudioDiagnostic => ({ at: 0, event, detail });

describe('refresh audio diagnostics', () => {
  it('continues refresh numbering from the stored trace', () => {
    expect(nextRefreshNumber([])).toBe(1);
    expect(nextRefreshNumber([
      trace('refresh-fire', '#7 1 handler(s) activation=active'),
      trace('heard: yes'),
    ])).toBe(8);
  });

  it('summarises where audible refreshes turned silent', () => {
    expect(summarizeRefreshAudioDiagnostics([
      trace('refresh-fire', '#1 1 handler(s) activation=active'),
      trace('ctx-created', '#2 suspended 48000Hz live=1'),
      trace('ctx-statechange', '#2 closed live=0'),
      trace('heard: yes'),
      trace('refresh-fire', '#2 1 handler(s) activation=active'),
      trace('ctx-created', '#3 suspended 48000Hz live=1'),
      trace('clock-after-150ms', 'running +0.000s STALLED'),
      trace('source-watchdog', 'running'),
      trace('heard: silent'),
      trace('refresh-fire', '#3 1 handler(s) activation=none'),
      trace('nctx-statechange', 'interrupted'),
      trace('start-deadline', 'suspended'),
      trace('heard: silent'),
    ])).toBe('refreshes 3 · heard yes/silent/delayed 1/2/0 · last heard after #1, first silent after #2'
      + ' · ctx created/closed 2/1 · interrupted 1 · deadline 1 · stalled 1 · watchdog 1');
  });
});
