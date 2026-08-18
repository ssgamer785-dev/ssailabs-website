import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { makeRand } from '../lib/rng';
import { useAuth } from '../lib/auth-context';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';
import logo from '../assets/traders-planet-logo.jpg';

function SplashCandles() {
  const rand = makeRand(991);
  const n = 24;
  const els: ReactNode[] = [];
  let p = 12;
  const slot = 100 / n, w = slot * 0.44;
  for (let i = 0; i < n; i++) {
    const open = p;
    let close = open + 2.7 + (rand() - 0.44) * 13;
    close = Math.max(4, Math.min(92, close));
    const hi = Math.max(open, close) + rand() * 8;
    const lo = Math.min(open, close) - rand() * 8;
    p = close;
    const left = i * slot + (slot - w) / 2;
    els.push(<div key={'w' + i} style={{ position: 'absolute', left: `${left + w / 2 - 0.14}%`, width: '1.6px', bottom: `${Math.max(0, lo)}%`, height: `${hi - Math.max(0, lo)}%`, background: 'rgba(11,95,239,.13)', borderRadius: '2px' }} />);
    els.push(<div key={'b' + i} style={{ position: 'absolute', left: `${left}%`, width: `${w}%`, bottom: `${Math.min(open, close)}%`, height: `${Math.max(2, Math.abs(close - open))}%`, background: 'rgba(11,95,239,.17)', borderRadius: '2.5px' }} />);
  }
  return <div style={css('position:absolute;left:6%;right:6%;bottom:96px;height:262px')}>{els}</div>;
}

export function SplashScreen() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => navigate(session ? '/home' : '/login', { replace: true }), 2200);
    return () => clearTimeout(t);
  }, [navigate, session, loading]);

  function goNext() {
    if (loading) return;
    navigate(session ? '/home' : '/login', { replace: true });
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:1;position:relative;overflow:hidden;background:#FCFDFF;cursor:pointer')} onClick={goNext}>
        <div style={css('position:absolute;right:-190px;top:-150px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(11,95,239,.11),rgba(11,95,239,0) 68%)')} />
        <div style={css('position:absolute;left:-150px;top:170px;width:520px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(11,95,239,.07),rgba(11,95,239,0) 66%)')} />
        <div style={css('position:absolute;left:0;right:0;top:142px;display:flex;flex-direction:column;align-items:center;gap:26px')}>
          <div style={css('width:208px;height:150px;border-radius:26px;background:#0E1630;box-shadow:0 18px 42px rgba(14,22,48,.30);display:flex;align-items:center;justify-content:center;overflow:hidden')}>
            <img src={logo} alt="THE TRADERS PLANET" style={css('width:188px;height:132px;object-fit:contain')} />
          </div>
          <div style={css('display:flex;flex-direction:column;align-items:center;gap:10px')}>
            <div style={css('font-size:21px;font-weight:800;letter-spacing:-.4px;white-space:nowrap')}>
              <span style={css('color:#0B5FEF')}>THE </span><span style={css('color:#0F172A')}>TRADERS PLANET</span>
            </div>
            <div style={css('font-size:12.5px;font-weight:500;color:#8794A8;letter-spacing:.1px;white-space:nowrap')}>
              <span style={css('color:#0B5FEF;font-weight:600')}>Learn</span> • Analyze • Trade • Grow
            </div>
          </div>
        </div>
        <SplashCandles />
        <div style={css('position:absolute;left:0;right:0;bottom:48px;display:flex;justify-content:center')}>
          <div style={css('width:148px;height:5px;border-radius:999px;background:#DCE6F8;overflow:hidden')}>
            <div style={css('width:62%;height:100%;border-radius:999px;background:#0B5FEF')} />
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
