import { useCallback, useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { displaySource, forgetMedia, markShown, peekMedia, rememberMediaSize, urgentLoadStarted, type MediaScope } from './media-cache';
import { noteMediaShown, noteSource } from './media-metrics';

export interface MediaImage {
  /** Attach to the element the picture fills: it is prepared as it nears the screen. */
  ref: (node: Element | null) => void;
  src: string | null;
  /** Already fetched and decoded when this rendered: drawn in the first frame, no placeholder, no fade. */
  instant: boolean;
  loaded: boolean;
  failed: boolean;
  error: string | null;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
  retry: () => void;
}

interface State {
  key: string | null;
  src: string | null;
  /** Where src came from when this picture was first rendered. */
  from: 'local' | 'prepared' | null;
  instant: boolean;
  loaded: boolean;
  failed: boolean;
  error: string | null;
}

function start(scope: MediaScope, key: string | null, localUrl: string | null): State {
  if (localUrl) return { key, src: localUrl, from: 'local', instant: false, loaded: false, failed: false, error: null };
  // Only a prepared picture is drawn straight away. Anything else — even with its address already known — goes
  // through displaySource, so it joins a download already under way and waits behind the screen's top picture.
  const peek = key ? peekMedia(scope, key) : null;
  const ready = peek?.ready ? peek : null;
  return { key, src: ready?.src ?? null, from: ready ? 'prepared' : null, instant: !!ready, loaded: !!ready, failed: false, error: null };
}

function onScreen(node: Element | null): boolean {
  if (!node || typeof window === 'undefined') return false;
  const r = node.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/**
 * One community or chat picture, as fast as this device can show it: drawn in
 * the first frame when it was prepared ahead (no placeholder at all), otherwise
 * loaded as it nears the screen — one signing request for everything appearing
 * together (none when the address is already known), one download however many
 * places show it (a download already under way is joined), the screen's top
 * picture first. A failed load is retried once with a fresh address before saying so.
 */
export function useMediaImage(scope: MediaScope, storageKey: string | null | undefined, options?: {
  localUrl?: string | null; rootMargin?: string;
  /** The top picture of a screen: loaded first, the screen's other pictures wait for it. */
  priority?: 'high';
  /** The picture's size from its row, when known: its download then tells how fast the link is. */
  bytes?: number | null;
}): MediaImage {
  const key = storageKey ?? null;
  const localUrl = options?.localUrl ?? null;
  const rootMargin = options?.rootMargin ?? '300px 0px';
  const bytes = options?.bytes ?? null;
  const [state, setState] = useState<State>(() => start(scope, key, localUrl));
  // A different picture in the same place (a list reusing the component), or an upload's own preview arriving:
  // start over in this render, not one frame later. (A preview going away keeps what is on screen.)
  let current = state;
  if (state.key !== key || (localUrl !== null && state.src !== localUrl)) {
    current = start(scope, key, localUrl);
    setState(current);
  }
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const node = useRef<Element | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const failures = useRef(0);
  const urgentEnd = useRef<(() => void) | null>(null);
  const sourceNoted = useRef<string | null>(null);
  const shownNoted = useRef<string | null>(null);

  const ref = useCallback((element: Element | null) => {
    observer.current?.disconnect();
    node.current = element;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const watch = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); watch.disconnect(); }
    }, { rootMargin });
    watch.observe(element);
    observer.current = watch;
  }, [rootMargin]);
  useEffect(() => () => { observer.current?.disconnect(); urgentEnd.current?.(); }, []);

  useEffect(() => { failures.current = 0; }, [key]);

  // A prepared picture, known at the first render: counted, and shown in this very frame.
  useLayoutEffect(() => {
    if (!key || sourceNoted.current === key || current.from !== 'prepared') return;
    sourceNoted.current = key;
    noteSource('memory');
    if (current.instant && onScreen(node.current)) { shownNoted.current = key; noteMediaShown(); }
  }, [key, current.from, current.instant]);

  const needsSource = !current.src && !current.failed && !!key && !localUrl;
  useEffect(() => {
    if (!needsSource || !visible || !key) return;
    let active = true;
    sourceNoted.current = key;
    const urgent = options?.priority === 'high';
    if (urgent && !urgentEnd.current) urgentEnd.current = urgentLoadStarted();
    displaySource(scope, key, { fresh: attempt > 0, urgent, bytes })
      .then(({ src }) => { if (active) setState(s => (s.key === key ? { ...s, src, failed: false, error: null } : s)); })
      .catch(e => {
        urgentEnd.current?.(); urgentEnd.current = null;
        if (active) setState(s => (s.key === key ? { ...s, failed: true, error: e instanceof Error ? e.message : 'Could not load attachment.' } : s));
      });
    return () => { active = false; };
  }, [scope, key, visible, needsSource, attempt, options?.priority, bytes]);

  const onLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    urgentEnd.current?.(); urgentEnd.current = null;
    setState(s => (s.loaded ? s : { ...s, loaded: true }));
    if (!key || localUrl) return;
    if (img.naturalWidth > 0) rememberMediaSize(key, img.naturalWidth, img.naturalHeight);
    markShown(scope, key, img.currentSrc || img.src);
    if (shownNoted.current !== key) { shownNoted.current = key; if (onScreen(img)) noteMediaShown(); }
  }, [scope, key, localUrl]);

  const onError = useCallback(() => {
    if (!key || localUrl) return;
    failures.current += 1;
    if (failures.current > 1) { urgentEnd.current?.(); urgentEnd.current = null; }
    forgetMedia(scope, key);
    if (failures.current > 1) {
      setState(s => ({ ...s, failed: true, error: 'This attachment could not be opened. Please try again.' }));
      return;
    }
    // An expired address or a damaged kept copy: once more, from the network, with a fresh signature.
    setState(s => ({ ...s, src: null, from: null, instant: false, loaded: false }));
    setVisible(true);
    setAttempt(n => n + 1);
  }, [scope, key, localUrl]);

  const retry = useCallback(() => {
    failures.current = 0;
    if (key) forgetMedia(scope, key);
    setState(s => ({ ...s, src: null, from: null, instant: false, loaded: false, failed: false, error: null }));
    setVisible(true);
    setAttempt(n => n + 1);
  }, [scope, key]);

  return { ref, src: current.src, instant: current.instant, loaded: current.loaded, failed: current.failed, error: current.error, onLoad, onError, retry };
}
