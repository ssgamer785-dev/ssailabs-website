import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { rememberSession, supabase } from './supabase';
import { clearCachedProfile, readCachedProfile, writeCachedProfile } from './profile-cache';
import type { Database } from './database.types';
import { unsubscribePush } from './notifications/push';
import { profileActionFor, stableUser } from './auth-events';
import { markPasswordRecovery } from './password-policy';

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
  /**
   * true when the profile could not be read and none is held — offline at the
   * first launch on this device, or the server unreachable. Guards show a
   * retry state instead of guessing: an unknown profile is never treated as
   * "not activated", which used to send activated members to the code screen.
   */
  profileError: boolean;
  /** Tries the profile read again now (also retried automatically). */
  retryProfile: () => void;
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
  const [profileError, setProfileError] = useState(false);

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

  /** Mirrors `profile` so the auth listener can compare without re-subscribing. */
  const profileRef = useRef<Profile | null>(null);
  profileRef.current = profile;

  /** The signed-in user, kept as the same object across token refreshes. */
  const userRef = useRef<User | null>(null);
  userRef.current = stableUser(userRef.current, session?.user ?? null);

  /**
   * `silent` re-reads a profile we already hold: guards keep rendering the
   * current screen, and a failed re-read keeps the profile we had rather than
   * signing the screen out from under the person.
   */
  const loadProfile = useCallback(async (userId: string, silent = false) => {
    const pending = inFlightProfile.current;
    if (pending?.userId === userId) return pending.promise;

    // A retry keeps the "can't reach" state on show until it succeeds, rather
    // than flashing a loader on every attempt.
    if (!silent) setProfileLoading(true);
    const request = (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!error && data) {
        setProfile(data);
        setProfileError(false);
        writeCachedProfile(data, rememberSession());
      } else if (!silent || profileRef.current?.id !== userId) {
        console.warn('[auth] profile read failed:', error?.message ?? 'no row');
        setProfile(null);
        setProfileError(true);
      }
    })().finally(() => {
      if (!silent) setProfileLoading(false);
      if (inFlightProfile.current?.userId === userId) inFlightProfile.current = null;
    });

    inFlightProfile.current = { userId, promise: request };
    return request;
  }, []);

  /**
   * A launch with a profile saved on this device shows the app at once and
   * re-reads the profile quietly; only a first launch here waits for it.
   */
  const startProfile = useCallback((userId: string) => {
    const cached = readCachedProfile<Profile>(userId);
    if (cached) {
      profileRef.current = cached;
      setProfile(cached);
      setProfileError(false);
      void loadProfile(userId, true);
    } else {
      setProfileError(false);
      void loadProfile(userId);
    }
  }, [loadProfile]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) startProfile(data.session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') markPasswordRecovery();
      setSession(newSession);
      const action = profileActionFor(event, newSession?.user?.id, profileRef.current?.id);
      if (action === 'clear') { setProfile(null); setProfileLoading(false); setProfileError(false); clearCachedProfile(); }
      else if (action === 'load') startProfile(newSession!.user.id);
      else if (action === 'refresh-silently') void loadProfile(newSession!.user.id, true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, startProfile]);

  const retryProfile = useCallback(() => {
    const userId = sessionRef.current?.user?.id;
    if (!userId) return;
    inFlightProfile.current = null;
    void loadProfile(userId);
  }, [loadProfile]);

  // A failed read retries by itself: when the connection comes back, when the
  // app is brought to the front, and on a slow back-off meanwhile.
  const retryAttempt = useRef(0);
  useEffect(() => {
    if (!profileError) {
      if (profile) retryAttempt.current = 0;
      return;
    }
    let timer = 0;
    const schedule = () => {
      const delay = Math.min(30_000, 3_000 * 2 ** retryAttempt.current);
      timer = window.setTimeout(() => { retryAttempt.current++; retryProfile(); }, delay);
    };
    const now = () => { if (document.visibilityState !== 'hidden') retryProfile(); };
    schedule();
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', now);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', now);
      document.removeEventListener('visibilitychange', now);
    };
  }, [profileError, profile, retryProfile]);

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
    clearCachedProfile();
    // The default is global and revokes this account's sessions on every device.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  // Bypasses the in-flight collapse on purpose: it is called straight after a
  // redemption, when the cached answer is the stale one we are trying to
  // replace.
  const refreshProfile = useCallback(async () => {
    const userId = sessionRef.current?.user?.id;
    if (!userId) return;
    inFlightProfile.current = null;
    await loadProfile(userId, profileRef.current?.id === userId);
  }, [loadProfile]);

  // A profile left over from another account (a switch within one tab) is
  // never presented as the current one.
  const currentProfile = profile && profile.id === session?.user?.id ? profile : null;
  const role = currentProfile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        loading,
        profileLoading,
        profileError,
        retryProfile,
        session,
        user: userRef.current,
        profile: currentProfile,
        role,
        isAdmin: role === 'admin',
        isActivated: role === 'admin' || currentProfile?.activated_at != null,
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
