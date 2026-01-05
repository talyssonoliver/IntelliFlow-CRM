/**
 * Auth Constants - Single Source of Truth
 *
 * Canonical enum values for authentication-related features.
 * All validator schemas derive their types from these constants.
 *
 * Implements: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 */

// =============================================================================
// MFA Methods
// =============================================================================

/**
 * Multi-factor authentication methods supported
 */
export const MFA_METHODS = [
  'totp',    // Time-based One-Time Password (authenticator apps)
  'sms',     // SMS verification
  'email',   // Email verification
  'backup',  // Backup codes
] as const;

export type MfaMethod = (typeof MFA_METHODS)[number];

// =============================================================================
// OAuth Providers
// =============================================================================

/**
 * OAuth providers supported for SSO
 */
export const OAUTH_PROVIDERS = [
  'google',  // Google OAuth
  'azure',   // Microsoft Azure AD / Entra ID
] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
