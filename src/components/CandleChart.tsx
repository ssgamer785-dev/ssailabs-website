import { useMemo } from 'react';
import { css } from '../lib/css';
import { makeRand } from '../lib/rng';

export function CandleChart({ stamp, seed = 7 }: { stamp?: string; seed?: number }) {
  const bars = useMemo(() => {
    const rand = makeRand(seed);
    const n = 44;
    let price = 42;
    const out: { open: number; close: number; hi: number; lo: number; up: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const drift = Math.sin(i / 3.1) * 3.6 + 0.5;
      const open = price;
      let close = open + drift + (rand() - 0.5) * 7;
      close = Math.max(10, Math.min(88, close));
      const hi = Math.max(open, close) + rand() * 4.5;
      const lo = Math.min(open, close) - rand() * 4.5;
      price = close;
      out.push({ open, close, hi, lo, up: close >= open });
    }
    return out;
  }, [seed]);

  const slot = 100 / bars.length;
  const bw = slot * 0.56;

  return (
    <div style={css('position:absolute;inset:0;background:#080D1A;overflow:hidden')}>
      <div style={css('position:absolute;inset:0;background:radial-gradient(120% 90% at 20% 0%,rgba(37,99,235,.13),transparent 60%)')} />
      <div style={css('position:absolute;left:0;right:24px;top:20%;height:1px;background:rgba(148,163,184,.09)')} />
      <div style={css('position:absolute;left:0;right:24px;top:45%;height:1px;background:rgba(148,163,184,.09)')} />
      <div style={css('position:absolute;left:0;right:24px;top:70%;height:1px;background:rgba(148,163,184,.09)')} />
      <div style={css('position:absolute;left:0;right:24px;top:8%;bottom:6%')}>
        {bars.map((b, i) => {
          const left = i * slot + (slot - bw) / 2;
          const col = b.up ? '#22C55E' : '#EF4444';
          return (
            <div key={i}>
              <div style={{ position: 'absolute', left: `${left + bw / 2 - 0.16}%`, width: '1.2px', bottom: `${b.lo}%`, height: `${b.hi - b.lo}%`, background: col, opacity: 0.85 }} />
              <div style={{ position: 'absolute', left: `${left}%`, width: `${bw}%`, bottom: `${Math.min(b.open, b.close)}%`, height: `${Math.max(1.4, Math.abs(b.close - b.open))}%`, background: col, borderRadius: '.5px' }} />
            </div>
          );
        })}
        <div style={css('position:absolute;left:2%;right:10%;bottom:18%;height:1px;background:rgba(234,179,8,.45);transform:rotate(-9deg);transform-origin:left center')} />
        <div style={css('position:absolute;left:4%;right:8%;bottom:30%;height:1px;background:rgba(56,189,248,.35);transform:rotate(6deg);transform-origin:left center')} />
      </div>
      <div style={css('position:absolute;top:0;right:0;bottom:0;width:24px;border-left:1px solid rgba(148,163,184,.12);background:rgba(8,13,26,.6);display:flex;flex-direction:column;justify-content:space-around;align-items:center;padding:6px 0')}>
        <div style={css('width:9px;height:1px;background:rgba(148,163,184,.3)')} />
        <div style={css('width:9px;height:1px;background:rgba(148,163,184,.3)')} />
        <div style={css('width:13px;height:6px;border-radius:1.5px;background:#16A34A')} />
        <div style={css('width:9px;height:1px;background:rgba(148,163,184,.3)')} />
        <div style={css('width:9px;height:1px;background:rgba(148,163,184,.3)')} />
        <div style={css('width:9px;height:1px;background:rgba(148,163,184,.3)')} />
      </div>
      {stamp && (
        <div style={css("position:absolute;right:32px;bottom:8px;font:500 10px/1 -apple-system,'SF Pro Text',Helvetica,Arial,sans-serif;color:rgba(255,255,255,.82);letter-spacing:-.1px")}>{stamp}</div>
      )}
    </div>
  );
}
