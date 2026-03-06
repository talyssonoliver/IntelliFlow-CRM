/**
 * SSO Handler — Domain Resolution & Security Utilities
 *
 * Pure TypeScript utilities for enterprise SSO email-domain lookup,
 * Supabase provider name mapping, and redirect URL validation.
 *
 * IMPLEMENTS: PG-124 (SSO/OAuth social login providers)
 * ADR: ADR-039 (SAML SSO Integration)
 */

import type { OAuthProvider } from '@intelliflow/domain';
import providerConfig from './provider-config.json';

// =============================================================================
// Types
// =============================================================================

export interface SsoProviderConfig {
  domain: string;
  provider_id: string;
  provider_name: string;
  provider_type: 'saml' | 'oauth';
  enabled: boolean;
}

export type SsoResolution =
  | { found: true; config: SsoProviderConfig }
  | { found: false; suggestion?: string };

interface ProviderConfigFile {
  version: string;
  providers: SsoProviderConfig[];
  fallback: {
    message: string;
    login_url: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Allowlist of internal redirect paths.
 * Only these paths (and their sub-paths) are considered safe redirect targets.
 */
export const REDIRECT_ALLOWLIST = ['/', '/dashboard', '/settings'] as const;

// =============================================================================
// Functions
// =============================================================================

/**
 * Resolve SSO provider for a given email address.
 * Extracts the domain from the email and looks it up in the static provider config.
 *
 * @param email - Work email address (e.g., "user@example-corp.com")
 * @returns SsoResolution - found with config, or not found with optional suggestion
 */
export function resolveSsoProvider(email: string): SsoResolution {
  if (!email?.includes('@')) {
    return { found: false };
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return { found: false };
  }

  const config = (providerConfig as ProviderConfigFile).providers.find(
    (p) => p.domain.toLowerCase() === domain && p.enabled
  );

  if (config) {
    return { found: true, config };
  }

  return {
    found: false,
    suggestion: (providerConfig as ProviderConfigFile).fallback.message,
  };
}

/**
 * Map an OAuthProvider to its Supabase provider name.
 * LinkedIn uses 'linkedin_oidc' in Supabase, all others pass through.
 *
 * @param provider - OAuth provider identifier
 * @returns Supabase-compatible provider name
 */
export function getSupabaseProviderName(provider: OAuthProvider): string {
  if (provider === 'linkedin') {
    return 'linkedin_oidc';
  }
  return provider;
}

/**
 * Validate a redirect URL against the internal allowlist.
 * Prevents open redirect attacks by only allowing known internal paths.
 *
 * @param url - URL to validate
 * @returns true if the URL is a safe internal redirect target
 */
export function validateRedirectUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  // Block protocol-relative URLs (//evil.com)
  if (url.startsWith('//')) {
    return false;
  }

  // Block javascript: and other dangerous schemes
  if (url.includes(':') && !url.startsWith('/')) {
    return false;
  }

  // Must start with / to be a relative path
  if (!url.startsWith('/')) {
    return false;
  }

  // Check against allowlist — path must start with an allowed prefix
  return REDIRECT_ALLOWLIST.some((allowed) => url === allowed || url.startsWith(`${allowed}/`));
}
