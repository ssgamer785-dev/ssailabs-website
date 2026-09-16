import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

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
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
