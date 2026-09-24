import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Database } from './database.types';
import { unsubscribePush } from './notifications/push';

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
  /**
   * true while a signed-in user's profile row is still in flight.
   *
   * The activation guard needs this. `loading` only covers the session, and
   * between the session arriving and the profile arriving `activated_at` is
   * unknown — treating that as "not activated" would bounce every activated
   * user through the gate for a frame on each reload.
   */
  profileLoading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Profile['role'] | null;
  isAdmin: boolean;
  /**
   * Whether this account has redeemed an activation code (admins are exempt).
   *
   * This is a routing convenience, NOT the authorization boundary. The boundary
   * is in the database: profiles_guard_activation refuses any client write to
   * activated_at, and the SELECT policies on posts, comments, messages and
   * notifications all require is_activated(). Flipping this boolean in React
   * devtools moves the user to a screen whose queries return nothing.
   */
  isActivated: boolean;
  /** Re-reads the profile — used after redeeming a code, to pick up activated_at. */
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<SignResult>;
  /**
   * Starts Google OAuth. Resolves only if the redirect could NOT be started —
   * on success the browser has already left the page, so there is no success
   * branch to write here.
   */
  signInWithGoogle: () => Promise<SignResult>;
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function errorMessage(e: unknown): string {
  const error = e as { status?: number; code?: string; message?: string } | null;
  if (error?.status === 429) return 'Too many attempts. Please wait and try again.';
  if ((error?.status && error.status >= 500) || error?.code === 'fetch_error'
    || /failed to fetch|network request failed/i.test(error?.message ?? '')) {
    return 'The sign-in service is temporarily unavailable. Please try again.';
  }
  if (error?.code === 'invalid_credentials') return 'Incorrect email or password.';
  return error?.message || 'Something went wrong. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  /**
   * A cold load resolves the session twice — once from getSession(), once from
   * the INITIAL_SESSION event — and both branches want the profile. Without a
   * guard that is two identical requests on every launch. Only concurrent
   * requests for the same user are collapsed, so a later reload (a role change,
   * a renamed profile) still goes to the server as it always did.
   */
  const inFlightProfile = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  /** Mirrors `session` for callbacks that must not re-create on every change. */
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const loadProfile = useCallback(async (userId: string) => {
    const pending = inFlightProfile.current;
    if (pending?.userId === userId) return pending.promise;

    setProfileLoading(true);
    const request = (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      setProfile(error ? null : data);
    })().finally(() => {
      setProfileLoading(false);
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
      else { setProfile(null); setProfileLoading(false); }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string): Promise<SignResult> => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? errorMessage(error) : null };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, []);

  /**
   * Google sign-in, through the same Supabase Auth the email path uses.
   *
   * No second auth system and no gate to bypass: OAuth produces an ordinary
   * Supabase session, handle_new_user() creates the profile exactly as it does
   * for an email signup, and that profile arrives with activated_at NULL. A
   * Google user therefore meets the activation gate on the same terms as
   * everyone else — there is no code here that could exempt them.
   *
   * redirectTo is /login on purpose. RedirectIfAuthed already sits on that
   * route and already sends an authenticated visitor to /home or /activate
   * depending on activation, so the return leg reuses the app's own routing
   * rather than introducing a second opinion about where OAuth users land.
   *
   * Nothing secret is involved. signInWithOAuth sends the user to Supabase,
   * which holds the Google client ID and secret; the browser never sees either.
   */
  const signInWithGoogle = useCallback(async (): Promise<SignResult> => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/login` },
      });
      return { error: error ? errorMessage(error) : null };
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
      return { error: error ? errorMessage(error) : null, needsEmailConfirmation: !error && !data.session };
    } catch (e) {
      return { error: errorMessage(e), needsEmailConfirmation: false };
    }
  }, []);

  const signOut = useCallback(async () => {
    await unsubscribePush().catch(() => {});
    await supabase.auth.signOut();
  }, []);

  // Bypasses the in-flight collapse on purpose: it is called straight after a
  // redemption, when the cached answer is the stale one we are trying to
  // replace.
  const refreshProfile = useCallback(async () => {
    const userId = sessionRef.current?.user?.id;
    if (!userId) return;
    inFlightProfile.current = null;
    await loadProfile(userId);
  }, [loadProfile]);

  const role = profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        loading,
        profileLoading,
        session,
        user: session?.user ?? null,
        profile,
        role,
        isAdmin: role === 'admin',
        isActivated: role === 'admin' || profile?.activated_at != null,
        refreshProfile,
        signIn,
        signInWithGoogle,
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
