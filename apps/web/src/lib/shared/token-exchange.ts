/**
 * Token Exchange Service
 *
 * Utilities for OAuth token exchange in SSO callback flow.
 *
 * IMPLEMENTS: PG-024 (SSO Callback)
 *
 * Features:
 * - OAuth parameter extraction from URL
 * - Parameter validation with typed errors
 * - User-friendly error messages
 * - Type-safe result pattern
 *
 * Flow:
 * 1. OAuth provider redirects to /auth/callback with code/error
 * 2. extractOAuthParams() extracts params from URL
 * 3. validateOAuthParams() validates and returns typed result
 * 4. If valid, call tRPC oauthCallback to exchange code for session
 */

// ============================================
// Types
// ============================================

export type OAuthProvider = 'google' | 'azure';

export interface OAuthParams {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
  provider: OAuthProvider | null;
}

export interface ValidatedOAuthParams {
  code: string;
  state?: string;
  provider?: OAuthProvider;
}

export type OAuthErrorCode =
  | 'MISSING_CODE'
  | 'PROVIDER_ERROR'
  | 'EXCHANGE_FAILED'
  | 'SESSION_FAILED'
  | 'NETWORK_ERROR';

export interface OAuthError {
  code: OAuthErrorCode;
  message: string;
}

export type OAuthValidationResult =
  | { ok: true; value: ValidatedOAuthParams }
  | { ok: false; error: OAuthError };

// ============================================
// Error Messages
// ============================================

const ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  MISSING_CODE: 'No authorization code received from the provider. Please try signing in again.',
  PROVIDER_ERROR: 'The authentication provider returned an error. Please try again.',
  EXCHANGE_FAILED: 'Failed to exchange the authorization code for a session. Please try again.',
  SESSION_FAILED: 'Failed to create your session. Please try signing in again.',
  NETWORK_ERROR: 'A network error occurred. Please check your connection and try again.',
};

// ============================================
// Parameter Extraction
// ============================================

/**
 * Extract OAuth parameters from URL search params
 *
 * @param searchParams - URLSearchParams from the callback URL
 * @returns Extracted OAuth parameters
 */
export function extractOAuthParams(searchParams: URLSearchParams): OAuthParams {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  const providerRaw = searchParams.get('provider');

  // Validate provider is one of the known types
  const provider: OAuthProvider | null =
    providerRaw === 'google' || providerRaw === 'azure' ? providerRaw : null;

  return {
    code,
    state,
    error,
    errorDescription,
    provider,
  };
}

// ============================================
// Parameter Validation
// ============================================

/**
 * Validate OAuth parameters and return typed result
 *
 * @param params - OAuth parameters to validate
 * @returns Validation result with either valid params or error
 */
export function validateOAuthParams(params: OAuthParams): OAuthValidationResult {
  // Check for provider errors first (higher priority)
  if (params.error) {
    const message = params.errorDescription
      ? params.errorDescription
      : `OAuth error: ${params.error}`;

    return {
      ok: false,
      error: {
        code: 'PROVIDER_ERROR',
        message,
      },
    };
  }

  // Check for missing or invalid code
  const code = params.code?.trim();
  if (!code) {
    return {
      ok: false,
      error: {
        code: 'MISSING_CODE',
        message: ERROR_MESSAGES.MISSING_CODE,
      },
    };
  }

  // Build validated params
  const validated: ValidatedOAuthParams = {
    code,
  };

  if (params.state) {
    validated.state = params.state;
  }

  if (params.provider) {
    validated.provider = params.provider;
  }

  return {
    ok: true,
    value: validated,
  };
}

// ============================================
// Error Utilities
// ============================================

/**
 * Get user-friendly error message for an error code
 *
 * @param code - OAuth error code
 * @returns User-friendly error message
 */
export function getOAuthErrorMessage(code: OAuthErrorCode): string {
  return ERROR_MESSAGES[code] || 'An unexpected error occurred. Please try again.';
}

/**
 * Type guard to check if an error is an OAuthError
 *
 * @param error - Error to check
 * @returns True if error is an OAuthError
 */
export function isOAuthError(error: unknown): error is OAuthError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const obj = error as Record<string, unknown>;
  return (
    typeof obj.code === 'string' &&
    typeof obj.message === 'string' &&
    Object.keys(ERROR_MESSAGES).includes(obj.code)
  );
}

// ============================================
// Session Storage Utilities
// ============================================

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

/**
 * Store session tokens in localStorage
 *
 * @param accessToken - Access token to store
 * @param refreshToken - Optional refresh token to store
 */
export function storeSessionTokens(accessToken: string, refreshToken?: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

/**
 * Clear session tokens from localStorage
 */
export function clearSessionTokens(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Get stored access token
 *
 * @returns Access token or null if not stored
 */
export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY);
}
