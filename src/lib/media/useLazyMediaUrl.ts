import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Resolves a private storage key to a signed URL, but only once the element
 * holding it is near the viewport.
 *
 * Opening a long thread or a full feed would otherwise sign — and the browser
 * would then fetch — every attachment in it at once. Gating on visibility means
 * a conversation costs one round trip per bubble the reader actually reaches.
 *
 * Attach `ref` to the element that will display the media. `armed: false` keeps
 * the hook idle no matter what the observer sees, which is how a video defers
 * its own bytes until someone taps play.
 */
export function useLazyMediaUrl(
  storageKey: string | null | undefined,
  resolve: (key: string, force?: boolean) => Promise<string>,
  options?: { armed?: boolean; localUrl?: string | null; rootMargin?: string },
): {
  ref: (node: Element | null) => void;
  url: string | null;
  failed: boolean;
  loading: boolean;
  retry: () => void;
  forceRetry: () => void;
  error: string | null;
} {
  const armed = options?.armed ?? true;
  const localUrl = options?.localUrl ?? null;
  const rootMargin = options?.rootMargin ?? '300px';

  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(localUrl);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const lastRetry = useRef(0);
  const loadFailures = useRef(0);

  const resolveAgain = useCallback((force: boolean) => {
    if (!storageKey || (!force && Date.now() - lastRetry.current < 30000)) return;
    lastRetry.current = Date.now();
    setLoading(true);
    void resolveRef.current(storageKey, true)
      .then(next => { setUrl(next); setFailed(false); setError(null); })
      .catch(e => { setFailed(true); setError(e instanceof Error ? e.message : 'Could not load attachment.'); })
      .finally(() => setLoading(false));
  }, [storageKey]);
  const retry = useCallback(() => {
    loadFailures.current += 1;
    if (loadFailures.current > 1) {
      setFailed(true);
      setError('This attachment could not be opened. Please try again.');
      return;
    }
    resolveAgain(true);
  }, [resolveAgain]);
  const forceRetry = useCallback(() => {
    loadFailures.current = 0;
    setUrl(null);
    setFailed(false);
    setError(null);
    resolveAgain(true);
  }, [resolveAgain]);

  // A callback ref rather than useRef + useEffect: the node arrives on mount
  // and can be swapped out, and this observes it either way.
  const ref = useCallback((node: Element | null) => {
    observerRef.current?.disconnect();
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setVisible(true);
        // One-shot: once it has been seen there is nothing left to watch for.
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(node);
    observerRef.current = observer;
  }, [rootMargin]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  useEffect(() => { setUrl(localUrl); setFailed(false); setError(null); lastRetry.current = 0; loadFailures.current = 0; }, [storageKey]);

  // A local object URL (an attachment still uploading) always wins: it is the
  // real bytes, already in memory, and needs no round trip.
  useEffect(() => {
    if (localUrl) setUrl(localUrl);
  }, [localUrl]);

  useEffect(() => {
    if (localUrl || !storageKey || !armed || !visible) return;

    let active = true;
    setLoading(true);
    resolveRef.current(storageKey)
      .then(resolved => {
        if (!active) return;
        setUrl(resolved);
        setFailed(false);
        setError(null);
      })
      .catch(e => { if (active) { setFailed(true); setError(e instanceof Error ? e.message : 'Could not load attachment.'); } })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [storageKey, armed, visible, localUrl]);

  useEffect(() => {
    if (!visible || !armed || !storageKey || localUrl) return;
    const timer = window.setInterval(() => resolveAgain(false), 12 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [visible, armed, storageKey, localUrl, resolveAgain]);

  return { ref, url, failed, loading, retry, forceRetry, error };
}
