import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { DEPOSIT_CURRENCIES, INSTRUMENTS, type CurrencyCode } from '../lib/calculator/instruments';
import {
  calculatePositionSize,
  formatSize,
  type CalculatorResult,
  type RiskUnit,
} from '../lib/calculator/position-size';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';

const LABEL = css('font-size:14px;font-weight:700;letter-spacing:-.1px;color:#0F172A');
const FIELD = css('margin-top:9px;height:52px;border:1px solid #D8DEE8;border-radius:8px;background:#FFFFFF;display:flex;align-items:center;padding:0 14px');
const INPUT = css('flex:1;font-size:16px;height:100%;color:#0F172A;background:transparent;border:0;outline:none;min-width:0');
/** Native select keeps the platform picker on mobile; the chevron is drawn by the wrapper. */
const SELECT = css('flex:1;font-size:16px;height:100%;color:#0F172A;background:transparent;border:0;outline:none;appearance:none;-webkit-appearance:none;cursor:pointer;min-width:0');

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-left:8px')}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={css('flex:none')}>
      <div style={LABEL}>{label}</div>
      {children}
    </div>
  );
}

function ResultColumn({ label, value }: { label: string; value: string }) {
  return (
    <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0')}>
      <div style={css('font-size:13px;font-weight:500;color:#64748B;white-space:nowrap')}>{label}</div>
      <div style={css('font-size:30px;font-weight:800;letter-spacing:-1px;color:#0F172A;white-space:nowrap')}>{value}</div>
    </div>
  );
}

export function RiskCalculatorScreen() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Prefilled with the worked example so the screen is usable on arrival.
  const [instrumentSymbol, setInstrumentSymbol] = useState('XAUUSD');
  const [depositCurrency, setDepositCurrency] = useState<CurrencyCode>('USD');
  const [openPrice, setOpenPrice] = useState('4163.91000');
  const [stopLossPrice, setStopLossPrice] = useState('4080.63180');
  const [accountBalance, setAccountBalance] = useState('100000');
  const [risk, setRisk] = useState('2');
  const [riskUnit, setRiskUnit] = useState<RiskUnit>('percent');

  // Results deliberately only move when Calculate is pressed.
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculate() {
    const outcome = calculatePositionSize({
      instrumentSymbol,
      depositCurrency,
      openPrice,
      stopLossPrice,
      accountBalance,
      risk,
      riskUnit,
    });
    if (outcome.status === 'ok') {
      setResult(outcome.result);
      setError(null);
    } else {
      setResult(null);
      setError(outcome.error);
    }
  }

  return (
    <PhoneShell scrollRef={scrollRef}>
      <StatusBar />

      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <svg onClick={() => navigate(-1)} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;padding-right:22px')}>Risk Calculator</div>
      </div>

      <div ref={scrollRef} style={css('flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch')}>
        <div style={css('padding:6px 20px 0;display:flex;flex-direction:column;gap:18px')}>

          <Field label="Instrument">
            <div style={FIELD}>
              <select value={instrumentSymbol} onChange={e => setInstrumentSymbol(e.target.value)} style={SELECT}>
                {INSTRUMENTS.map(i => <option key={i.symbol} value={i.symbol}>{i.label}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>

          <Field label="Deposit currency">
            <div style={FIELD}>
              <select value={depositCurrency} onChange={e => setDepositCurrency(e.target.value as CurrencyCode)} style={SELECT}>
                {DEPOSIT_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <Chevron />
            </div>
          </Field>

          <Field label="Open price">
            <div style={FIELD}>
              <input
                value={openPrice}
                onChange={e => setOpenPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                style={INPUT}
              />
            </div>
          </Field>

          <Field label="Stop loss price">
            <div style={FIELD}>
              <input
                value={stopLossPrice}
                onChange={e => setStopLossPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                style={INPUT}
              />
            </div>
          </Field>

          <Field label="Account Balance">
            <div style={FIELD}>
              <input
                value={accountBalance}
                onChange={e => setAccountBalance(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                style={INPUT}
              />
            </div>
          </Field>

          <Field label="Risk">
            <div style={css('margin-top:9px;display:flex;gap:12px')}>
              <div style={css('flex:1;height:52px;border:1px solid #D8DEE8;border-radius:8px;background:#FFFFFF;display:flex;align-items:center;padding:0 14px;min-width:0')}>
                <input
                  value={risk}
                  onChange={e => setRisk(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  style={INPUT}
                />
              </div>
              <div style={css('flex:1;height:52px;border:1px solid #D8DEE8;border-radius:8px;background:#FFFFFF;display:flex;align-items:center;padding:0 14px;min-width:0')}>
                <select value={riskUnit} onChange={e => setRiskUnit(e.target.value as RiskUnit)} style={SELECT}>
                  <option value="percent">%</option>
                  {/* Always "$": a non-USD account is stopped by the FX guard
                      before any result is produced, so this can never mislabel
                      a calculation that actually succeeded. */}
                  <option value="currency">$</option>
                </select>
                <Chevron />
              </div>
            </div>
          </Field>

          <div
            onClick={() => navigate('/chat/admin')}
            style={css('font-size:14px;font-weight:700;color:#0B5FEF;text-decoration:underline;cursor:pointer;line-height:1.4')}
          >
            Calculate lot size in MT4/MT5?
          </div>

          {error && (
            <div style={css('font-size:12.5px;color:#EF4444;line-height:1.45;text-wrap:pretty')}>{error}</div>
          )}
        </div>

        <div style={css('margin-top:22px;border-top:1px solid #EDF0F6;padding:24px 20px 0;display:flex;justify-content:center')}>
          <Hoverable
            onClick={calculate}
            style={css('width:230px;height:56px;border-radius:999px;background:#0B5FEF;box-shadow:0 10px 22px rgba(11,95,239,.28);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:#FFFFFF;cursor:pointer;letter-spacing:-.2px')}
            hoverStyle={css('background:#0A52D6')}
          >
            Calculate
          </Hoverable>
        </div>

        <div style={css('padding:26px 20px 12px;display:flex;align-items:flex-start;gap:12px')}>
          <ResultColumn label="Lots (trade size)" value={result ? formatSize(result.lots, 2) : '—'} />
          <ResultColumn label="Units (trade size)" value={result ? formatSize(result.units, 3) : '—'} />
        </div>

        {result && (
          <div style={css('padding:0 20px 30px;text-align:center;font-size:11.5px;color:#94A3B8;line-height:1.5')}>
            {result.direction === 'long' ? 'Long' : 'Short'} · risking {formatSize(result.riskAmount, 2)} {depositCurrency} over {formatSize(result.stopDistance, result.instrument.pricePrecision)} points · {formatSize(result.instrument.contractSize, 0)} units per lot
          </div>
        )}
        {!result && <div style={css('height:30px')} />}
      </div>
    </PhoneShell>
  );
}
