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

/** Keeps an already-signed-in user off /login and /signup, sending them straight to /home. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
