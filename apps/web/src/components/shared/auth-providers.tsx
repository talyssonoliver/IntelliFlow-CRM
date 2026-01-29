'use client';

/**
 * Auth Provider Components
 *
 * SSO button components for OAuth providers (Google, Microsoft).
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Features:
 * - Consistent styling with login page
 * - Loading states during OAuth flow
 * - Error handling with callbacks
 * - Accessibility support
 */

import { useState } from 'react';

// ============================================
// Types
// ============================================

export interface AuthProviderButtonProps {
  /**
   * Called when OAuth flow is initiated
   * Returns the OAuth redirect URL to navigate to
   */
  onLogin: () => Promise<void>;
  /**
   * Called when an error occurs during the OAuth flow
   */
  onError?: (error: Error) => void;
  /**
   * Disable the button (e.g., when another login is in progress)
   */
  disabled?: boolean;
  /**
   * Custom class name to extend styling
   */
  className?: string;
}

// ============================================
// Base Button Styles
// ============================================

const baseButtonStyles = `
  flex items-center justify-center gap-2 px-4 py-3 rounded-lg
  border border-white/10 bg-white/5 text-slate-200 font-medium
  hover:bg-white/10 hover:border-white/20
  transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]
  focus:ring-offset-2 focus:ring-offset-[#0f172a] backdrop-blur-sm
  disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:border-white/10
`;

// ============================================
// Google Sign In Button
// ============================================

/**
 * Google OAuth sign-in button
 *
 * @example
 * ```tsx
 * <GoogleSignInButton
 *   onLogin={async () => {
 *     const url = await auth.loginWithOAuth('google');
 *     window.location.href = url;
 *   }}
 *   onError={(err) => toast.error(err.message)}
 * />
 * ```
 */
export function GoogleSignInButton({
  onLogin,
  onError,
  disabled = false,
  className = '',
}: AuthProviderButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || disabled) return;

    setIsLoading(true);
    try {
      await onLogin();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Google sign-in failed');
      onError?.(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`${baseButtonStyles} ${className}`}
      aria-label={isLoading ? 'Signing in with Google...' : 'Sign in with Google'}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <>
          <span
            className="material-symbols-outlined animate-spin text-xl"
            aria-hidden="true"
          >
            progress_activity
          </span>
          <span className="text-sm">Connecting...</span>
        </>
      ) : (
        <>
          <GoogleIcon />
          <span className="text-sm">Google</span>
        </>
      )}
    </button>
  );
}

// ============================================
// Microsoft Sign In Button
// ============================================

/**
 * Microsoft OAuth sign-in button
 *
 * @example
 * ```tsx
 * <MicrosoftSignInButton
 *   onLogin={async () => {
 *     const url = await auth.loginWithOAuth('azure');
 *     window.location.href = url;
 *   }}
 *   onError={(err) => toast.error(err.message)}
 * />
 * ```
 */
export function MicrosoftSignInButton({
  onLogin,
  onError,
  disabled = false,
  className = '',
}: AuthProviderButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || disabled) return;

    setIsLoading(true);
    try {
      await onLogin();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Microsoft sign-in failed');
      onError?.(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`${baseButtonStyles} ${className}`}
      aria-label={isLoading ? 'Signing in with Microsoft...' : 'Sign in with Microsoft'}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <>
          <span
            className="material-symbols-outlined animate-spin text-xl"
            aria-hidden="true"
          >
            progress_activity
          </span>
          <span className="text-sm">Connecting...</span>
        </>
      ) : (
        <>
          <MicrosoftIcon />
          <span className="text-sm">Microsoft</span>
        </>
      )}
    </button>
  );
}

// ============================================
// Social Login Grid
// ============================================

export interface SocialLoginGridProps {
  /**
   * Handler for Google login
   */
  onGoogleLogin: () => Promise<void>;
  /**
   * Handler for Microsoft login
   */
  onMicrosoftLogin: () => Promise<void>;
  /**
   * Error handler for both providers
   */
  onError?: (error: Error) => void;
  /**
   * Disable all buttons
   */
  disabled?: boolean;
}

/**
 * Grid layout for social login buttons
 *
 * Renders Google and Microsoft buttons in a 2-column grid
 * with consistent styling.
 *
 * @example
 * ```tsx
 * <SocialLoginGrid
 *   onGoogleLogin={() => auth.loginWithOAuth('google')}
 *   onMicrosoftLogin={() => auth.loginWithOAuth('azure')}
 *   onError={(err) => toast.error(err.message)}
 * />
 * ```
 */
export function SocialLoginGrid({
  onGoogleLogin,
  onMicrosoftLogin,
  onError,
  disabled = false,
}: SocialLoginGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <GoogleSignInButton
        onLogin={onGoogleLogin}
        onError={onError}
        disabled={disabled}
      />
      <MicrosoftSignInButton
        onLogin={onMicrosoftLogin}
        onError={onError}
        disabled={disabled}
      />
    </div>
  );
}

// ============================================
// OAuth Divider
// ============================================

export interface OAuthDividerProps {
  /**
   * Text to display in the divider
   * @default "Or continue with"
   */
  text?: string;
}

/**
 * Divider component for separating email login from OAuth
 */
export function OAuthDivider({ text = 'Or continue with' }: OAuthDividerProps) {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/10" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="px-4 bg-transparent text-slate-400">{text}</span>
      </div>
    </div>
  );
}

// ============================================
// Icons
// ============================================

/**
 * Google logo SVG icon
 */
function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/**
 * Microsoft logo SVG icon (colored)
 */
function MicrosoftIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M13 1h10v10H13z" />
      <path fill="#05a6f0" d="M1 13h10v10H1z" />
      <path fill="#ffba08" d="M13 13h10v10H13z" />
    </svg>
  );
}

// Export icons for external use
export { GoogleIcon, MicrosoftIcon };
