import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { makeRand } from '../lib/rng';
import { StatusBar } from '../components/StatusBar';
import { CandleChart } from '../components/CandleChart';
import { PhoneShell } from '../components/PhoneShell';
import logo from '../assets/traders-planet-logo.jpg';

function Wave({ bars, color, height, gap, seed }: { bars: number; color: string; height: number; gap: number; seed: number }) {
  const rand = makeRand(seed);
  const els: ReactNode[] = [];
  for (let i = 0; i < bars; i++) {
    const h = Math.max(3, Math.round((0.28 + rand() * 0.72) * height));
    els.push(<div key={i} style={{ width: 2, height: h, borderRadius: 2, background: color, flex: 'none' }} />);
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap, height, flex: 1, overflow: 'hidden' }}>{els}</div>;
}

function clock(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
}

function Comment({ initial, bg, fg, name, body, time }: { initial: string; bg: string; fg: string; name: string; body: string; time: string }) {
  return (
    <div style={css('margin-top:8px;background:#F7F8FB;border-radius:12px;padding:11px 12px;display:flex;align-items:flex-start;gap:10px')}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initial}</div>
      <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
        <div style={css('font-size:12.5px;font-weight:700')}>{name}</div>
        <div style={css('font-size:12.5px;color:#64748B')}>{body}</div>
      </div>
      <div style={css('font-size:10.5px;color:#94A3B8;flex:none;white-space:nowrap')}>{time}</div>
    </div>
  );
}

