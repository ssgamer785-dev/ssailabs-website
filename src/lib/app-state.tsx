import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';

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
  /** "Post with my real name" — session-scoped, as it has always been. */
  reveal: boolean;
  toggleReveal: () => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [reveal, setReveal] = useState(false);

  const userName = profile?.full_name?.trim() ?? '';

  const value = useMemo<AppState>(() => ({
    userName,
    reveal,
    toggleReveal: () => setReveal(v => !v),
  }), [userName, reveal]);

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
