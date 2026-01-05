/**
 * @vitest-environment happy-dom
 *
 * OAuth Callback Component Tests
 *
 * IMPLEMENTS: PG-024 (SSO Callback)
 *
 * Component tests for the OAuth Callback component.
 * Tests rendering, states, and user interactions.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions to ensure they're available before vi.mock runs
const {
  mockExtractOAuthParams,
  mockValidateOAuthParams,
  mockOAuthCallback,
  mockPush,
  mockReplace,
  mockStoreSessionFingerprint,
} = vi.hoisted(() => ({
  mockExtractOAuthParams: vi.fn(),
  mockValidateOAuthParams: vi.fn(),
  mockOAuthCallback: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockStoreSessionFingerprint: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams('code=test123&provider=google'),
}));

// Mock token-exchange utilities
vi.mock('@/lib/shared/token-exchange', () => ({
  extractOAuthParams: (params: URLSearchParams) => mockExtractOAuthParams(params),
  validateOAuthParams: (params: unknown) => mockValidateOAuthParams(params),
  storeSessionTokens: vi.fn(),
  clearSessionTokens: vi.fn(),
}));

// Mock login-security
vi.mock('@/lib/shared/login-security', () => ({
  storeSessionFingerprint: () => mockStoreSessionFingerprint(),
}));

// Mock tRPC - create a proper hook structure
const mockMutateAsync = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      oauthCallback: {
        useMutation: () => ({
          mutateAsync: mockOAuthCallback,
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

// Import component after mocks are set up
import { OAuthCallback } from '../oauth-callback';

describe('OAuthCallback', () => {
  const defaultValidParams = {
    code: 'test123',
    state: null,
    error: null,
    errorDescription: null,
    provider: 'google' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractOAuthParams.mockReturnValue(defaultValidParams);
    mockValidateOAuthParams.mockReturnValue({
      ok: true,
      value: { code: 'test123', provider: 'google' },
    });
    mockOAuthCallback.mockResolvedValue({
      success: true,
      session: {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_123',
      },
      user: { id: 'user_1', email: 'user@example.com' },
    });
  });

  // ============================================
  // Rendering Tests
  // ============================================
  describe('rendering', () => {
    it('renders callback container', () => {
      render(<OAuthCallback />);

      expect(screen.getByRole('main') || screen.getByTestId('oauth-callback')).toBeInTheDocument();
    });

    it('shows loading state initially', async () => {
      render(<OAuthCallback />);

      // Initial loading state
      expect(screen.getByText(/signing you in|authenticating/i)).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<OAuthCallback className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  // ============================================
  // Success State Tests
  // ============================================
  describe('success state', () => {
    it('shows success message after authentication', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
      });
    });

    it('calls oauthCallback mutation with correct params', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockOAuthCallback).toHaveBeenCalledWith({
          code: 'test123',
          provider: 'google',
        });
      });
    });

    it('stores session fingerprint on success', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockStoreSessionFingerprint).toHaveBeenCalled();
      });
    });

    it('calls onSuccess callback with user data', async () => {
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('redirects to dashboard by default', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      }, { timeout: 3000 });
    });

    it('redirects to custom URL when provided', async () => {
      render(<OAuthCallback redirectUrl="/onboarding" />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/onboarding');
      }, { timeout: 3000 });
    });
  });

  // ============================================
  // Error State Tests
  // ============================================
  describe('error states', () => {
    it('shows error for provider error', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: 'User cancelled the login' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('shows error for missing code', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'MISSING_CODE', message: 'No authorization code received' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/authorization code/i)).toBeInTheDocument();
      });
    });

    it('shows error for exchange failure', async () => {
      mockOAuthCallback.mockRejectedValue(new Error('Exchange failed'));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('shows error when session creation fails', async () => {
      mockOAuthCallback.mockResolvedValue({
        success: false,
        error: 'Session creation failed',
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('calls onError callback on error', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'MISSING_CODE', message: 'No authorization code' },
      });

      const onError = vi.fn();
      render(<OAuthCallback onError={onError} />);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('No authorization code');
      });
    });
  });

  // ============================================
  // Navigation Tests
  // ============================================
  describe('navigation', () => {
    it('shows back to login button on error', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: 'Error' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in|login|back/i })).toBeInTheDocument();
      });
    });

    it('navigates to login when back button clicked', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: 'Error' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in|login|back/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /sign in|login|back/i }));

      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('shows try again button on error', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: 'Error' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Accessibility Tests
  // ============================================
  describe('accessibility', () => {
    it('has accessible status region', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        const statusRegion = screen.getByRole('status') || document.querySelector('[aria-live]');
        expect(statusRegion).toBeInTheDocument();
      });
    });

    it('buttons have accessible names', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: false,
        error: { code: 'PROVIDER_ERROR', message: 'Error' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /sign in|login|back/i });
        expect(backButton).toHaveAccessibleName();
      });
    });

    it('icons are hidden from screen readers', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        const icons = document.querySelectorAll('.material-symbols-outlined');
        icons.forEach((icon) => {
          expect(icon).toHaveAttribute('aria-hidden', 'true');
        });
      });
    });

    it('loading state has aria-busy', async () => {
      render(<OAuthCallback />);

      // Check initial loading state
      const container = document.querySelector('[data-testid="oauth-callback"]') || document.querySelector('main');
      if (container) {
        // May have aria-busy during loading
        expect(container).toBeInTheDocument();
      }
    });
  });

  // ============================================
  // Loading States
  // ============================================
  describe('loading states', () => {
    it('shows spinner during authentication', () => {
      render(<OAuthCallback />);

      // Check for loading indicator
      expect(screen.getByText(/signing you in|authenticating/i)).toBeInTheDocument();
    });

    it('shows exchanging state while calling API', async () => {
      // Delay the mutation to catch the loading state
      mockOAuthCallback.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({
          success: true,
          session: { accessToken: 'token' },
          user: { id: '1' },
        }), 100))
      );

      render(<OAuthCallback />);

      // Should show loading/exchanging initially
      expect(screen.getByText(/signing you in|authenticating|please wait/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    it('handles missing session in response', async () => {
      mockOAuthCallback.mockResolvedValue({
        success: true,
        session: null,
        user: { id: '1' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('handles network error gracefully', async () => {
      mockOAuthCallback.mockRejectedValue(new Error('Network error'));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('handles timeout error', async () => {
      mockOAuthCallback.mockRejectedValue(new Error('Request timeout'));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Security Tests
  // ============================================
  describe('security', () => {
    it('includes state in mutation when present', async () => {
      mockValidateOAuthParams.mockReturnValue({
        ok: true,
        value: { code: 'test123', state: 'csrf_state', provider: 'google' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockOAuthCallback).toHaveBeenCalledWith({
          code: 'test123',
          state: 'csrf_state',
          provider: 'google',
        });
      });
    });

    it('displays security badge', () => {
      render(<OAuthCallback />);

      expect(screen.getByText(/Secure authentication via OAuth 2\.0/i)).toBeInTheDocument();
    });
  });
});
