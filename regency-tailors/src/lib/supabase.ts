import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client for the Regency Tailor showroom suite.
 *
 * Only the publishable anon key is ever used here. The service-role key must
 * never appear in this file, in .env files that ship, or in the bundle — it
 * bypasses Row Level Security entirely. Every access decision is made by the
 * database via public.is_authorized_admin().
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const PLACEHOLDERS = [
  '',
  'https://your-supabase-project.supabase.co',
  'your-supabase-anon-key',
  'https://placeholder.supabase.co',
  'placeholder-anon-key'
];

/** True when real credentials are present (not the .env.example placeholders). */
export const isSupabaseConfigured =
  !PLACEHOLDERS.includes(supabaseUrl) &&
  !PLACEHOLDERS.includes(supabaseAnonKey) &&
  supabaseUrl.startsWith('https://');

/**
 * Persistence mode.
 *
 * Supabase is the authoritative database. The browser-storage path is a
 * development and migration aid only: it is used when VITE_PERSISTENCE is
 * explicitly set to 'local', never as a silent fallback for a misconfigured
 * production build — falling back would mean an unauthenticated local copy of
 * client data.
 */
export const persistenceMode: 'supabase' | 'local' =
  (import.meta.env.VITE_PERSISTENCE || '').trim() === 'local' ? 'local' : 'supabase';

export const usesSupabase = persistenceMode === 'supabase';

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // PKCE is the correct flow for a browser app with no backend secret.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'regency-tailors-auth'
    }
  });
}

/**
 * The Supabase client, or null when the app has not been configured with
 * credentials. Callers must handle null rather than assuming a client exists.
 */
export const supabase = client;

/** Throws a clear error instead of a null dereference deep inside a query. */
export function requireSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload.'
    );
  }
  return client;
}
