import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

const C = {
  instrument: ['Gold (XAUUSD)', 'EUR/USD', 'US30', 'BTC/USD'],
  balance: [10000, 5000, 25000, 50000],
  risk: [2, 1, 3, 5],
  entry: [3365, 3372, 3358],
  sl: [3358, 3364, 3350],
  tp: [3380, 3392, 3372],
} as const;

type Key = keyof typeof C;

function money(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Row({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <div onClick={onClick} style={css('display:flex;align-items:center;gap:12px;cursor:pointer')}>
      <div style={css('flex:1;font-size:13px;color:#475569;white-space:nowrap')}>{label}</div>
      <Hoverable style={css('width:186px;height:40px;border:1px solid #E7EBF2;border-radius:10px;background:#fff;display:flex;align-items:center;padding:0 12px;gap:8px')} hoverStyle={css('border-color:#0B5FEF')}>
        <div style={css('flex:1;font-size:13.5px;font-weight:500;color:#334155;white-space:nowrap;overflow:hidden')}>{value}</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C2CAD6" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
      </Hoverable>
    </div>
  );
}

function ResultCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={css('background:#FFFFFF;border:1px solid #EDF0F6;border-radius:12px;box-shadow:0 2px 8px rgba(15,23,42,.035);padding:11px 13px 12px;display:flex;flex-direction:column;gap:3px')}>
      <div style={css('font-size:10.5px;color:#94A3B8')}>{label}</div>
      <div style={css('font-size:20px;font-weight:800;letter-spacing:-.6px')}>{value}</div>
      <div style={css('font-size:10.5px;color:#94A3B8')}>{sub}</div>
    </div>
  );
}

export function RiskCalculatorScreen() {
  const navigate = useNavigate();
  const [ci, setCi] = useState<Record<Key, number>>({ instrument: 0, balance: 0, risk: 0, entry: 0, sl: 0, tp: 0 });
  const [pricesTouched, setPricesTouched] = useState(false);

  function cycle(k: Key) {
    setCi(p => ({ ...p, [k]: (p[k] + 1) % C[k].length }));
    if (k === 'entry' || k === 'sl' || k === 'tp') setPricesTouched(true);
  }

  const instrument = C.instrument[ci.instrument];
  const balance = C.balance[ci.balance];
  const risk = C.risk[ci.risk];
  const entry = C.entry[ci.entry];
  const sl = C.sl[ci.sl];
  const tp = C.tp[ci.tp];
  const riskAmount = (balance * risk) / 100;
  const stopDist = Math.max(0.01, Math.abs(entry - sl));
  const lots = riskAmount / (stopDist * 46.08);
  const rrNum = Math.abs(tp - entry) / stopDist;
  const rr = pricesTouched ? '1:' + rrNum.toFixed(2) : '1:2.50';
  const units = Math.round((Math.round(lots * 100) / 100) * 100000).toLocaleString('en-US');

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <svg onClick={() => navigate(-1)} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;padding-right:22px')}>Risk Calculator</div>
      </div>
      <div style={css('flex:none;padding:8px 20px 0;display:flex;flex-direction:column;gap:9px')}>
        <Row label="Instrument" value={instrument} onClick={() => cycle('instrument')} />
        <Row label="Account Balance" value={'$' + balance.toLocaleString('en-US')} onClick={() => cycle('balance')} />
        <Row label="Risk Percentage" value={risk + '%'} onClick={() => cycle('risk')} />
        <Row label="Entry Price" value={String(entry)} onClick={() => cycle('entry')} />
        <Row label="Stop Loss" value={String(sl)} onClick={() => cycle('sl')} />
        <Row label="Take Profit" value={String(tp)} onClick={() => cycle('tp')} />
      </div>
      <Hoverable style={css('flex:none;margin:20px 20px 0;height:48px;border-radius:12px;background:#0B5FEF;box-shadow:0 10px 22px rgba(11,95,239,.28);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#FFFFFF;cursor:pointer')} hoverStyle={css('background:#0A52D6')}>
        Calculate
      </Hoverable>
      <div style={css('flex:none;padding:16px 20px 0;display:grid;grid-template-columns:1fr 1fr;gap:11px')}>
        <ResultCard label="Position Size" value={lots.toFixed(2)} sub="Lots" />
        <ResultCard label="Risk Amount" value={money(riskAmount)} sub="Per trade" />
        <ResultCard label="Max Loss" value={money(riskAmount)} sub="At stop loss" />
        <ResultCard label="Risk Reward" value={rr} sub="Ratio" />
        <ResultCard label="Lot Size" value={lots.toFixed(2)} sub="Standard" />
        <ResultCard label="Units" value={units} sub="Units" />
      </div>
      <div style={css('flex:1')} />
    </PhoneShell>
  );
}
