import { useRef, useState } from 'react';
import { css } from '../lib/css';
import { StatusBar } from '../components/StatusBar';
import { BottomNav } from '../components/BottomNav';
import { PhoneShell } from '../components/PhoneShell';

const CATS = ['Top Stories', 'Global', 'Stocks', 'Forex', 'Crypto'];

const NEWS = [
  { cat: 'GLOBAL', bg: '#EDF3FE', fg: '#0B5FEF', source: 'Reuters', time: '2h ago', title: 'US Markets rally as inflation cools down', body: 'Dow and S&P 500 close higher after CPI comes in below estimates.' },
  { cat: 'GLOBAL', bg: '#EDF3FE', fg: '#0B5FEF', source: 'Bloomberg', time: '3h ago', title: 'Federal Reserve hints at rate cuts this year', body: 'Policy minutes point to two possible cuts if disinflation holds.' },
  { cat: 'COMMODITIES', bg: '#FFF6E6', fg: '#B98F3C', source: 'CNBC', time: '4h ago', title: 'Gold prices surge above $2,300', body: 'Safe-haven demand lifts bullion to a fresh record intraday high.' },
  { cat: 'CRYPTO', bg: '#F1F0FD', fg: '#6B5DD3', source: 'CoinDesk', time: '5h ago', title: 'Bitcoin breaks $65K as ETF inflows rise', body: 'Spot ETF net inflows top $1.1B for the week.' },
  { cat: 'COMMODITIES', bg: '#FFF6E6', fg: '#B98F3C', source: 'MarketWatch', time: '6h ago', title: 'Crude Oil prices jump on supply fears', body: 'Brent gains 3% as producers signal deeper cuts.' },
  { cat: 'FOREX', bg: '#E9F8EF', fg: '#16A34A', source: 'FXStreet', time: '7h ago', title: 'Dollar steadies ahead of jobs data', body: 'DXY holds 104.2 before Friday payrolls.' },
];

export function MarketNewsScreen() {
  const [cat, setCat] = useState('Top Stories');
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <PhoneShell scrollRef={scrollRef}>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Market News</div>
      <div style={css('flex:none;padding:4px 20px 0;display:flex;gap:9px;overflow:hidden')}>
        {CATS.map(c => {
          const on = cat === c;
          return (
            <div key={c} onClick={() => setCat(c)} style={{ height: 34, padding: '0 14px', borderRadius: 999, display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap', cursor: 'pointer', background: on ? '#0B5FEF' : '#F2F4F9', color: on ? '#FFFFFF' : '#475569', boxShadow: on ? '0 4px 12px rgba(11,95,239,.26)' : 'none', flex: 'none' }}>
              {c}
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} style={css('flex:1;min-height:0;padding:14px 20px 0;display:flex;flex-direction:column;overflow-y:auto')}>
        {NEWS.map((n, i) => (
          <div key={i}>
            <div style={css('display:flex;flex-direction:column;gap:5px;padding:11px 0;cursor:pointer;flex:none')}>
              <div style={css('display:flex;align-items:center;gap:7px')}>
                <div style={{ height: 18, padding: '0 7px', borderRadius: 5, background: n.bg, color: n.fg, display: 'flex', alignItems: 'center', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', whiteSpace: 'nowrap', flex: 'none' }}>{n.cat}</div>
                <div style={css('font-size:11px;font-weight:600;color:#94A3B8;white-space:nowrap;flex:none')}>{n.source}</div>
                <div style={css('flex:1')} />
                <div style={css('font-size:11px;color:#94A3B8;white-space:nowrap;flex:none')}>{n.time}</div>
              </div>
              <div style={css("font-size:14px;font-weight:700;line-height:1.3;letter-spacing:-.3px;text-wrap:pretty")}>{n.title}</div>
              <div style={css("font-size:12px;color:#64748B;line-height:1.4;text-wrap:pretty")}>{n.body}</div>
            </div>
            {i < NEWS.length - 1 && <div style={css('height:1px;background:#F1F4F9;flex:none')} />}
          </div>
        ))}
        <div style={css('height:14px;flex:none')} />
      </div>
      <BottomNav active="news" />
    </PhoneShell>
  );
}
