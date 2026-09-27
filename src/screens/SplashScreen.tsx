import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { useAuth } from '../lib/auth-context';
import { PhoneShell } from '../components/PhoneShell';
import splashArt from '../assets/traders-planet-splash.webp';
import { barAnimationDelay, bootArtShownAt, bootSplash, releaseBootSplash } from '../lib/boot-splash';

/**
 * The startup splash.
 *
 * This screen used to draw the brand in markup — a logo image, the wordmark,
 * a tagline, twenty-four generated candlesticks and a sweeping progress bar.
 * All of it is gone: the splash is now one piece of artwork that already
 * contains the logo, the wordmark, the trader, the bull, the chart, the
 * loading bar and its label, so redrawing any of that in HTML would only give
 * the design a second, slightly wrong copy of itself.
 *
 * What is left here is the frame around the picture: how it fills the screen,
 * how long it stays, and how it leaves.
 */

/**
 * The artwork's natural size. It is drawn at 195:422 — the app frame's exact
 * ratio — so at 390x844 it fits with nothing trimmed. The stage below still
 * derives the rendered box from these, which is what keeps the loading-bar
 * halo on the bar at frame ratios that differ from this one.
 */
const ART_W = 853;
const ART_H = 1844;

/**
 * How long the ARTWORK is held on screen at minimum, counted from when it was
 * first drawn (by index.html's boot splash when there is one), never from
 * when React mounted: a clock that started before the picture arrived used to
 * cut it off moments after it appeared on slow connections (TP-023). Auth
 * usually resolves well inside this, so in practice it is what decides the
 * duration. Nothing is padded beyond it: once the app is ready and this has
 * elapsed, the splash leaves.
 *
 * It sits 200ms past the 2100ms splash-fill animation in index.css on
 * purpose. The bar reaching 100% and the screen starting to leave in the same
 * frame reads as a cut; a beat of the bar standing full is what makes the
 * exit feel like a completion rather than an interruption. If auth is slower
 * than this the splash simply stays — the hold is a floor, not a schedule.
 */
const MIN_VISIBLE_MS = 2300;

/** Must stay in step with the splash-out animation in index.css. */
const EXIT_MS = 460;

export function SplashScreen() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  const [artReady, setArtReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  // Adopting index.html's splash: same picture, and the bar carries on from
  // where it is rather than starting again.
  const [adopted] = useState(() => bootSplash() !== null);
  const artShownAt = useRef<number | null>(bootArtShownAt());
  const [barDelay] = useState(() => barAnimationDelay(artShownAt.current));

  // Where to go is decided once, by the time auth has settled. Held in a ref
  // so a token refresh part-way through the exit cannot restart the timer.
  const destination = useRef<string | null>(null);
  if (!loading && destination.current === null) {
    // /welcome, not /login: the login form is no longer the first thing a
    // signed-out visitor meets. An activated user goes straight to /home; an
    // un-activated one is redirected on to /activate by RequireActivated.
    destination.current = session ? '/home' : '/welcome';
  }

  // A cached image can finish before React attaches onLoad, in which case the
  // event never fires and the splash would wait for something already done.
  useEffect(() => {
    if (imgRef.current?.complete) setArtReady(true);
  }, []);

  // The artwork is on screen: hand over from the boot splash, and start the
  // clock now if the boot splash never showed it.
  useEffect(() => {
    if (!artReady) return;
    if (artShownAt.current === null) artShownAt.current = performance.now();
    if (adopted) releaseBootSplash(imgRef.current);
  }, [artReady, adopted]);

  const ready = !loading && artReady;

  // Hold until the app is ready *and* the artwork has had its minimum, whichever is later.
  useEffect(() => {
    if (!ready || leaving) return;
    const held = performance.now() - (artShownAt.current ?? performance.now());
    const t = window.setTimeout(() => setLeaving(true), Math.max(0, MIN_VISIBLE_MS - held));
    return () => window.clearTimeout(t);
  }, [ready, leaving]);

  // A failed artwork load or an auth endpoint that never responds must not
  // leave the launch screen up forever on a poor connection.
  useEffect(() => {
    const t = window.setTimeout(() => setLeaving(true), 8000);
    return () => window.clearTimeout(t);
  }, []);

  // Navigate only once the fade has actually played, so the app appears behind
  // a splash that is already gone rather than replacing one mid-frame.
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(
      () => navigate(destination.current ?? '/login', { replace: true }),
      EXIT_MS,
    );
    return () => window.clearTimeout(t);
  }, [leaving, navigate]);

  // Tapping through still plays the same exit rather than cutting.
  const skip = useCallback(() => {
    if (!loading) setLeaving(true);
  }, [loading]);

  return (
    <div className="theme-light" style={{ display: 'contents' }}>
      <PhoneShell>
        <div
          className={`splash-shell${leaving ? ' is-leaving' : ''}${adopted ? ' adopted' : ''}${!artReady && !adopted ? ' art-pending' : ''}`}
          onClick={skip}
          // The brand colour, not a gradient with a bar on it: until the
          // picture can be drawn there is nothing else to show (TP-058).
          style={css('position:absolute;inset:0;overflow:hidden;cursor:pointer;background:#0C091E')}
        >
          <img
            ref={imgRef}
            src={splashArt}
            alt="The Traders Planet — where traders are built"
            width={ART_W}
            height={ART_H}
            fetchPriority="high"
            decoding="async"
            onLoad={() => setArtReady(true)}
            onError={() => setArtReady(true)}
            // cover, not contain: contain would letterbox, and the artwork is
            // 9:16 while the frame is taller, so something has to give. Cover
            // keeps the aspect ratio exactly and trims the sides instead.
            style={css('position:absolute;inset:0;width:100%;height:100%;' +
                       'object-fit:cover;object-position:center;display:block')}
          />

          {/* The loading bar the artwork paints, driven: a colour-exact replica
              laid over it so it can actually fill. The artwork bakes the bar
              in at ~65%, so extending from there would only ever animate the
              last third — covering the whole track with its own colours is
              what lets it run 0-100%. Geometry and timing: .splash-bar in
              index.css. */}
          <div className="splash-stage" aria-hidden="true">
            <div className="splash-bar">
              <div className="splash-bar-fill" style={{ animationDelay: barDelay }} />
            </div>
            <div className="splash-bar-glow" style={{ animationDelay: barDelay }} />
          </div>

          {/* The picture carries the word "LOADING" as pixels, which a screen
              reader cannot see; this is the same status in text. */}
          <span role="status" aria-live="polite" className="splash-status">
            {leaving ? 'Ready' : 'Loading The Traders Planet'}
          </span>
        </div>
      </PhoneShell>
    </div>
  );
}
