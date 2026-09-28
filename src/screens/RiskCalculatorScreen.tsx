import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import {
  DEPOSIT_CURRENCIES,
  INSTRUMENT_GROUPS,
  INSTRUMENTS,
  defaultMtContractSize,
  historicalChartUrl,
  isForex,
  liveChartUrl,
  unitName,
  type CurrencyCode,
  type InstrumentSpec,
} from '../lib/calculator/instruments';
import {
  calculateMtLots,
  calculatePositionSize,
  formatMoney,
  formatSize,
  stepDecimals,
  type BrokerSpecInput,
  type CalculatorResult,
  type MtLotResult,
  type RiskUnit,
} from '../lib/calculator/position-size';
import { FX_RATE_STALE_AFTER_MS, fetchFxRates } from '../lib/calculator/fx';
import { formatDateTime } from '../lib/format-date-time';
import { PhoneShell } from '../components/PhoneShell';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';

const LABEL = css('font-size:14px;font-weight:700;letter-spacing:-.1px;color:var(--text-primary)');
const FIELD = css('margin-top:9px;height:52px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);display:flex;align-items:center;padding:0 14px');
const INPUT = css('flex:1;font-size:16px;height:100%;color:var(--text-primary);background:transparent;border:0;outline:none;min-width:0');
/** Native select keeps the platform picker on mobile; the chevron is drawn by the wrapper. */
const SELECT = css('flex:1;font-size:16px;height:100%;color:var(--text-primary);background:transparent;border:0;outline:none;appearance:none;-webkit-appearance:none;cursor:pointer;min-width:0');

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-left:8px')}>
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
      <div style={css('font-size:13.5px;font-weight:500;color:var(--text-tertiary);white-space:nowrap;border-bottom:1px dotted var(--border-strong-3);padding-bottom:2px')}>
        {label}
      </div>
      {children}
    </div>
  );
}

const RESULT_VALUE = css('font-size:30px;font-weight:800;letter-spacing:-1px;color:var(--text-primary);white-space:nowrap;line-height:1.15');
const HELP = css('margin-top:7px;font-size:12.5px;line-height:1.5;color:var(--text-tertiary);text-wrap:pretty');
const LINK_BUTTON = css('padding:0;font-size:inherit;line-height:inherit;font-weight:700;color:var(--accent-ink);text-decoration:underline;cursor:pointer');

