'use client';

/**
 * Auth Provider Components
 *
 * SSO button components for OAuth providers (Google, Microsoft, GitHub, LinkedIn).
 *
 * IMPLEMENTS: PG-015 (Sign In page), PG-124 (SSO/OAuth), FLOW-001 (Login with MFA/SSO)
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
  onError?: (error: Readonly<Error>) => void;
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
}: Readonly<AuthProviderButtonProps>) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    console.log('[GoogleSignIn] Button clicked, isLoading:', isLoading, 'disabled:', disabled);
    if (isLoading || disabled) return;

    setIsLoading(true);
    try {
      console.log('[GoogleSignIn] Calling onLogin...');
      await onLogin();
      console.log('[GoogleSignIn] onLogin completed');
    } catch (error) {
      console.error('[GoogleSignIn] Error:', error);
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
          <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
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
}: Readonly<AuthProviderButtonProps>) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    console.log('[MicrosoftSignIn] Button clicked, isLoading:', isLoading, 'disabled:', disabled);
    if (isLoading || disabled) return;

    setIsLoading(true);
    try {
      console.log('[MicrosoftSignIn] Calling onLogin...');
      await onLogin();
      console.log('[MicrosoftSignIn] onLogin completed');
    } catch (error) {
      console.error('[MicrosoftSignIn] Error:', error);
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
          <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
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
// GitHub Sign In Button (PG-124)
// ============================================

/**
 * GitHub OAuth sign-in button
 */
export function GitHubSignInButton({
  onLogin,
  onError,
  disabled = false,
  className = '',
}: Readonly<AuthProviderButtonProps>) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onLogin();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('GitHub sign-in failed');
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
      aria-label={isLoading ? 'Signing in with GitHub...' : 'Sign in with GitHub'}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <>
          <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
            progress_activity
          </span>
          <span className="text-sm">Connecting...</span>
        </>
      ) : (
        <>
          <GitHubIcon />
          <span className="text-sm">GitHub</span>
        </>
      )}
    </button>
  );
}

// ============================================
// LinkedIn Sign In Button (PG-124)
// ============================================

/**
 * LinkedIn OAuth sign-in button
 */
export function LinkedInSignInButton({
  onLogin,
  onError,
  disabled = false,
  className = '',
}: Readonly<AuthProviderButtonProps>) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onLogin();
    } catch (error) {
      const err = error instanceof Error ? error : new Error('LinkedIn sign-in failed');
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
      aria-label={isLoading ? 'Signing in with LinkedIn...' : 'Sign in with LinkedIn'}
      aria-busy={isLoading}
    >
      {isLoading ? (
        <>
          <span className="material-symbols-outlined animate-spin text-xl" aria-hidden="true">
            progress_activity
          </span>
          <span className="text-sm">Connecting...</span>
        </>
      ) : (
        <>
          <LinkedInIcon />
          <span className="text-sm">LinkedIn</span>
        </>
      )}
    </button>
  );
}

// ============================================
// Enterprise SSO Link (PG-124)
// ============================================

/**
 * Link to Enterprise SSO page
 */
export function EnterpriseSsoLink() {
  return (
    <a
      href="/sso"
      className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] rounded-md"
      aria-label="Sign in with Enterprise SSO"
    >
      <span className="material-symbols-outlined text-lg" aria-hidden="true">
        lock
      </span>
      <span>Sign in with Enterprise SSO</span>
    </a>
  );
}

// ============================================
// Social Login Grid
// ============================================

export interface SocialLoginGridProps {
  /** Handler for Google login */
  onGoogleLogin: () => Promise<void>;
  /** Handler for Microsoft login */
  onMicrosoftLogin: () => Promise<void>;
  /** Handler for GitHub login (PG-124) */
  onGitHubLogin?: () => Promise<void>;
  /** Handler for LinkedIn login (PG-124) */
  onLinkedInLogin?: () => Promise<void>;
  /** Error handler for all providers */
  onError?: (error: Readonly<Error>) => void;
  /** Disable all buttons */
  disabled?: boolean;
}

/**
 * Grid layout for social login buttons
 *
 * Renders provider buttons in a responsive grid:
 * - Mobile: single column stack
 * - Tablet+: 2-column grid (2x2)
 */
export function SocialLoginGrid({
  onGoogleLogin,
  onMicrosoftLogin,
  onGitHubLogin,
  onLinkedInLogin,
  onError,
  disabled = false,
}: Readonly<SocialLoginGridProps>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <GoogleSignInButton onLogin={onGoogleLogin} onError={onError} disabled={disabled} />
      <MicrosoftSignInButton onLogin={onMicrosoftLogin} onError={onError} disabled={disabled} />
      {onGitHubLogin && (
        <GitHubSignInButton onLogin={onGitHubLogin} onError={onError} disabled={disabled} />
      )}
      {onLinkedInLogin && (
        <LinkedInSignInButton onLogin={onLinkedInLogin} onError={onError} disabled={disabled} />
      )}
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
export function OAuthDivider({ text = 'Or continue with' }: Readonly<OAuthDividerProps>) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 border-t border-white/10" />
      <span className="text-sm text-slate-400 whitespace-nowrap">{text}</span>
      <div className="flex-1 border-t border-white/10" />
    </div>
  );
}

// ============================================
// Icons
// ============================================

/**
 * Google logo SVG icon
 */
function GoogleIcon({ className = 'w-5 h-5' }: Readonly<{ className?: string }>) {
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
function MicrosoftIcon({ className = 'w-5 h-5' }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M13 1h10v10H13z" />
      <path fill="#05a6f0" d="M1 13h10v10H1z" />
      <path fill="#ffba08" d="M13 13h10v10H13z" />
    </svg>
  );
}

/**
 * GitHub logo SVG icon (PG-124)
 */
function GitHubIcon({ className = 'w-5 h-5' }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

/**
 * LinkedIn logo SVG icon (PG-124)
 */
function LinkedInIcon({ className = 'w-5 h-5' }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#0A66C2"
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
      />
    </svg>
  );
}

// Export icons for external use
export { GoogleIcon, MicrosoftIcon, GitHubIcon, LinkedInIcon };
