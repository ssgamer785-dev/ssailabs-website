import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Database } from './database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface SignResult {
  error: string | null;
}

interface SignUpResult extends SignResult {
  /** true when the project requires email confirmation, so no session was created yet. */
  needsEmailConfirmation: boolean;
}

interface AuthState {
  /** true until the initial session check (getSession) has resolved. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Profile['role'] | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<SignResult>;
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  /**
   * A cold load resolves the session twice — once from getSession(), once from
   * the INITIAL_SESSION event — and both branches want the profile. Without a
   * guard that is two identical requests on every launch. Only concurrent
   * requests for the same user are collapsed, so a later reload (a role change,
   * a renamed profile) still goes to the server as it always did.
   */
  const inFlightProfile = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const pending = inFlightProfile.current;
    if (pending?.userId === userId) return pending.promise;

    const request = (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      setProfile(error ? null : data);
    })().finally(() => {
      if (inFlightProfile.current?.userId === userId) inFlightProfile.current = null;
    });

    inFlightProfile.current = { userId, promise: request };
    return request;
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) void loadProfile(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      if (newSession?.user) void loadProfile(newSession.user.id);
      else setProfile(null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignResult> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string): Promise<SignUpResult> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      return { error: error?.message ?? null, needsEmailConfirmation: !error && !data.session };
    } catch (e) {
      return { error: errorMessage(e), needsEmailConfirmation: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const role = profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        profile,
        role,
        isAdmin: role === 'admin',
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