/** The MT4/MT5 switch, drawn like the app's other switches (Haptics, Name visibility). */
function MtToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Calculate lot size in MT4/MT5"
      onClick={onToggle}
      style={css('width:100%;min-height:58px;padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text-primary);text-align:left;cursor:pointer')}
    >
      <span style={css('display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <span style={css('font-size:14px;font-weight:700;letter-spacing:-.1px')}>Calculate lot size in MT4/MT5</span>
        <span style={css('font-size:12px;color:var(--text-tertiary);line-height:1.35')}>Optional · uses your broker's contract size and lot limits</span>
      </span>
      <span aria-hidden="true" style={{ ...css('flex:none;width:44px;height:26px;padding:3px;border-radius:999px;transition:background .18s ease'), background: on ? 'var(--accent)' : 'var(--switch-track)' }}>
        <span style={{ ...css('display:block;width:20px;height:20px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .18s ease'), transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
      </span>
    </button>
  );
}

/**
 * Opens and closes by animating its height. Closed content stays mounted, so
 * nothing typed into it is lost, but it is inert: not focusable or announced.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      inert={!open}
      style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        // Hidden only once it has finished closing, so the close still animates.
        visibility: open ? 'visible' : 'hidden',
        transition: `grid-template-rows 240ms ease, opacity 200ms ease, visibility 0s linear ${open ? '0s' : '240ms'}`,
      }}
    >
      <div style={css('overflow:hidden;min-height:0')}>{children}</div>
    </div>
  );
}

function LimitField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={css('display:flex;flex-direction:column;min-width:0')}>
      <span style={css('font-size:12.5px;font-weight:700;color:var(--text-primary);white-space:nowrap')}>{label}</span>
      <span style={css('margin-top:6px;height:48px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);display:flex;align-items:center;padding:0 8px;min-width:0')}>
        <input aria-label={label} value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" placeholder="Optional" style={INPUT} />
      </span>
    </label>
  );
}

/** One labelled figure in the MT4/MT5 breakdown. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={css('display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--border-2)')}>
      <span style={css('font-size:13px;color:var(--text-secondary);flex:none')}>{label}</span>
      <span style={css('font-size:13.5px;font-weight:600;color:var(--text-primary);text-align:right;min-width:0')}>{children}</span>
    </div>
  );
}

/** Lots as MT4/MT5 prints them: to the step's decimals, or unrounded when there is no step. */
function formatLots(lots: number, step: number | null): string {
  return step === null ? formatSize(lots, 6) : formatSize(lots, Math.max(2, stepDecimals(step)));
}

/**
 * MT4/MT5 results. The executable volume comes first, then the target risk
 * and the estimated actual risk of that volume on separate lines, so a
 * rounded size is never shown with the target as if it were its risk, then
 * the exact size it was rounded from and the broker values used.
 */
function MtResults({ result, mt }: { result: CalculatorResult; mt: MtLotResult }) {
  const unit = unitName(result.instrument);
  const currency = result.depositCurrency;
  const quote = result.instrument.quoteCurrency;
  const lotsText = mt.executableLots === null ? '—' : formatLots(mt.executableLots, mt.lotStep);
  const shortfall = mt.actualRisk === null ? null : mt.targetRisk - mt.actualRisk;

  let note: ReactNode = null;
  if (mt.limit === 'below-minimum') {
    note = (
      <span style={css('color:var(--danger-ink);font-weight:600')}>
        No permissible lot size fits your target risk.
        {mt.smallestLots !== null && mt.smallestRisk !== null && ` Your broker's smallest order, ${formatSize(mt.smallestLots, 6)} lots, would risk about ${formatMoney(mt.smallestRisk, currency)}, more than your ${formatMoney(mt.targetRisk, currency)} target.`}
      </span>
    );
  } else if (mt.limit === 'capped') {
    note = `Your target needs ${formatLots(mt.theoreticalLots, mt.lotStep)} lots, more than your broker's maximum of ${formatSize(mt.maxLot!, 6)} lots per order, so the maximum is used.`;
  } else if (mt.limit === 'not-rounded') {
    note = "Not rounded: add your broker's Lot step under Broker lot limits for a volume MT4/MT5 accepts.";
  } else if (shortfall !== null && shortfall > mt.targetRisk * 1e-9) {
    note = `Rounded down to ${lotsText} lots: ${formatMoney(shortfall, currency)} less than your target.`;
  }

  return (
    <>
      <div style={css('padding:22px 20px 0;display:flex;align-items:flex-start;gap:12px')}>
        <ResultColumn label={mt.limit === 'not-rounded' ? 'Lots (not rounded)' : 'Lots (MT4/MT5 volume)'}>
          <div style={{ ...RESULT_VALUE, ...(mt.executableLots === null ? css('color:var(--danger-ink)') : {}) }}>{lotsText}</div>
        </ResultColumn>
        <ResultColumn label="Units (trade size)">
          <div style={RESULT_VALUE}>{mt.executableUnits === null ? '—' : formatSize(mt.executableUnits, 3)}</div>
        </ResultColumn>
      </div>

      <div style={css('margin:18px 20px 0;border:1px solid var(--border-strong);border-radius:10px;overflow:hidden')}>
        <div style={css('display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 14px;background:var(--surface)')}>
          <span style={css('font-size:14px;font-weight:600;color:var(--text-secondary)')}>Target risk</span>
          <span style={css('font-size:19px;font-weight:800;letter-spacing:-.4px;color:var(--text-primary);white-space:nowrap')}>{formatMoney(mt.targetRisk, currency)}</span>
        </div>
        <div style={css('display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 14px;border-top:1px solid var(--border-2);background:var(--surface-secondary-3)')}>
          <span style={css('font-size:14px;font-weight:600;color:var(--text-secondary)')}>Estimated actual risk</span>
          <span style={css('font-size:19px;font-weight:800;letter-spacing:-.4px;color:var(--accent-ink);white-space:nowrap')}>{mt.actualRisk === null ? '—' : formatMoney(mt.actualRisk, currency)}</span>
        </div>
      </div>

      {note && <div style={css('padding:10px 20px 0;font-size:12.5px;line-height:1.5;color:var(--text-secondary);text-wrap:pretty')}>{note}</div>}

      <div style={css('padding:12px 20px 0')}>
        <DetailRow label="Theoretical size">{formatSize(result.units, result.units >= 1000 ? 2 : 6)} {unit} · {formatSize(mt.theoreticalLots, 6)} lots</DetailRow>
        <DetailRow label="Executable size">{mt.executableLots === null ? 'None within your target' : `${lotsText} lots · ${formatSize(mt.executableUnits!, 6)} ${unit}`}</DetailRow>
        <DetailRow label="Contract size">{formatSize(mt.contractSize, 6)} {unit} per lot</DetailRow>
        <DetailRow label="Lot limits">
          min {mt.minLot === null ? '—' : formatSize(mt.minLot, 6)} · step {mt.lotStep === null ? '—' : formatSize(mt.lotStep, 6)} · max {mt.maxLot === null ? '—' : formatSize(mt.maxLot, 6)}
        </DetailRow>
      </div>

      <div style={css('padding:10px 20px 0;font-size:11.5px;line-height:1.5;color:var(--text-faint);text-wrap:pretty')}>
        Assumes your broker's Forex/CFD profit calculation in {quote}: loss = price move × contract size × lots
        (Specification: Calculation “Forex” or “CFD”, Profit currency {quote}). Other calculation modes, such as
        Futures, value a lot differently.
      </div>
    </>
  );
}

/**
 * Explains how the calculated size maps onto the MT4/MT5 "Volume" box, and is
 * honest that a lot is not the same size at every broker. Opened from the
 * "How?" link under the MT4/MT5 fields and from the "?" lots value.
 */
function MtHelpModal({ instrument, onClose }: { instrument: InstrumentSpec; onClose: () => void }) {
  const known = instrument.contractSize !== null;
  return (
    <div
      onClick={onClose}
      style={css('position:absolute;inset:0;z-index:60;background:rgba(var(--shadow-rgb),.45);display:flex;align-items:center;justify-content:center;padding:24px')}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={css('width:100%;max-height:100%;overflow-y:auto;background:var(--surface);border-radius:16px;box-shadow:0 18px 44px rgba(var(--shadow-rgb),.24);padding:20px')}
      >
        <div style={css('font-size:16px;font-weight:800;letter-spacing:-.3px;color:var(--text-primary)')}>Lot size in MT4/MT5</div>

        <div style={css('margin-top:12px;font-size:13px;line-height:1.55;color:var(--text-secondary)')}>
          MT4 and MT5 ask for <strong style={css('font-weight:700')}>Volume</strong>, which is measured in
          lots. <strong style={css('font-weight:700')}>Units</strong> above is the raw size of the position;{' '}
          <strong style={css('font-weight:700')}>Lots</strong> is that same size divided by the contract
          size your broker uses.
        </div>

        <div style={css('margin-top:14px;padding:12px 14px;background:var(--surface-secondary-3);border-radius:10px')}>
          {known ? (
            <div style={css('font-size:13px;line-height:1.55;color:var(--text-secondary)')}>
              For <strong style={css('font-weight:700')}>{instrument.label}</strong> this calculator uses the
              conventional <strong style={css('font-weight:700')}>1.00 lot = {instrument.contractSize!.toLocaleString('en-US')} units</strong>.
            </div>
          ) : (
            <div style={css('font-size:13px;line-height:1.55;color:var(--text-secondary)')}>
              <strong style={css('font-weight:700')}>{instrument.label}</strong> has no standard lot — brokers
              define it differently, so Lots shows <strong style={css('font-weight:700')}>?</strong> rather
              than a number that might not match your account. Units above is still exact.
            </div>
          )}
        </div>

        <div style={css('margin-top:14px;font-size:13px;line-height:1.55;color:var(--text-secondary)')}>
          <strong style={css('font-weight:700')}>Your broker's values:</strong> in MT4 or MT5, open Market Watch,
          right-click {instrument.label} (your broker may name it slightly differently) and choose{' '}
          <strong style={css('font-weight:700')}>Specification</strong>. It lists the Contract size, Minimal volume,
          Maximal volume and Volume step. Switch on <strong style={css('font-weight:700')}>Calculate lot size in
          MT4/MT5</strong> to enter them.
        </div>

        <div style={css('margin-top:14px;font-size:12.5px;line-height:1.55;color:var(--text-muted)')}>
          Contract sizes vary between brokers, and most platforms round Volume to a step (commonly 0.01)
          with a minimum trade size. Check the contract specification for your own account and round the
          figure above to the nearest step your broker accepts — always downwards, so you stay inside your
          intended risk.
        </div>

        <Hoverable
          onClick={onClose}
          style={css('margin-top:18px;height:46px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--on-accent);cursor:pointer')}
          hoverStyle={css('background:var(--accent-hover)')}
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
  // Every money, price and rate field starts empty.
  //
  // These were seeded with 4163.91000 / 4080.63180 / 100000 / 2 — a gold entry,
  // a gold stop, a six-figure balance and a risk percentage, all invented. On a
  // trading app that is not a convenience: it is a filled-in trade plan the
  // person did not write, and pressing Calculate on it returns a position size
  // for a position nobody intended. The instrument and currency dropdowns keep
  // their defaults because those are a choice from a fixed list, not a number.
  const [openPrice, setOpenPrice] = useState('');
  const [stopLossPrice, setStopLossPrice] = useState('');
  const [accountBalance, setAccountBalance] = useState('');
  const [risk, setRisk] = useState('');
  const [riskUnit, setRiskUnit] = useState<RiskUnit>('percent');

  // MT4/MT5 mode is optional and starts off. Broker values are kept per
  // instrument, so switching instruments never carries one symbol's contract
  // size over to another; an untouched instrument starts from its default
  // (100,000 for spot Forex, empty otherwise).
  const [mtMode, setMtMode] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [brokerSpecs, setBrokerSpecs] = useState<Record<string, BrokerSpecInput>>({});

  // Results deliberately only move when Calculate is pressed.
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [mtResult, setMtResult] = useState<MtLotResult | null>(null);
  /** When the conversion rate of the current result was published, if a conversion was needed. */
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // True only while a cross-currency press is waiting on the server's (cached)
  // FX rates — a same-currency calculation never sets this, since it never
  // touches the network at all.
  const [converting, setConverting] = useState(false);

  // Chart links follow the dropdown, not the last calculation, so the labels
  // stay truthful the moment the instrument changes.
  const selected = INSTRUMENTS.find(i => i.symbol === instrumentSymbol) ?? INSTRUMENTS[0];
  const brokerSpec: BrokerSpecInput = brokerSpecs[selected.symbol]
    ?? { contractSize: defaultMtContractSize(selected), minLot: '', maxLot: '', lotStep: '' };
  const setBrokerField = (field: keyof BrokerSpecInput, value: string) =>
    setBrokerSpecs(previous => ({ ...previous, [selected.symbol]: { ...brokerSpec, [field]: value } }));

  async function calculate() {
    if (converting) return;

    // Only a cross-currency calculation needs a rate at all — same currency
    // is exact by construction and must work even if the FX fetch is broken,
    // so it never touches the network. This is also what keeps the common
    // USD/USD case instant, exactly as it was before FX support existed.
    let usdRates: Record<string, number> | null = null;
    let updatedAt: string | null = null;
    if (selected.quoteCurrency !== depositCurrency) {
      setConverting(true);
      const fx = await fetchFxRates();
      setConverting(false);
      usdRates = fx?.rates ?? null;
      updatedAt = fx?.updatedAt ?? null;
    }

    const outcome = calculatePositionSize({
      instrumentSymbol,
      depositCurrency,
      openPrice,
      stopLossPrice,
      accountBalance,
      risk,
      riskUnit,
    }, usdRates);
    if (outcome.status !== 'ok') {
      setResult(null);
      setMtResult(null);
      setError(outcome.error);
      return;
    }

    // MT4/MT5 volume is worked out from the same position, never instead of it.
    let lots: MtLotResult | null = null;
    if (mtMode) {
      const mt = calculateMtLots(outcome.result, brokerSpec);
      if (mt.status !== 'ok') {
        setResult(null);
        setMtResult(null);
        setError(mt.error);
        return;
      }
      lots = mt.mt;
    }
    setResult(outcome.result);
    setMtResult(lots);
    setRatesUpdatedAt(updatedAt);
    setError(null);
  }

  return (
    <PhoneShell scrollRef={scrollRef}>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Risk Calculator</div>
      </div>

      <div ref={scrollRef} className="nav-space" style={css('flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch')}>
        <div style={css('padding:6px 20px 0;display:flex;flex-direction:column;gap:18px')}>

          <Field label="Instrument">
            <div style={FIELD}>
              <select aria-label="Instrument" value={instrumentSymbol} onChange={e => setInstrumentSymbol(e.target.value)} style={SELECT}>
                {INSTRUMENT_GROUPS.map(group => (
                  <optgroup key={group} label={group}>
                    {INSTRUMENTS.filter(i => i.group === group).map(i => <option key={i.symbol} value={i.symbol}>{i.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <Chevron />
            </div>
          </Field>

          <Field label="Deposit currency">
            <div style={FIELD}>
              <select aria-label="Deposit currency" value={depositCurrency} onChange={e => setDepositCurrency(e.target.value as CurrencyCode)} style={SELECT}>
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
              <div style={css('flex:1;height:52px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);display:flex;align-items:center;padding:0 14px;min-width:0')}>
                <input
                  value={risk}
                  onChange={e => setRisk(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  style={INPUT}
                />
              </div>
              <div style={css('flex:1;height:52px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);display:flex;align-items:center;padding:0 14px;min-width:0')}>
                <select aria-label="Risk unit" value={riskUnit} onChange={e => setRiskUnit(e.target.value as RiskUnit)} style={SELECT}>
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

          <div style={css('flex:none')}>
            <MtToggle on={mtMode} onToggle={() => setMtMode(on => !on)} />
            <Collapse open={mtMode}>
              <div style={css('padding-top:16px;display:flex;flex-direction:column;gap:14px')}>
                <div>
                  <div style={LABEL}>Contract Size (Units per Lot)</div>
                  <div style={FIELD}>
                    <input
                      aria-label="Contract Size (Units per Lot)"
                      value={brokerSpec.contractSize}
                      onChange={e => setBrokerField('contractSize', e.target.value)}
                      inputMode="decimal"
                      placeholder="Your broker's value"
                      style={INPUT}
                    />
                    <span style={css('flex:none;margin-left:8px;font-size:13px;color:var(--text-tertiary);white-space:nowrap')}>{unitName(selected)} per lot</span>
                  </div>
                  <div style={HELP}>
                    {isForex(selected)
                      ? `Standard spot Forex lot: 100,000 ${unitName(selected)}. Change it if your broker's Specification differs.`
                      : `${selected.label} has no standard lot across brokers. Enter your broker's contract size.`}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    aria-expanded={limitsOpen}
                    onClick={() => setLimitsOpen(open => !open)}
                    style={css('min-height:40px;display:flex;align-items:center;gap:6px;padding:0;background:transparent;border:0;font-size:14px;font-weight:700;color:var(--accent-ink);cursor:pointer')}
                  >
                    Broker lot limits (optional)
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .2s ease', transform: limitsOpen ? 'rotate(180deg)' : 'none' }}>
                      <path d="M6 9.5l6 6 6-6" />
                    </svg>
                  </button>
                  <Collapse open={limitsOpen}>
                    <div style={css('padding-top:6px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
                      <LimitField label="Minimum lot" value={brokerSpec.minLot} onChange={value => setBrokerField('minLot', value)} />
                      <LimitField label="Lot step" value={brokerSpec.lotStep} onChange={value => setBrokerField('lotStep', value)} />
                      <LimitField label="Maximum lot" value={brokerSpec.maxLot} onChange={value => setBrokerField('maxLot', value)} />
                    </div>
                    <div style={HELP}>With a lot step the size is rounded down, so it never risks more than your target.</div>
                  </Collapse>
                </div>

                <div style={css('font-size:12.5px;line-height:1.5;color:var(--text-tertiary)')}>
                  Find these values in your broker's MT4/MT5 Symbol Specification.{' '}
                  <button type="button" onClick={() => setHelpOpen(true)} style={LINK_BUTTON}>How?</button>
                </div>
              </div>
            </Collapse>
          </div>

          {error && (
            <div style={css('font-size:12.5px;color:var(--danger-ink);line-height:1.45;text-wrap:pretty')}>{error}</div>
          )}
        </div>

        <div style={css('margin-top:22px;border-top:1px solid var(--border-2);padding:24px 20px 0;display:flex;justify-content:center')}>
          <Hoverable
            onClick={() => void calculate()}
            aria-disabled={converting}
            style={{
              ...css('width:230px;height:56px;border-radius:999px;background:var(--accent);box-shadow:0 10px 22px rgba(11,95,239,.28);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:var(--on-accent);cursor:pointer;letter-spacing:-.2px'),
              opacity: converting ? 0.6 : 1,
              pointerEvents: converting ? 'none' : 'auto',
            }}
            hoverStyle={css('background:var(--accent-hover)')}
          >
            {converting ? 'Getting rate…' : 'Calculate'}
          </Hoverable>
        </div>

        {/* ---- results ---- */}
        {result && mtResult ? (
          <MtResults result={result} mt={mtResult} />
        ) : (<>
        <div style={css('padding:22px 20px 0;display:flex;align-items:flex-start;gap:12px')}>
          <ResultColumn label="Lots (trade size)">
            {!result ? (
              <div style={RESULT_VALUE}>—</div>
            ) : result.lots === null ? (
              // No standard lot for this instrument: say so rather than invent one.
              <div
                onClick={() => setHelpOpen(true)}
                title={`${result.instrument.label} has no standard lot size across brokers`}
                style={css('font-size:30px;font-weight:800;color:var(--accent-ink);cursor:pointer;line-height:1.15;border-bottom:2px dotted var(--accent)')}
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

        {result && result.lots === null && (
          <div style={css('padding:12px 20px 0;text-align:center;font-size:12.5px;line-height:1.5;color:var(--text-tertiary);text-wrap:pretty')}>
            {result.instrument.label} has no standard lot size across brokers, so only units are shown.
            Switch on “Calculate lot size in MT4/MT5” to size it in your broker's lots.
          </div>
        )}

        <div style={css('padding:18px 20px 0;display:flex;flex-direction:column;align-items:center;gap:4px')}>
          <div style={css('font-size:15px;font-weight:500;color:var(--text-secondary)')}>Money at risk</div>
          <div style={css('font-size:32px;font-weight:800;letter-spacing:-1.1px;color:var(--text-primary);white-space:nowrap;line-height:1.15')}>
            {result ? formatMoney(result.riskAmount, depositCurrency) : '—'}
          </div>
        </div>
        </>)}

        <div style={css('padding:22px 20px 0;display:flex;flex-direction:column;align-items:center;gap:8px')}>
          <a
            href={liveChartUrl(selected)}
            target="_blank"
            rel="noreferrer"
            style={css('font-size:15.5px;font-weight:500;color:var(--text-primary);text-decoration:underline;cursor:pointer;text-align:center')}
          >
            View {selected.label} Live Chart
          </a>
          <a
            href={historicalChartUrl(selected)}
            target="_blank"
            rel="noreferrer"
            style={css('font-size:15.5px;font-weight:500;color:var(--text-primary);text-decoration:underline;cursor:pointer;text-align:center')}
          >
            View {selected.label} Historical Chart
          </a>
        </div>

        {result && (
          <div style={css('padding:18px 20px 0;text-align:center;font-size:11.5px;color:var(--text-faint);line-height:1.5')}>
            {result.direction === 'long' ? 'Long' : 'Short'} · over {result.pips !== null
              ? `${formatSize(result.pips, 1)} pips (${formatSize(result.stopDistance, result.instrument.pricePrecision)})`
              : `${formatSize(result.stopDistance, result.instrument.pricePrecision)} points`}
            {mtResult
              ? ` · ${formatSize(mtResult.contractSize, 6)} ${unitName(result.instrument)} per lot`
              : result.instrument.contractSize !== null && ` · ${formatSize(result.instrument.contractSize, 0)} units per lot`}
            {result.quoteToDeposit !== 1 && (
              <div>
                Converted at the day's reference rate: 1 {result.instrument.quoteCurrency} = {formatSize(result.quoteToDeposit, 6)} {result.depositCurrency}
                {ratesUpdatedAt ? `, published ${formatDateTime(ratesUpdatedAt)}.` : ' (publication time not given).'}
              </div>
            )}
            {result.quoteToDeposit !== 1 && ratesUpdatedAt && Date.now() - Date.parse(ratesUpdatedAt) > FX_RATE_STALE_AFTER_MS && (
              <div style={css('color:var(--danger-ink);font-weight:600')}>This rate is more than two days old. Check the current rate before trading.</div>
            )}
            <div>Excludes spread, commission, swap and slippage, which can make the actual loss larger.</div>
          </div>
        )}

        <div style={css('height:30px')} />
      </div>

      {helpOpen && <MtHelpModal instrument={selected} onClose={() => setHelpOpen(false)} />}
      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
