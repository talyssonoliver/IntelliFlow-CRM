/**
 * Supabase Browser Client
 *
 * Client-side Supabase client for browser operations like OAuth callbacks.
 * This client handles session persistence in the browser.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Debug: Log env vars (remove in production)
if (typeof window !== 'undefined') {
  console.log('[Supabase Browser] URL:', SUPABASE_URL ? 'set' : 'MISSING');
  console.log(
    '[Supabase Browser] Key:',
    SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.substring(0, 20) + '...' : 'MISSING'
  );
}

/**
 * Create a Supabase client for browser-side operations
 *
 * NOTE: detectSessionInUrl is set to FALSE because we manually handle
 * the OAuth callback tokens in /auth/callback page. Setting it to true
 * causes Supabase to automatically process tokens and trigger redirects
 * that conflict with our manual token handling.
 */
export function createBrowserClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce', // PG-024: Use PKCE authorization code exchange (not implicit grant)
      autoRefreshToken: true,
      persistSession: false, // We manage session via localStorage
      detectSessionInUrl: false, // We handle this manually in /auth/callback
    },
  });
}

// Singleton instance for the browser
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Get the singleton browser client instance
 */
export function getSupabaseBrowserClient() {
  if (!browserClient && typeof window !== 'undefined') {
    browserClient = createBrowserClient();
  }
  return browserClient;
}
