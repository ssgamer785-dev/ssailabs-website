import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { rememberSession } from './remember-session';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
      '(see .env.example) before importing src/lib/supabase.ts.',
  );
}

/**
 * Browser client, authorized with the public anon key only — every table it can
 * touch is governed by the RLS policies in supabase/migrations/. Never import the
 * service_role key into client code.
 */
const memory = new Map<string, string>();
export { rememberSession, setRememberSession } from './remember-session';

const authStorage = {
  getItem(key: string): string | null {
    try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); }
    catch { return memory.get(key) ?? null; }
  },
  setItem(key: string, value: string): void {
    try {
      if (rememberSession()) { localStorage.setItem(key, value); sessionStorage.removeItem(key); }
      else { sessionStorage.setItem(key, value); localStorage.removeItem(key); }
    } catch { memory.set(key, value); }
  },
  removeItem(key: string): void {
    memory.delete(key);
    try { sessionStorage.removeItem(key); localStorage.removeItem(key); } catch { /* private mode */ }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: { storage: authStorage },
});
