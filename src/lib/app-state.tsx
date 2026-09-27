import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { supabase } from './supabase';

/**
 * Small cross-screen UI state.
 *
 * This module used to also export seven invented notifications, with invented
 * people in them, plus the read-tracking state that went with them.
 * Notifications have come from Supabase since Phase 2D, so that data was dead:
 * nothing outside this file read it. It is gone, along with the helpers that
 * only ever tracked those fake rows. The live implementation in
 * lib/notifications/useNotifications.ts is untouched.
 *
 * `userName` used to be the literal string of a person who does not exist,
 * shown to every real user on Home, Profile, Create Post and Community. It now
 * comes from the signed-in profile.
 */

interface AppState {
  /** The signed-in user's real name. Empty until the profile has loaded. */
  userName: string;
  /**
   * "Post with my real name": the default for NEW posts and comments. Saved on
   * the profile (profiles.reveal_identity), so it belongs to the account: it
   * survives a reload and never carries over to whoever signs in next on the
   * same device. Each existing post keeps its own setting.
   */
  reveal: boolean;
  /** Saves the preference; resolves with an error message if it could not be saved. */
  setRevealPreference: (value: boolean) => Promise<string | null>;
  toggleReveal: () => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { profile, user, refreshProfile } = useAuth();
  // An unsaved change shows immediately, but only for the account that made it.
  const [pending, setPending] = useState<{ userId: string; value: boolean } | null>(null);

  const userName = profile?.full_name?.trim() ?? '';
  const saved = profile?.reveal_identity ?? false;
  const reveal = pending && user && pending.userId === user.id ? pending.value : saved;

  const setRevealPreference = useCallback(async (value: boolean): Promise<string | null> => {
    if (!user) return 'You are signed out. Please log in again.';
    setPending({ userId: user.id, value });
    const { error } = await supabase.from('profiles').update({ reveal_identity: value }).eq('id', user.id);
    if (error) {
      console.error('[profile] name visibility update failed:', error);
      setPending(null);
      return 'Could not save this setting. Please try again.';
    }
    await refreshProfile();
    setPending(null);
    return null;
  }, [user, refreshProfile]);

  const value = useMemo<AppState>(() => ({
    userName,
    reveal,
    setRevealPreference,
    toggleReveal: () => { void setRevealPreference(!reveal); },
  }), [userName, reveal, setRevealPreference]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

/** "Rahul Sharma" -> "RS". Empty in, empty out, so a loading avatar stays blank. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
