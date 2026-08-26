import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, usesSupabase } from './supabase';

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

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (signInError) setError(signInError.message);
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
