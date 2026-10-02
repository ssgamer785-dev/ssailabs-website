import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { AuthLoading, ProfileUnavailable } from './AuthLoading';
import { pendingDestination, rememberDestination } from '../lib/notifications/destination';

function LoginRedirect({ admin = false }: { admin?: boolean }) {
  const location = useLocation();
  rememberDestination(location.pathname + location.search);
  return <Navigate to={admin ? '/admin-login' : '/login'} replace />;
}

/** Gates a route behind a signed-in session; sends anonymous visitors to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (!session) return <LoginRedirect />;
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
  const { session, loading, profile, profileError, isActivated } = useAuth();
  if (loading) return <AuthLoading />;
  if (!session) return <LoginRedirect />;
  // The profile decides this, so never guess from its absence: an unknown
  // profile is not an un-activated one. A profile saved on this device makes
  // this instant; only a first launch here waits, and a failed read offers a
  // retry instead of the activation screen.
  if (!profile) return profileError ? <ProfileUnavailable /> : <AuthLoading />;
  if (!isActivated) return <LoginRedirectToActivation />;
  return <>{children}</>;
}

/** Admin-only routes. An activated non-admin is sent back to their own home. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading, profile, profileError, isAdmin } = useAuth();
  if (loading) return <AuthLoading />;
  if (!session) return <LoginRedirect admin />;
  if (!profile) return profileError ? <ProfileUnavailable /> : <AuthLoading />;
  if (!isAdmin) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

/** Keeps an already-signed-in user off /login and /signup. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading, profile, profileError, isActivated } = useAuth();
  if (loading) return <AuthLoading />;
  if (!session) return <>{children}</>;
  if (!profile) return profileError ? <ProfileUnavailable /> : <AuthLoading />;
  // Signed in but not yet activated: the gate, not the app.
  return <Navigate to={isActivated ? (pendingDestination() ?? '/home') : '/activate'} replace />;
}

function LoginRedirectToActivation() {
  const location = useLocation();
  rememberDestination(location.pathname + location.search);
  return <Navigate to="/activate" replace />;
}
