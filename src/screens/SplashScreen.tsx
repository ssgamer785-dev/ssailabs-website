import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { makeRand } from '../lib/rng';
import { useAuth } from '../lib/auth-context';
import { PhoneShell } from '../components/PhoneShell';
import mark from '../assets/traders-planet-mark.png';

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
      <div style={css('flex:1;position:relative;overflow:hidden;background:#FCFDFF;cursor:pointer')} onClick={goNext}>
        <div style={css('position:absolute;right:-190px;top:-150px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(11,95,239,.11),rgba(11,95,239,0) 68%)')} />
        <div style={css('position:absolute;left:-150px;top:170px;width:520px;height:560px;border-radius:50%;background:radial-gradient(circle,rgba(11,95,239,.07),rgba(11,95,239,0) 66%)')} />
        <div style={css('position:absolute;left:0;right:0;top:124px;display:flex;flex-direction:column;align-items:center;gap:24px')}>
          {/* The mark used to sit in a 208x150 navy tile, because the only
              asset was a JPEG with the brand's dark background baked in — a
              dark rectangle parked on a white splash, with the actual gold
              only about 92px across inside it. traders-planet-mark.png is the
              same artwork keyed off that background, so it needs no tile and
              can be nearly three times the size. The shadow follows the alpha
              rather than a box, so there is no rectangle behind it. */}
          <img
            src={mark}
            alt=""
            className="splash-logo"
            width={716}
            height={459}
            decoding="async"
            style={css('width:272px;height:auto;display:block;filter:drop-shadow(0 12px 20px rgba(15,23,42,.16))')}
          />
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
          {/* Indeterminate by design. This was a fixed 62% fill — a number
              nothing measured. The app's real launch state is whether auth has
              resolved, which has no percentage to report, so the indicator
              says "working" and claims nothing. */}
          <div
            role="progressbar"
            aria-label="Loading"
            style={css('width:148px;height:5px;border-radius:999px;background:#DCE6F8;overflow:hidden')}
          >
            <div className="splash-sweep" />
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