export function AnalysisDetailScreen() {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(true);
  const [likes, setLikes] = useState(245);
  const [bm, setBm] = useState(false);
  const [comment, setComment] = useState('');
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

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:56px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <div onClick={() => navigate(-1)} style={css('width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.10);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        </div>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px;padding-right:34px')}>Gold Analysis</div>
      </div>
      <div style={css('flex:1;min-height:0;padding:4px 20px 0;display:flex;flex-direction:column;overflow-y:auto')}>
        <div style={css('display:flex;align-items:center;gap:10px')}>
          <div style={css('width:34px;height:34px;border-radius:50%;background:#0F1733;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none')}>
            <img src={logo} alt="The Traders Planet" style={css('width:30px;height:30px;object-fit:contain')} />
          </div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:1px;min-width:0')}>
            <div style={css('display:flex;align-items:center;gap:5px')}>
              <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>The Traders Planet</div>
              <svg width="14" height="14" viewBox="0 0 24 24" style={css('display:block;flex:none')}><circle cx="12" cy="12" r="9.5" fill="#0B5FEF" /><path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="#FFFFFF" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={css('font-size:11.5px;color:#94A3B8')}>Admin</div>
          </div>
          <div style={css('font-size:11.5px;color:#94A3B8;flex:none;white-space:nowrap')}>2h ago</div>
        </div>
        <div style={css('margin-top:14px;font-size:16px;font-weight:700;letter-spacing:-.35px')}>Gold Analysis</div>
        <div style={css('margin-top:6px;font-size:13.5px;line-height:1.5;color:#334155')}>Buy Above 3365</div>
        <div style={css('font-size:13.5px;line-height:1.5;color:#334155')}>SL 3358 | TP 3380</div>
        <div style={css('margin-top:12px;position:relative;height:152px;border-radius:12px;overflow:hidden;flex:none')}>
          <CandleChart seed={4} />
        </div>
        <div style={css('margin-top:13px;display:flex;gap:10px')}>
          <Hoverable style={css('height:36px;padding:0 14px;border:1px solid #E7EBF1;border-radius:10px;display:flex;align-items:center;gap:7px;cursor:pointer;background:#fff')} hoverStyle={css('border-color:#0B5FEF')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
            <div style={css('font-size:12.5px;font-weight:600')}>PDF</div>
          </Hoverable>
          <Hoverable style={css('height:36px;padding:0 14px;border:1px solid #E7EBF1;border-radius:10px;display:flex;align-items:center;gap:7px;cursor:pointer;background:#fff')} hoverStyle={css('border-color:#0B5FEF')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round"><rect x="3.2" y="6.6" width="12" height="10.8" rx="2.6" /><path d="M15.2 11.2 20.4 8.2v7.6l-5.2-3z" /></svg>
            <div style={css('font-size:12.5px;font-weight:600')}>Video</div>
          </Hoverable>
        </div>
        <div style={css('margin-top:14px;display:flex;align-items:center;gap:18px')}>
          <div onClick={() => { setLiked(v => !v); setLikes(v => liked ? v - 1 : v + 1); }} style={css('display:flex;align-items:center;gap:7px;cursor:pointer')}>
            <svg width="20" height="20" viewBox="0 0 24 24" style={css('display:block')}><path d="M12 20.8S3.9 15.4 3.9 9.9A4.55 4.55 0 0 1 12 7.1a4.55 4.55 0 0 1 8.1 2.8c0 5.5-8.1 10.9-8.1 10.9z" fill={liked ? '#EF4444' : 'none'} stroke={liked ? '#EF4444' : '#64748B'} strokeWidth={1.7} strokeLinejoin="round" /></svg>
            <div style={css('font-size:13px;font-weight:600;color:#334155')}>{likes}</div>
          </div>
          <div style={css('display:flex;align-items:center;gap:7px;cursor:pointer')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z" /></svg>
            <div style={css('font-size:13px;font-weight:600;color:#334155')}>54</div>
          </div>
          <div style={css('flex:1')} />
          <div onClick={() => setBm(v => !v)} style={css('cursor:pointer')}>
            <svg width="19" height="19" viewBox="0 0 24 24" style={css('display:block')}><path d="M7 4.4h10v16l-5-3.5-5 3.5z" fill={bm ? '#0B5FEF' : 'none'} stroke={bm ? '#0B5FEF' : '#64748B'} strokeWidth={1.7} strokeLinejoin="round" /></svg>
          </div>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinecap="round" style={css('cursor:pointer')}><circle cx="18" cy="5.6" r="2.4" /><circle cx="6.4" cy="12" r="2.4" /><circle cx="18" cy="18.4" r="2.4" /><path d="M8.6 10.8 15.8 6.9M8.6 13.2l7.2 3.9" /></svg>
        </div>
        <div style={css('margin-top:16px;font-size:13.5px;font-weight:700;letter-spacing:-.2px')}>Comments</div>
        <Comment initial="R" bg="#DCE7F7" fg="#29527F" name="Rahul" body="Thanks for the analysis!" time="2h ago" />
        <Comment initial="A" bg="#E7E3F7" fg="#55488C" name="Aman" body="Very clear explanation sir." time="1h ago" />
        <div style={css('flex:1')} />
      </div>
      {!rec ? (
        <div style={css('flex:none;padding:12px 18px 26px;display:flex;align-items:center;gap:9px')}>
          <div style={css('width:36px;height:36px;border-radius:50%;background:#F2F4F9;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={2.1} strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </div>
          <div style={css('flex:1;height:42px;border-radius:999px;background:#F2F4F9;display:flex;align-items:center;padding:0 16px')}>
            <input placeholder="Write a comment or send a voice note..." value={comment} onChange={e => setComment(e.target.value)} style={css('flex:1;font-size:13.5px;height:100%')} />
          </div>
          <div onClick={toggleRec} title="Hold to record a voice message" style={css('width:36px;height:36px;border-radius:50%;flex:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:#F2F4F9')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x={9} y={3.2} width={6} height={10.4} rx={3} /><path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3M8.8 20.8h6.4" /></svg>
          </div>
          <Hoverable style={css('width:40px;height:40px;border-radius:50%;background:#DCE9FF;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#C6DBFF')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="#0B5FEF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      ) : (
        <div style={css('flex:none;padding:12px 18px 26px;display:flex;align-items:center;gap:9px')}>
          <Hoverable onClick={toggleRec} style={css('width:36px;height:36px;border-radius:50%;background:#FEF1F1;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#FDE1E3')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M5.6 7.4h12.8M9.4 7.4V5.2h5.2v2.2M7.2 7.4l.9 12h7.8l.9-12" /></svg>
          </Hoverable>
          <div style={css('flex:1;height:42px;border-radius:999px;background:#FEF4F4;border:1px solid #FBD5D9;display:flex;align-items:center;padding:0 14px;gap:10px;min-width:0')}>
            <div style={css('width:8px;height:8px;border-radius:50%;background:#EF4444;flex:none')} />
            <div style={css('font-size:12.5px;font-weight:700;color:#EF4444;flex:none;white-space:nowrap')}>{clock(recSec)}</div>
            <Wave bars={30} color="rgba(239,68,68,.55)" height={20} gap={2.4} seed={57} />
          </div>
          <div onClick={toggleRec} title="Hold to record a voice message" style={css('width:36px;height:36px;border-radius:50%;flex:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:#EF4444;box-shadow:0 0 0 4px rgba(239,68,68,.16)')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x={9} y={3.2} width={6} height={10.4} rx={3} /><path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3M8.8 20.8h6.4" /></svg>
          </div>
          <Hoverable style={css('width:40px;height:40px;border-radius:50%;background:#DCE9FF;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#C6DBFF')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="#0B5FEF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      )}
    </PhoneShell>
  );
}
