import { css } from '../lib/css';

export function StatusBar() {
  return (
    <div style={css("height:50px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 26px 0 30px;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif")}>
      <div style={css('font-size:15px;font-weight:600;letter-spacing:-0.2px;color:#0F172A')}>9:41</div>
      <div style={css('display:flex;align-items:center;gap:6px')}>
        <div style={css('display:flex;align-items:flex-end;gap:1.6px;height:11px')}>
          <div style={css('width:3px;height:4px;border-radius:1px;background:#0F172A')} />
          <div style={css('width:3px;height:6px;border-radius:1px;background:#0F172A')} />
          <div style={css('width:3px;height:8.5px;border-radius:1px;background:#0F172A')} />
          <div style={css('width:3px;height:11px;border-radius:1px;background:#0F172A')} />
        </div>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" style={css('display:block')}>
          <path d="M1 4.1C4.9.8 11.1.8 15 4.1" stroke="#0F172A" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M3.7 6.9C6 4.9 10 4.9 12.3 6.9" stroke="#0F172A" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M6.3 9.6c1.1-.9 2.3-.9 3.4 0" stroke="#0F172A" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <div style={css('display:flex;align-items:center;gap:1.5px')}>
          <div style={css('width:24px;height:12px;border-radius:3.5px;background:#0F172A')} />
          <div style={css('width:1.6px;height:4px;border-radius:0 1px 1px 0;background:#0F172A;opacity:.45')} />
        </div>
      </div>
    </div>
  );
}
