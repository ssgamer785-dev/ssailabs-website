import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, usesSupabase } from './supabase';
import { desktop, readAuthCallback } from './desktop';

/**
 * Authentication state for the showroom suite.
 *
 * Two distinct conditions the UI must tell apart:
 *   - signed out         → no session at all
 *   - signed in, but not authorised → a valid Google session whose address is
 *     not in staff_profiles. The database returns no business data for it, and
 *     the UI says so plainly rather than showing an empty dashboard.
 *
 * The password is never held here or anywhere else: Google handles the
 * credential and Supabase returns a session token.
 */

export type AuthStatus = 'loading' | 'signed-out' | 'unauthorized' | 'authorized' | 'unconfigured';

export interface StaffProfile {
  email: string;
  full_name: string | null;
  is_active: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: StaffProfile | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    !usesSupabase ? 'authorized' : isSupabaseConfigured ? 'loading' : 'unconfigured'
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Desktop only: how long to wait for the browser to hand the callback back. */
  const desktopSignInTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Ask the database whether this account is on the allowlist. The answer is
  // authoritative: RLS enforces the same predicate on every table, so a
  // tampered client cannot turn a "no" into a "yes".
  const resolveAuthorization = useCallback(async (activeSession: Session | null) => {
    if (!activeSession || !supabase) {
      setProfile(null);
      setStatus('signed-out');
      return;
    }

    const { data, error: profileError } = await supabase
      .from('staff_profiles')
      .select('email, full_name, is_active')
      .limit(1)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setProfile(null);
      setStatus('unauthorized');
      return;
    }

    if (data && data.is_active) {
      setProfile(data as StaffProfile);
      setStatus('authorized');
    } else {
      setProfile(null);
      setStatus('unauthorized');
    }
  }, []);

  useEffect(() => {
    if (!usesSupabase || !isSupabaseConfigured || !supabase) return;

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void resolveAuthorization(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      setError(null);
      void resolveAuthorization(nextSession);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [resolveAuthorization, attempt]);

  /**
   * Google sign-in, in the browser and on the desktop.
   *
   * The web path is exactly what it was: Supabase redirects this tab to
   * Google and back to the same origin. Nothing about it changed.
   *
   * The desktop window has no tab to redirect, and Google refuses to sign
   * anyone in inside an embedded browser — an application that renders the
   * Google password page can read it. So the desktop build asks Supabase for
   * the same authorize URL without following it, opens it in the counter
   * hand's own browser, and lets Windows hand the callback back. The code that
   * comes back is exchanged for a session below. Same provider, same project,
   * same PKCE flow, same session store; only the window the password is typed
   * into is different, and it is the right one.
   */
  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setError(null);

    if (desktop) {
      const redirectTo = await desktop.authCallbackUrl();
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { prompt: 'select_account' },
          // Nothing here navigates: the URL is handed to the system browser.
          skipBrowserRedirect: true
        }
      });
      if (signInError) { setError(signInError.message); return; }
      if (!data?.url) { setError('Could not start Google sign-in.'); return; }
      const opened = await desktop.openSignIn(data.url);
      if (!opened) { setError('Could not open your browser to sign in with Google.'); return; }

      /*
       * If the callback never comes back, say why.
       *
       * Supabase only checks `redirect_to` against its allow-list after Google
       * has answered. An address that is not on the list is not refused — it
       * is quietly replaced with the project's Site URL, so the browser lands
       * on the website, signs in there, and this window waits for a reply that
       * will never arrive. Rather than sit blank, it names the one setting
       * that causes it.
       */
      clearTimeout(desktopSignInTimer.current);
      desktopSignInTimer.current = setTimeout(() => {
        setError(
          `Sign-in has not come back from your browser. If it signed you in on the website ` +
          `instead, this computer's callback address is not yet allowed: add ` +
          `${redirectTo} to Supabase → Authentication → URL Configuration → Redirect URLs, ` +
          `then try again.`
        );
      }, 90_000);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (signInError) setError(signInError.message);
  }, []);

  /**
   * The other half of the desktop flow: the callback Windows hands back.
   *
   * `detectSessionInUrl` does this automatically on the web because the
   * callback lands in the page's own address bar. Here it arrives as an
   * operating-system message, so the code is exchanged explicitly. A callback
   * that arrives while the window is still loading is held by the shell and
   * collected on mount, so a fast browser cannot beat the app to it.
   */
  useEffect(() => {
    if (!desktop || !supabase) return;
    let cancelled = false;

    const exchange = async (url: string) => {
      clearTimeout(desktopSignInTimer.current);
      const { code, error: callbackError } = readAuthCallback(url);
      if (cancelled) return;
      if (!code) { setError(callbackError || 'Sign-in did not complete.'); return; }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (exchangeError) setError(exchangeError.message);
    };

    const unsubscribe = desktop.onAuthCallback(url => { void exchange(url); });
    // A shell that cannot answer is not a reason to break the sign-in screen:
    // the live callback above is the normal path, this only collects one that
    // arrived while the window was still loading.
    void desktop.takePendingAuthCallback()
      .then(url => { if (url) void exchange(url); })
      .catch(() => { /* nothing was waiting */ });

    return () => { cancelled = true; unsubscribe(); clearTimeout(desktopSignInTimer.current); };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    setSession(null);
    setProfile(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile,
      error,
      signInWithGoogle,
      signOut,
      retry: () => setAttempt(n => n + 1)
    }),
    [status, session, profile, error, signInWithGoogle, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
