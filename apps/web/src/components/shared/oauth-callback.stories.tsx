/**
 * OAuth Callback Component Stories
 *
 * IMPLEMENTS: PG-024 (SSO Callback)
 *
 * Storybook stories for the OAuth Callback component.
 * Shows all possible states during OAuth authentication flow.
 */

import type { Meta, StoryObj } from '@storybook/react';

// Wrapper for auth background styling
const AuthBackgroundWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-[#0f172a] relative overflow-hidden">
    {/* Animated background gradients */}
    <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37]" />
    <div
      className="absolute -left-40 top-20 h-96 w-96 rounded-full bg-[#137fec]/20 blur-3xl opacity-50 animate-pulse"
      style={{ animationDuration: '4s' }}
    />
    <div
      className="absolute right-0 bottom-0 h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-3xl opacity-40 animate-pulse"
      style={{ animationDuration: '6s', animationDelay: '1s' }}
    />
    {/* Grid pattern */}
    <div
      className="absolute inset-0 opacity-[0.015]"
      style={{
        backgroundImage: `linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
      }}
    />
    {children}
  </div>
);

/**
 * Mock component that doesn't call tRPC - used for static stories
 * Since the real component requires tRPC context, we create visual mockups
 */
const MockOAuthCallback = ({
  status = 'loading',
  errorMessage = '',
  className,
}: {
  status: 'loading' | 'exchanging' | 'success' | 'error';
  errorMessage?: string;
  className?: string;
}) => {
  const statusConfig = {
    loading: {
      icon: 'progress_activity',
      title: 'Signing you in...',
      description: 'Please wait while we authenticate your account',
      iconColor: 'text-[#7cc4ff]',
      bgColor: 'bg-[#137fec]/20',
      animate: true,
    },
    exchanging: {
      icon: 'sync',
      title: 'Authenticating...',
      description: 'Verifying your credentials with the provider',
      iconColor: 'text-[#7cc4ff]',
      bgColor: 'bg-[#137fec]/20',
      animate: true,
    },
    success: {
      icon: 'check_circle',
      title: 'Welcome!',
      description: 'You have been successfully signed in. Redirecting...',
      iconColor: 'text-green-400',
      bgColor: 'bg-green-500/20',
      animate: false,
    },
    error: {
      icon: 'error',
      title: 'Authentication Failed',
      description: errorMessage || 'Something went wrong. Please try again.',
      iconColor: 'text-red-400',
      bgColor: 'bg-red-500/20',
      animate: false,
    },
  };

  const config = statusConfig[status];

  return (
    <main
      className={`relative flex items-center justify-center py-12 px-4 ${className || ''}`}
      data-testid="oauth-callback"
    >
      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] via-transparent to-[#137fec]/[0.03]" />

          <div className="relative p-8 text-center space-y-6" role="status" aria-live="polite">
            <div
              className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${config.bgColor}`}
            >
              <span
                className={`material-symbols-outlined text-5xl ${config.iconColor} ${config.animate ? 'animate-spin' : ''}`}
                aria-hidden="true"
              >
                {config.icon}
              </span>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">{config.title}</h1>
              <p className="text-sm text-slate-300">{config.description}</p>
            </div>

            {status === 'error' && (
              <div className="pt-4 space-y-3">
                <button className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 focus:ring-offset-[#0f172a] shadow-lg shadow-[#137fec]/20">
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    arrow_back
                  </span>
                  Back to Sign In
                </button>
                <button className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 font-medium hover:bg-white/10 transition-all focus:outline-none focus:ring-2 focus:ring-[#7cc4ff]">
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    refresh
                  </span>
                  Try Again
                </button>
              </div>
            )}

            {(status === 'loading' || status === 'exchanging') && (
              <div className="pt-2">
                <div className="flex justify-center gap-1">
                  <div
                    className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-2 h-2 rounded-full bg-[#7cc4ff] animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="pt-2">
                <p className="text-xs text-slate-400">Redirecting to dashboard in a moment...</p>
              </div>
            )}
          </div>

          <div className="bg-white/[0.03] border-t border-white/10 px-8 py-4">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
              <span
                className="material-symbols-outlined text-base text-[#7cc4ff]"
                aria-hidden="true"
              >
                verified_user
              </span>
              <span>Secure authentication via OAuth 2.0</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <span
              className="material-symbols-outlined text-sm text-[#7cc4ff]"
              aria-hidden="true"
            >
              lock
            </span>
            Secure
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span
              className="material-symbols-outlined text-sm text-[#7cc4ff]"
              aria-hidden="true"
            >
              shield_check
            </span>
            Encrypted
          </div>
          <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <span
              className="material-symbols-outlined text-sm text-[#7cc4ff]"
              aria-hidden="true"
            >
              policy
            </span>
            Protected
          </div>
        </div>
      </div>
    </main>
  );
};

const meta = {
  title: 'Auth/OAuthCallback',
  component: MockOAuthCallback,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
    },
    docs: {
      description: {
        component: `
OAuth Callback component handles the authentication flow after a user is redirected back from an OAuth provider (Google, Microsoft).

## States

1. **Loading** - Initial state, extracting OAuth parameters from URL
2. **Exchanging** - Calling the API to exchange authorization code for session
3. **Success** - Authentication successful, redirecting to dashboard
4. **Error** - Authentication failed, showing error with retry option

## Features

- Extracts and validates OAuth parameters from URL
- Exchanges authorization code for session via tRPC
- Stores session tokens securely
- Provides clear feedback for all states
- Accessible with proper ARIA attributes
- Design system compliant with Material Symbols icons
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <AuthBackgroundWrapper>
        <Story />
      </AuthBackgroundWrapper>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof MockOAuthCallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Initial loading state when the component mounts and
 * begins extracting OAuth parameters from the URL.
 */
export const Loading: Story = {
  args: {
    status: 'loading',
  },
};

/**
 * Exchanging state shown while the authorization code
 * is being exchanged for a session via the API.
 */
export const Exchanging: Story = {
  args: {
    status: 'exchanging',
  },
};

/**
 * Success state shown after successful authentication.
 * The user will be automatically redirected to the dashboard.
 */
export const Success: Story = {
  args: {
    status: 'success',
  },
};

/**
 * Error state when the OAuth provider returns an error,
 * such as when the user cancels the login.
 */
export const ProviderError: Story = {
  args: {
    status: 'error',
    errorMessage: 'The user cancelled the login or denied access.',
  },
};

/**
 * Error state when the authorization code exchange fails
 * due to an expired or invalid code.
 */
export const ExchangeFailed: Story = {
  args: {
    status: 'error',
    errorMessage: 'Failed to exchange the authorization code. The code may have expired.',
  },
};

/**
 * Error state when no authorization code is present
 * in the callback URL.
 */
export const MissingCode: Story = {
  args: {
    status: 'error',
    errorMessage: 'No authorization code received from the provider. Please try signing in again.',
  },
};

/**
 * Error state for network-related issues during authentication.
 */
export const NetworkError: Story = {
  args: {
    status: 'error',
    errorMessage: 'A network error occurred. Please check your connection and try again.',
  },
};

/**
 * Error state for session creation failures.
 */
export const SessionFailed: Story = {
  args: {
    status: 'error',
    errorMessage: 'Failed to create your session. Please try signing in again.',
  },
};

/**
 * Generic error state with default message.
 */
export const GenericError: Story = {
  args: {
    status: 'error',
    errorMessage: '',
  },
};

/**
 * Error state for server-side errors from the OAuth provider.
 */
export const ServerError: Story = {
  args: {
    status: 'error',
    errorMessage: 'The authentication server encountered an error. Please try again later.',
  },
};
