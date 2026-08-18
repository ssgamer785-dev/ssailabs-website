import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { makeRand } from '../lib/rng';
import { StatusBar } from '../components/StatusBar';
import { CandleChart } from '../components/CandleChart';
import { PhoneShell } from '../components/PhoneShell';

function Wave({ bars, color, height, gap, seed }: { bars: number; color: string; height: number; gap: number; seed: number }) {
  const rand = makeRand(seed);
  const els: ReactNode[] = [];
  for (let i = 0; i < bars; i++) {
    const h = Math.max(3, Math.round((0.28 + rand() * 0.72) * height));
    els.push(<div key={i} style={{ width: 2, height: h, borderRadius: 2, background: color, flex: 'none' }} />);
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap, height, flex: 1, overflow: 'hidden' }}>{els}</div>;
}

function VoiceBubble({ out, dur, time, seed }: { out: boolean; dur: string; time: string; seed: number }) {
  return (
    <div style={{ maxWidth: 250, background: out ? '#DCE9FF' : '#F4F6FA', borderRadius: out ? '16px 16px 5px 16px' : '16px 16px 16px 5px', padding: '10px 13px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={css('display:flex;align-items:center;gap:10px')}>
        <div style={css('width:30px;height:30px;border-radius:50%;background:#0B5FEF;display:flex;align-items:center;justify-content:center;flex:none;cursor:pointer')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:1px')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
        </div>
        <Wave bars={26} color={out ? 'rgba(11,95,239,.45)' : 'rgba(100,116,139,.45)'} height={20} gap={2.4} seed={seed} />
        <div style={css('font-size:10.5px;font-weight:600;color:#64748B;flex:none;white-space:nowrap')}>{dur}</div>
      </div>
      <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:5px')}>
        <div style={css('font-size:10px;color:#94A3B8;white-space:nowrap')}>{time}</div>
        {out && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12.6l3.6 3.6L12.4 9" /><path d="M9.6 12.6l3.6 3.6L19.5 9" /></svg>}
      </div>
    </div>
  );
}

function clock(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
}

export function AdminChatScreen() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState('');
  const [rec, setRec] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => clearInterval(timerRef.current), []);

  function toggleRec() {
    clearInterval(timerRef.current);
    if (rec) { setRec(false); setRecSec(0); return; }
    timerRef.current = setInterval(() => setRecSec(v => v + 1), 1000);
    setRec(true); setRecSec(0);
  }

  function MicBtn({ size = 40 }: { size?: number }) {
    return (
      <div onClick={toggleRec} title="Hold to record a voice message" style={{ width: size, height: size, borderRadius: '50%', flex: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: rec ? '#EF4444' : '#F2F4F9', boxShadow: rec ? '0 0 0 4px rgba(239,68,68,.16)' : 'none' }}>
        <svg width={Math.round(size * 0.44)} height={Math.round(size * 0.44)} viewBox="0 0 24 24" fill="none" stroke={rec ? '#FFFFFF' : '#64748B'} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x={9} y={3.2} width={6} height={10.4} rx={3} />
          <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3M8.8 20.8h6.4" />
        </svg>
      </div>
    );
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:58px;display:flex;align-items:center;padding:0 18px;gap:11px;border-bottom:1px solid #F1F4F9')}>
        <svg onClick={() => navigate(-1)} width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('position:relative;flex:none')}>
          <div style={css('width:38px;height:38px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700')}>A</div>
          <div style={css('position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;border-radius:50%;background:#22C55E;border:2.2px solid #fff')} />
        </div>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:1px;min-width:0')}>
          <div style={css('font-size:15px;font-weight:700;letter-spacing:-.25px')}>Admin</div>
          <div style={css('font-size:11.5px;font-weight:600;color:#22C55E')}>Online</div>
        </div>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M4.5 5.2c0-1 .8-1.8 1.8-1.8h1.9c.8 0 1.5.5 1.7 1.3l.7 2.5c.2.7-.1 1.5-.7 1.9l-1.2.8a11 11 0 0 0 4.4 4.4l.8-1.2c.4-.6 1.2-.9 1.9-.7l2.5.7c.8.2 1.3.9 1.3 1.7v1.9c0 1-.8 1.8-1.8 1.8C10.6 20.3 4.5 14.2 4.5 5.2z" /></svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round" style={css('cursor:pointer;flex:none;margin-left:4px')}><rect x="2.6" y="6.8" width="12.4" height="10.4" rx="2.6" /><path d="M15 11 20.8 8v8l-5.8-3z" /></svg>
      </div>
      <div style={css('flex:1;min-height:0;padding:16px 18px 0;display:flex;flex-direction:column;gap:14px;overflow-y:auto;background:#FDFDFE')}>
        <div style={css('display:flex;justify-content:flex-end')}>
          <div style={css('max-width:250px;background:#DCE9FF;border-radius:16px 16px 5px 16px;padding:11px 13px 8px;display:flex;flex-direction:column;gap:5px')}>
            <div style={css('font-size:13.5px;line-height:1.45;color:#12203C')}>Sir, can you explain today's gold setup?</div>
            <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:5px')}>
              <div style={css('font-size:10px;color:#64748B;white-space:nowrap')}>10:28 AM</div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12.6l3.6 3.6L12.4 9" /><path d="M9.6 12.6l3.6 3.6L19.5 9" /></svg>
            </div>
          </div>
        </div>
        <div style={css('display:flex;align-items:flex-end;gap:9px')}>
          <div style={css('width:30px;height:30px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none')}>A</div>
          <div style={css('background:#F4F6FA;border-radius:16px 16px 16px 5px;padding:11px 13px;display:flex;align-items:flex-end;gap:10px')}>
            <div style={css('font-size:13.5px;line-height:1.45;white-space:nowrap')}>Sure, check this PDF.</div>
            <div style={css('font-size:10px;color:#94A3B8;white-space:nowrap')}>10:30 AM</div>
          </div>
        </div>
        <div style={css('margin-left:39px;background:#FFFFFF;border:1px solid #EDF0F6;border-radius:14px;box-shadow:0 2px 10px rgba(15,23,42,.05);padding:12px 13px;display:flex;align-items:center;gap:11px')}>
          <div style={css('width:36px;height:40px;border-radius:8px;background:#FEF1F1;display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
          </div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
            <div style={css('font-size:13px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Gold_Analysis.pdf</div>
            <div style={css('font-size:11px;color:#94A3B8')}>2.4 MB</div>
          </div>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M12 4v11M7.6 11l4.4 4.4L16.4 11M5 19.6h14" /></svg>
        </div>
        <div style={css('margin-left:39px;position:relative;width:236px;height:150px;border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(15,23,42,.12)')}>
          <CandleChart seed={33} stamp="10:31 AM" />
        </div>
        <div style={css('display:flex;justify-content:flex-end')}><VoiceBubble out dur="0:14" time="10:33 AM" seed={17} /></div>
        <div style={css('display:flex;align-items:flex-end;gap:9px')}>
          <div style={css('width:30px;height:30px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none')}>A</div>
          <VoiceBubble out={false} dur="0:38" time="10:35 AM" seed={45} />
        </div>
        <div style={css('flex:1')} />
      </div>
      {!rec ? (
        <div style={css('flex:none;padding:12px 18px 24px;display:flex;align-items:center;gap:9px;background:#FFFFFF')}>
          <div style={css('width:38px;height:38px;border-radius:50%;background:#F2F4F9;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={2.1} strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </div>
          <div style={css('flex:1;height:44px;border-radius:999px;background:#F2F4F9;display:flex;align-items:center;padding:0 16px')}>
            <input placeholder="Type a message..." value={msg} onChange={e => setMsg(e.target.value)} style={css('flex:1;font-size:14px;height:100%')} />
          </div>
          <MicBtn />
          <Hoverable style={css('width:44px;height:44px;border-radius:50%;background:#0B5FEF;box-shadow:0 6px 16px rgba(11,95,239,.32);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#0A52D6')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      ) : (
        <div style={css('flex:none;padding:12px 18px 24px;display:flex;align-items:center;gap:9px;background:#FFFFFF')}>
          <Hoverable onClick={toggleRec} style={css('width:38px;height:38px;border-radius:50%;background:#FEF1F1;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#FDE1E3')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M5.6 7.4h12.8M9.4 7.4V5.2h5.2v2.2M7.2 7.4l.9 12h7.8l.9-12" /></svg>
          </Hoverable>
          <div style={css('flex:1;height:44px;border-radius:999px;background:#FEF4F4;border:1px solid #FBD5D9;display:flex;align-items:center;padding:0 14px;gap:10px;min-width:0')}>
            <div style={css('width:8px;height:8px;border-radius:50%;background:#EF4444;flex:none')} />
            <div style={css('font-size:12.5px;font-weight:700;color:#EF4444;flex:none;white-space:nowrap')}>{clock(recSec)}</div>
            <Wave bars={34} color="rgba(239,68,68,.55)" height={22} gap={2.6} seed={91} />
            <div style={css('font-size:11px;color:#94A3B8;flex:none;white-space:nowrap')}>Recording</div>
          </div>
          <MicBtn />
          <Hoverable style={css('width:44px;height:44px;border-radius:50%;background:#0B5FEF;box-shadow:0 6px 16px rgba(11,95,239,.32);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#0A52D6')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      )}
    </PhoneShell>
  );
}
