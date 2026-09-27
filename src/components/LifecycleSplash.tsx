import { useEffect, useRef, useState } from 'react';
import { PhoneShell } from './PhoneShell';
import splashArt from '../assets/traders-planet-splash.webp';
import { barAnimationDelay, bootArtShownAt, bootSplash, releaseBootSplash } from '../lib/boot-splash';

const MIN_MS = 2300;
const EXIT_MS = 460;
const BACKGROUND_MS = 3000;

/** Covers deep-link cold starts and an installed app returning from background. */
export function LifecycleSplash() {
  const [generation, setGeneration] = useState(() => window.location.pathname === '/' ? 0 : 1);
  const [leaving, setLeaving] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // A deep-link cold start adopts index.html's splash (same picture, bar
  // continues); a return from the background starts its own.
  const [adopted, setAdopted] = useState(() => generation === 1 && bootSplash() !== null);
  /** When the artwork was first drawn; the minimum counts from then (TP-023). */
  const shownAt = useRef<number | null>(adopted ? bootArtShownAt() : null);
  const [barDelay, setBarDelay] = useState(() => barAnimationDelay(shownAt.current));

  useEffect(() => {
    const resume = () => {
      if (window.location.pathname === '/') return;
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= BACKGROUND_MS) {
        shownAt.current = null;
        setAdopted(false);
        setBarDelay('0ms');
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

  // A cached picture can finish before React attaches onLoad.
  useEffect(() => {
    if (generation && imgRef.current?.complete) setImageReady(true);
  }, [generation]);

  useEffect(() => {
    if (!imageReady) return;
    if (shownAt.current === null) shownAt.current = performance.now();
    if (adopted) releaseBootSplash(imgRef.current);
  }, [imageReady, adopted]);

  useEffect(() => {
    if (!generation) return;
    const elapsed = shownAt.current === null ? 0 : performance.now() - shownAt.current;
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
        <div className={`splash-shell${leaving ? ' is-leaving' : ''}${adopted ? ' adopted' : ''}${!imageReady && !adopted ? ' art-pending' : ''}`} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0C091E' }}>
          <img ref={imgRef} src={splashArt} width={853} height={1844} alt="The Traders Planet — where traders are built"
            onLoad={() => setImageReady(true)} onError={() => setImageReady(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
          <div className="splash-stage" aria-hidden="true"><div className="splash-bar"><div className="splash-bar-fill" style={{ animationDelay: barDelay }} /></div><div className="splash-bar-glow" style={{ animationDelay: barDelay }} /></div>
          <span role="status" className="splash-status">Loading The Traders Planet</span>
        </div>
      </PhoneShell>
    </div>
  </div>;
}
