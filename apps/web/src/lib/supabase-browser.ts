/**
 * Supabase Browser Client
 *
 * Client-side Supabase client for browser operations like OAuth callbacks.
 * Uses PKCE flow with native localStorage as the storage backend.
 *
 * CRITICAL: persistSession MUST be true.
 * When persistSession is false, the Supabase SDK's GoTrueClient constructor
 * (lines 182-184 in GoTrueClient.js) IGNORES the custom `storage` option
 * entirely and forces an in-memory adapter. That means the PKCE code_verifier
 * is stored in RAM and lost when the browser navigates to the OAuth provider.
 *
 * With persistSession: true the SDK uses the provided storage (or defaults
 * to localStorage). The PKCE code_verifier survives the login→Google→callback
 * navigation cycle because it lives in localStorage.
 *
 * autoRefreshToken: false — we manage token refresh ourselves via
 * storeSessionTokens / token-exchange utilities.
 *
 * detectSessionInUrl: true — on the /auth/callback page the SDK's
 * _initialize() detects the ?code= param, reads the code_verifier from
 * localStorage, exchanges for a session, and fires SIGNED_IN. The
 * OAuthCallback component reads the resulting session via getSession().
 *
 * After the OAuthCallback extracts the session, it cleans up the Supabase
 * localStorage keys so the SDK doesn't auto-recover stale sessions later.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Derive the Supabase storage key from the project URL.
 * Format: sb-<project-ref>-auth-token
 */
function getSupabaseStorageKey(): string {
  try {
    const url = new URL(SUPABASE_URL);
    const ref = url.hostname.split('.')[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return 'sb-unknown-auth-token';
  }
}

/**
 * Remove Supabase session data from localStorage.
 * Called after the OAuth callback extracts the session so the SDK doesn't
 * auto-recover a stale session on subsequent page loads.
 */
export function clearSupabaseLocalStorage(): void {
  if (typeof window === 'undefined') return;
  const key = getSupabaseStorageKey();
  window.localStorage.removeItem(key);
  window.localStorage.removeItem(`${key}-code-verifier`);
  window.localStorage.removeItem(`${key}-user`);
}

/**
 * Create a Supabase client for browser-side operations.
 */
export function createBrowserClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: true,
      // No custom storage — SDK defaults to window.localStorage,
      // which is shared across all GoTrueClient instances and survives
      // page navigations (required for PKCE code_verifier).
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
