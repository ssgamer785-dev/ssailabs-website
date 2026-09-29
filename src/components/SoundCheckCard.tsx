import { useEffect, useRef, useState } from 'react';
import { css } from '../lib/css';
import { traceRefreshAudio } from '../lib/audio/refresh-diagnostics';
import { sharedAudioOutput } from '../lib/audio/shared-output';
import { describeOutput, runSoundCheck, SOUND_CHECK_WINDOW_MS, type SoundCheckResult } from '../lib/audio/sound-check';
import { useAudioOutputStatus } from '../lib/audio/useAudioOutputStatus';
import { primeVoicePlayback } from '../lib/chat/voice-player';
import { playNotificationChimeForCheck } from '../lib/useNotificationSound';
import { playMoneyRefreshSoundForCheck } from '../lib/useMoneySound';

type Which = 'refresh' | 'notification';

const TONES = {
  good: { bg: 'var(--success-soft)', ink: 'var(--success-text)' },
  wait: { bg: 'var(--warning-soft-3)', ink: 'var(--warning-ink-3)' },
  bad: { bg: 'var(--danger-soft)', ink: 'var(--danger-text)' },
  neutral: { bg: 'var(--surface-secondary)', ink: 'var(--text-secondary)' },
} as const;

const TEST_BUTTON = css('flex:1;min-height:46px;border:1px solid var(--border);border-radius:13px;background:var(--surface);color:var(--text-primary);font-size:13.5px;font-weight:650;cursor:pointer');
const ANSWER_BUTTON = css('flex:1;min-height:42px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-primary);font-size:13px;font-weight:650;cursor:pointer');

/**
 * The recovery path for "the sound did not play". A test runs inside the
 * member's tap, which is what an iPhone requires before it starts app sound,
 * so pressing it also unlocks sound for the rest of the session. It reports
 * what the device did, then asks whether the member heard it: a web page
 * cannot know that.
 */
export function SoundCheckCard() {
  const status = useAudioOutputStatus();
  const [running, setRunning] = useState<Which | null>(null);
  const [result, setResult] = useState<SoundCheckResult | null>(null);
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const description = describeOutput(status);
  const tone = TONES[description.tone];

  const test = (which: Which) => {
    if (running) return;
    setRunning(which);
    setResult(null);
    setAnswer(null);
    traceRefreshAudio('sound-check-start', which);
    // runSoundCheck performs unlock and play before its first await, inside this tap.
    void runSoundCheck({
      prime: primeVoicePlayback,
      unlock: () => sharedAudioOutput.unlock(true) !== null,
      play: () => {
        if (which === 'refresh') playMoneyRefreshSoundForCheck(SOUND_CHECK_WINDOW_MS);
        else void playNotificationChimeForCheck(SOUND_CHECK_WINDOW_MS);
      },
      status: () => sharedAudioOutput.status(),
    }).then(outcome => {
      traceRefreshAudio('sound-check-result', `${which} ${outcome}`);
      if (!mounted.current) return;
      setResult(outcome);
      setRunning(null);
    });
  };

  const answerHeard = (heard: boolean) => {
    traceRefreshAudio('sound-check-answer', heard ? 'yes' : 'no');
    setAnswer(heard ? 'yes' : 'no');
  };

  return (
    <section aria-labelledby="sound-check-title" style={{ ...css('margin-top:22px;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)'), boxShadow: '0 3px 12px rgba(0,0,0,.035)' }}>
      <div style={css('display:flex;align-items:center;gap:10px;justify-content:space-between')}>
        <h2 id="sound-check-title" style={css('margin:0;font-size:15px;font-weight:700;letter-spacing:-.2px')}>Sound check</h2>
        <span role="status" style={{ ...css('flex:none;padding:4px 10px;border-radius:999px;font-size:11.5px;font-weight:650;white-space:nowrap'), background: tone.bg, color: tone.ink }}>{description.title}</span>
      </div>
      <p style={css('margin:10px 0 0;font-size:12.5px;line-height:1.55;color:var(--text-muted)')}>{description.detail}</p>
      <div style={css('display:flex;gap:10px;margin-top:14px')}>
        <button type="button" disabled={running !== null} onClick={() => test('refresh')} style={{ ...TEST_BUTTON, opacity: running ? .7 : 1 }}>
          {running === 'refresh' ? 'Testing…' : 'Test refresh sound'}
        </button>
        <button type="button" disabled={running !== null} onClick={() => test('notification')} style={{ ...TEST_BUTTON, opacity: running ? .7 : 1 }}>
          {running === 'notification' ? 'Testing…' : 'Test notification sound'}
        </button>
      </div>

      {result === 'started' && answer === null && (
        <div role="status" style={css('margin-top:14px')}>
          <div style={css('font-size:13px;font-weight:650')}>Your device started the sound. Did you hear it?</div>
          <div style={css('display:flex;gap:10px;margin-top:10px')}>
            <button type="button" onClick={() => answerHeard(true)} style={ANSWER_BUTTON}>Yes, I heard it</button>
            <button type="button" onClick={() => answerHeard(false)} style={ANSWER_BUTTON}>No</button>
          </div>
        </div>
      )}
      {result === 'started' && answer === 'yes' && (
        <p role="status" style={css('margin:14px 0 0;font-size:13px;line-height:1.5;color:var(--success-text);font-weight:650')}>Sound is working on this device.</p>
      )}
      {result === 'started' && answer === 'no' && (
        <div role="status" style={css('margin-top:14px;font-size:12.5px;line-height:1.55;color:var(--text-secondary)')}>
          <div style={css('font-weight:650;color:var(--text-primary)')}>The app started the sound, so check the device:</div>
          <ol style={css('margin:8px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px')}>
            <li>Set the ring/silent switch to ring. On iPhone it can mute app sounds like this one.</li>
            <li>Turn the volume up.</li>
            <li>Disconnect Bluetooth speakers or headphones that may be receiving it.</li>
            <li>Close other apps that are playing audio, then test again.</li>
          </ol>
        </div>
      )}
      {result === 'blocked' && (
        <p role="alert" style={css('margin:14px 0 0;font-size:12.5px;line-height:1.55;color:var(--warning-ink-3)')}>
          Your device did not start the sound for that tap. Tap a test again. If it keeps happening, close the app completely and open it again.
        </p>
      )}
      {result === 'unsupported' && (
        <p role="alert" style={css('margin:14px 0 0;font-size:12.5px;line-height:1.55;color:var(--danger-text)')}>This browser cannot play the app&apos;s sounds.</p>
      )}
      <p style={css('margin:14px 0 0;font-size:11px;line-height:1.5;color:var(--text-muted)')}>
        The app can tell whether your device started a sound, not whether you can hear it. After the app is closed and reopened, an iPhone needs one tap before app sounds can play.
      </p>
    </section>
  );
}
