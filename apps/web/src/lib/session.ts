/**
 * Server-side Supabase client for the web app.
 *
 * Used to check a caller's token (see `lib/route-access.ts`). Who may do what is
 * decided by the API from database roles; nothing here reads a role. The old
 * cookie-session helpers, which took the role from user-editable metadata and
 * were never wired to a cookie, are gone.
 *
 * @module apps/web/src/lib/session
 */

import { createClient } from '@supabase/supabase-js';
import { requiredProdEnv } from './required-url';

// Lazy memoized accessor — calling requiredProdEnv at module-init scope would
// crash the entire process on boot if the env var is absent (defect D4).
let _supabaseUrl: string | undefined;
function getSupabaseUrl(): string {
  if (_supabaseUrl === undefined) {
    _supabaseUrl = requiredProdEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      'http://127.0.0.1:54321'
    );
  }
  return _supabaseUrl;
}

const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Create a Supabase client for server-side token checks. It never keeps a
 * session, so one request's sign-in can't leak into another.
 */
export function createServerClient() {
  return createClient(getSupabaseUrl(), SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
