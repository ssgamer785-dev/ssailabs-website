import { useEffect, useRef, useState } from 'react';
import { PhoneShell } from './PhoneShell';
import splashArt from '../assets/traders-planet-splash.webp';

const MIN_MS = 2300;
const EXIT_MS = 460;
const BACKGROUND_MS = 3000;

/** Covers deep-link cold starts and an installed app returning from background. */
export function LifecycleSplash() {
  const [generation, setGeneration] = useState(() => window.location.pathname === '/' ? 0 : 1);
  const [leaving, setLeaving] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const resume = () => {
      if (window.location.pathname === '/') return;
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= BACKGROUND_MS) {
        startedAt.current = Date.now();
        setImageReady(false);
        setLeaving(false);
        setGeneration(n => n + 1);
      }
      hiddenAt.current = null;
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now();
      else resume();
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hiddenAt.current = Date.now() - BACKGROUND_MS;
        resume();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pageshow', pageShow);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pageshow', pageShow);
    };
  }, []);

  useEffect(() => {
    if (!generation) return;
    const elapsed = Date.now() - startedAt.current;
    const t = imageReady
      ? window.setTimeout(() => setLeaving(true), Math.max(0, MIN_MS - elapsed))
      : null;
    const failSafe = window.setTimeout(() => setLeaving(true), 8000);
    return () => { if (t !== null) window.clearTimeout(t); window.clearTimeout(failSafe); };
  }, [generation, imageReady]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setGeneration(0), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  if (!generation) return null;
  return <div key={generation} style={{ position: 'fixed', inset: 0, zIndex: 900, background: '#0C091E' }}>
    <div className="theme-light" style={{ display: 'contents' }}>
      <PhoneShell>
        <div className={`splash-shell${leaving ? ' is-leaving' : ''}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'linear-gradient(180deg,#E7EFF9 0%,#889698 55%,#2F436B 100%)' }}>
          <img src={splashArt} width={853} height={1844} alt="The Traders Planet — where traders are built"
            onLoad={() => setImageReady(true)} onError={() => setImageReady(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
          <div className="splash-stage" aria-hidden="true"><div className="splash-bar"><div className="splash-bar-fill" /></div><div className="splash-bar-glow" /></div>
          <span role="status" className="splash-status">Loading The Traders Planet</span>
        </div>
      </PhoneShell>
    </div>
  </div>;
}
