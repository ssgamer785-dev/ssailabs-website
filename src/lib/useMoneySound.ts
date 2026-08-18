import { useRef } from 'react';

/** Plays the "cha-ching" cash-register sound used on pull-to-refresh, via Web Audio synthesis (no audio asset). */
export function useMoneySound() {
  const acRef = useRef<AudioContext | null>(null);

  function audio() {
    if (!acRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      acRef.current = new AC();
    }
    if (acRef.current.state === 'suspended') acRef.current.resume();
    return acRef.current;
  }

  return function playMoney() {
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.5;
    master.connect(ac.destination);

    ([[1318.5, 0], [1975.5, 0.055]] as [number, number][]).forEach(([f, d], i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t0 + d);
      g.gain.setValueAtTime(0, t0 + d);
      g.gain.linearRampToValueAtTime(i ? 0.22 : 0.3, t0 + d + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.42);
      o.connect(g); g.connect(master);
      o.start(t0 + d); o.stop(t0 + d + 0.45);
    });

    ([[2637, 0.10], [2093, 0.155], [3136, 0.21]] as [number, number][]).forEach(([f, d]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(f, t0 + d);
      g.gain.setValueAtTime(0, t0 + d);
      g.gain.linearRampToValueAtTime(0.075, t0 + d + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.12);
      o.connect(g); g.connect(master);
      o.start(t0 + d); o.stop(t0 + d + 0.14);
    });

    const len = Math.floor(ac.sampleRate * 0.18);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.1;
    const ng = ac.createGain();
    ng.gain.value = 0.16;
    src.connect(bp); bp.connect(ng); ng.connect(master);
    src.start(t0);
  };
}
