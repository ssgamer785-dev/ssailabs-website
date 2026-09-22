import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

/** Gates a route behind a signed-in session; sends anonymous visitors to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Gates a route behind a session *and* a redeemed activation code.
 *
 * This is the client half of the gate and it is only half. It decides which
 * screen to render; it does not decide what data exists. A user who forces
 * this component to render its children — by editing React state, by patching
 * the bundle — arrives at a screen whose every query comes back empty, because
 * the SELECT policies on posts, comments, messages and notifications all
 * require is_activated(), and nothing the client can call sets activated_at
 * (profiles_guard_activation refuses the write).
 *
 * Admins are activated by definition, so the admin never meets this.
 */
export function RequireActivated({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading, isActivated } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  // The profile decides this, so wait for it rather than guess from its absence.
  if (profileLoading) return null;
  if (!isActivated) return <Navigate to="/activate" replace />;
  return <>{children}</>;
}

/** Admin-only routes. An activated non-admin is sent back to their own home. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading, isAdmin } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/admin-login" replace />;
  if (profileLoading) return null;
  if (!isAdmin) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

/** Keeps an already-signed-in user off /login and /signup. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading, profileLoading, isActivated } = useAuth();
  if (loading) return null;
  if (!session) return <>{children}</>;
  if (profileLoading) return null;
  // Signed in but not yet activated: the gate, not the app.
  return <Navigate to={isActivated ? '/home' : '/activate'} replace />;
}
