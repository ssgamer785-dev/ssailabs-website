import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import {
  DEPOSIT_CURRENCIES,
  INSTRUMENTS,
  historicalChartUrl,
  liveChartUrl,
  type CurrencyCode,
  type InstrumentSpec,
} from '../lib/calculator/instruments';
import {
  calculatePositionSize,
  formatMoney,
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={css('flex:none')}>
      <div style={LABEL}>{label}</div>
      {children}
    </div>
  );
}

/** One of the two trade-size columns. The dotted label underline follows the reference. */
function ResultColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0')}>
      <div style={css('font-size:13.5px;font-weight:500;color:#475569;white-space:nowrap;border-bottom:1px dotted #94A3B8;padding-bottom:2px')}>
        {label}
      </div>
      {children}
    </div>
  );
}

const RESULT_VALUE = css('font-size:30px;font-weight:800;letter-spacing:-1px;color:#0F172A;white-space:nowrap;line-height:1.15');

/**
 * Explains how the calculated size maps onto the MT4/MT5 "Volume" box, and is
 * honest that a lot is not the same size at every broker. Opened from the
 * "Calculate lot size in MT4/MT5?" link and from the "?" lots value.
 */
function MtHelpModal({ instrument, onClose }: { instrument: InstrumentSpec; onClose: () => void }) {
  const known = instrument.contractSize !== null;
  return (
    <div
      onClick={onClose}
      style={css('position:absolute;inset:0;z-index:60;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px')}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={css('width:100%;max-height:100%;overflow-y:auto;background:#FFFFFF;border-radius:16px;box-shadow:0 18px 44px rgba(15,23,42,.24);padding:20px')}
      >
        <div style={css('font-size:16px;font-weight:800;letter-spacing:-.3px;color:#0F172A')}>Lot size in MT4/MT5</div>

        <div style={css('margin-top:12px;font-size:13px;line-height:1.55;color:#334155')}>
          MT4 and MT5 ask for <strong style={css('font-weight:700')}>Volume</strong>, which is measured in
          lots. <strong style={css('font-weight:700')}>Units</strong> above is the raw size of the position;{' '}
          <strong style={css('font-weight:700')}>Lots</strong> is that same size divided by the contract
          size your broker uses.
        </div>

        <div style={css('margin-top:14px;padding:12px 14px;background:#F5F7FB;border-radius:10px')}>
          {known ? (
            <div style={css('font-size:13px;line-height:1.55;color:#334155')}>
              For <strong style={css('font-weight:700')}>{instrument.label}</strong> this calculator uses the
              conventional <strong style={css('font-weight:700')}>1.00 lot = {instrument.contractSize!.toLocaleString('en-US')} units</strong>.
            </div>
          ) : (
            <div style={css('font-size:13px;line-height:1.55;color:#334155')}>
              <strong style={css('font-weight:700')}>{instrument.label}</strong> has no standard lot — brokers
              define it differently, so Lots shows <strong style={css('font-weight:700')}>?</strong> rather
              than a number that might not match your account. Units above is still exact.
            </div>
          )}
        </div>

        <div style={css('margin-top:14px;font-size:12.5px;line-height:1.55;color:#64748B')}>
          Contract sizes vary between brokers, and most platforms round Volume to a step (commonly 0.01)
          with a minimum trade size. Check the contract specification for your own account and round the
          figure above to the nearest step your broker accepts — always downwards, so you stay inside your
          intended risk.
        </div>

        <Hoverable
          onClick={onClose}
          style={css('margin-top:18px;height:46px;border-radius:999px;background:#0B5FEF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#FFFFFF;cursor:pointer')}
          hoverStyle={css('background:#0A52D6')}
        >
          Got it
        </Hoverable>
      </div>
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
  const [helpOpen, setHelpOpen] = useState(false);

  // Chart links follow the dropdown, not the last calculation, so the labels
  // stay truthful the moment the instrument changes.
  const selected = INSTRUMENTS.find(i => i.symbol === instrumentSymbol) ?? INSTRUMENTS[0];

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
            onClick={() => setHelpOpen(true)}
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

        {/* ---- results ---- */}
        <div style={css('padding:22px 20px 0;display:flex;align-items:flex-start;gap:12px')}>
          <ResultColumn label="Lots (trade size)">
            {!result ? (
              <div style={RESULT_VALUE}>—</div>
            ) : result.lots === null ? (
              // No standard lot for this instrument: say so rather than invent one.
              <div
                onClick={() => setHelpOpen(true)}
                title={`${result.instrument.label} has no standard lot size across brokers`}
                style={css('font-size:30px;font-weight:800;color:#0B5FEF;cursor:pointer;line-height:1.15;border-bottom:2px dotted #0B5FEF')}
              >
                ?
              </div>
            ) : (
              <div style={RESULT_VALUE}>{formatSize(result.lots, 2)}</div>
            )}
          </ResultColumn>

          <ResultColumn label="Units (trade size)">
            <div style={RESULT_VALUE}>{result ? formatSize(result.units, 3) : '—'}</div>
          </ResultColumn>
        </div>

        <div style={css('padding:18px 20px 0;display:flex;flex-direction:column;align-items:center;gap:4px')}>
          <div style={css('font-size:15px;font-weight:500;color:#334155')}>Money at risk</div>
          <div style={css('font-size:32px;font-weight:800;letter-spacing:-1.1px;color:#0F172A;white-space:nowrap;line-height:1.15')}>
            {result ? formatMoney(result.riskAmount, depositCurrency) : '—'}
          </div>
        </div>

        <div style={css('padding:22px 20px 0;display:flex;flex-direction:column;align-items:center;gap:8px')}>
          <a
            href={liveChartUrl(selected)}
            target="_blank"
            rel="noreferrer"
            style={css('font-size:15.5px;font-weight:500;color:#0F172A;text-decoration:underline;cursor:pointer;text-align:center')}
          >
            View {selected.label} Live Chart
          </a>
          <a
            href={historicalChartUrl(selected)}
            target="_blank"
            rel="noreferrer"
            style={css('font-size:15.5px;font-weight:500;color:#0F172A;text-decoration:underline;cursor:pointer;text-align:center')}
          >
            View {selected.label} Historical Chart
          </a>
        </div>

        {result && (
          <div style={css('padding:18px 20px 0;text-align:center;font-size:11.5px;color:#94A3B8;line-height:1.5')}>
            {result.direction === 'long' ? 'Long' : 'Short'} · over {formatSize(result.stopDistance, result.instrument.pricePrecision)} points
            {result.instrument.contractSize !== null && ` · ${formatSize(result.instrument.contractSize, 0)} units per lot`}
          </div>
        )}

        <div style={css('height:30px')} />
      </div>

      {helpOpen && <MtHelpModal instrument={selected} onClose={() => setHelpOpen(false)} />}
    </PhoneShell>
  );
}
