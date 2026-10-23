/**
 * The one piece of OAuth state the browser keeps (PG-207): which provider a
 * sign-in was started with, keyed by its `state`, so the shared callback page
 * knows what it returns from. No secret is stored here; the PKCE verifier and
 * the state hash live server-side.
 */
export function oauthProviderKey(state: string): string {
  return `email-oauth-provider:${state}`;
}
