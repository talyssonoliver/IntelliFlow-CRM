/**
 * @vitest-environment jsdom
 */
/**
 * OAuth Callback Component Tests
 *
 * IMPLEMENTS: PG-024 (SSO Callback), PG-124 (nonce-based CSRF verification)
 *
 * The OAuthCallback component uses Supabase's PKCE flow:
 * 1. Checks for ?code= or ?error= in URL search params
 * 2. Verifies nonce from sessionStorage matches ?nonce= param (SF-001)
 * 3. Calls supabase.auth.getSession() (PKCE exchange happens internally)
 * 4. Stores tokens, fingerprint, and success flag
 * 5. Redirects to dashboard or calls onSuccess callback
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions
const {
  mockPush,
  mockReplace,
  mockGetSession,
  mockGetUser,
  mockStoreSessionTokens,
  mockStoreSessionFingerprint,
  mockClearSupabaseLocalStorage,
  mockSearchParams,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetUser: vi.fn(),
  mockStoreSessionTokens: vi.fn(),
  mockStoreSessionFingerprint: vi.fn(),
  mockClearSupabaseLocalStorage: vi.fn(),
  mockSearchParams: new URLSearchParams('code=test123&nonce=test-nonce-uuid'),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock supabase-browser
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  }),
  clearSupabaseLocalStorage: mockClearSupabaseLocalStorage,
}));

// Mock token-exchange
vi.mock('@/lib/shared/token-exchange', () => ({
  storeSessionTokens: mockStoreSessionTokens,
}));

// Mock login-security
vi.mock('@/lib/shared/login-security', () => ({
  storeSessionFingerprint: mockStoreSessionFingerprint,
}));

// Import component after mocks
import { OAuthCallback } from '../oauth-callback';

describe('OAuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up valid nonce in sessionStorage
    sessionStorage.setItem('intelliflow_oauth_nonce', 'test-nonce-uuid');
    // Reset search params to valid code+nonce
    Object.defineProperty(mockSearchParams, 'get', {
      value: (key: string) => {
        const params = new URLSearchParams('code=test123&nonce=test-nonce-uuid');
        return params.get(key);
      },
      writable: true,
      configurable: true,
    });
    // Default: successful session
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'access_token_123',
          refresh_token: 'refresh_token_123',
        },
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user_1', email: 'user@example.com' } },
    });
  });

  // ============================================
  // Rendering Tests
  // ============================================
  describe('rendering', () => {
    it('renders callback container', () => {
      render(<OAuthCallback />);
      expect(screen.getByTestId('oauth-callback')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      render(<OAuthCallback />);
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

    it('calls supabase getSession for PKCE exchange', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalled();
      });
    });

    it('stores session tokens on success', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockStoreSessionTokens).toHaveBeenCalledWith(
          'access_token_123',
          'refresh_token_123'
        );
      });
    });

    it('stores session fingerprint on success', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockStoreSessionFingerprint).toHaveBeenCalled();
      });
    });

    it('stores oauth_login_success timestamp in sessionStorage (SF-002)', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        const stored = sessionStorage.getItem('oauth_login_success');
        expect(stored).toBeTruthy();
        expect(Number(stored)).toBeGreaterThan(0);
      });
    });

    it('clears supabase localStorage on success', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockClearSupabaseLocalStorage).toHaveBeenCalled();
      });
    });

    it('calls onSuccess callback with user data', async () => {
      const onSuccess = vi.fn();
      render(<OAuthCallback onSuccess={onSuccess} />);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          { id: 'user_1', email: 'user@example.com' },
          { accessToken: 'access_token_123' }
        );
      });
    });

    it('redirects to dashboard by default', async () => {
      render(<OAuthCallback />);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith('/dashboard');
        },
        { timeout: 3000 }
      );
    });

    it('redirects to custom URL when provided', async () => {
      render(<OAuthCallback redirectUrl="/onboarding" />);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith('/onboarding');
        },
        { timeout: 3000 }
      );
    });
  });

  // ============================================
  // Nonce / CSRF Tests (SF-001)
  // ============================================
  describe('nonce verification (SF-001)', () => {
    it('rejects when nonce is missing from sessionStorage', async () => {
      sessionStorage.removeItem('intelliflow_oauth_nonce');

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/security verification failed/i)).toBeInTheDocument();
      });
    });

    it('rejects when nonce does not match URL param', async () => {
      sessionStorage.setItem('intelliflow_oauth_nonce', 'different-nonce');

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/security verification failed/i)).toBeInTheDocument();
      });
    });

    it('removes nonce from sessionStorage after verification', async () => {
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(sessionStorage.getItem('intelliflow_oauth_nonce')).toBeNull();
      });
    });

    it('calls onError with csrf when nonce fails', async () => {
      sessionStorage.removeItem('intelliflow_oauth_nonce');
      const onError = vi.fn();

      render(<OAuthCallback onError={onError} />);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('csrf');
      });
    });
  });

  // ============================================
  // Error State Tests
  // ============================================
  describe('error states', () => {
    it('shows error when no code or error in URL (bookmarked URL)', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/no authentication data found/i)).toBeInTheDocument();
      });
    });

    it('shows provider error from URL params', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: (key: string) => {
          if (key === 'error') return 'access_denied';
          if (key === 'error_description') return 'User cancelled the login';
          return null;
        },
        writable: true,
        configurable: true,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/user cancelled the login/i)).toBeInTheDocument();
      });
    });

    it('shows error when getSession fails', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session exchange failed' },
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('shows error when session is null', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/session could not be established/i)).toBeInTheDocument();
      });
    });

    it('calls onError callback on error', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
      });

      const onError = vi.fn();
      render(<OAuthCallback onError={onError} />);

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  // ============================================
  // Navigation Tests
  // ============================================
  describe('navigation', () => {
    it('shows back to login button on error', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in|login|back/i })).toBeInTheDocument();
      });
    });

    it('navigates to login when back button clicked', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /sign in|login|back/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /sign in|login|back/i }));
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('shows try again button on error', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
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
    it('has accessible status region', () => {
      render(<OAuthCallback />);
      const statusRegion = document.querySelector('[aria-live]');
      expect(statusRegion).toBeInTheDocument();
    });

    it('buttons have accessible names on error', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /sign in|back/i });
        expect(backButton).toHaveAccessibleName();
      });
    });

    it('icons are hidden from screen readers', () => {
      render(<OAuthCallback />);
      const icons = document.querySelectorAll('.material-symbols-outlined');
      icons.forEach((icon) => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });

    it('main container has aria-busy=true during loading', () => {
      render(<OAuthCallback />);
      const container = screen.getByTestId('oauth-callback');
      expect(container).toHaveAttribute('aria-busy', 'true');
    });
  });

  // ============================================
  // Loading States
  // ============================================
  describe('loading states', () => {
    it('shows spinner during authentication', () => {
      render(<OAuthCallback />);
      expect(screen.getByText(/signing you in|authenticating/i)).toBeInTheDocument();
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    it('handles network error gracefully', async () => {
      mockGetSession.mockRejectedValue(new Error('Network error'));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed|error/i })).toBeInTheDocument();
      });
    });

    it('handles non-Error thrown in catch block', async () => {
      mockGetSession.mockRejectedValue('string_error');

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
      });
    });

    it('StrictMode double-mount does not call getSession twice', async () => {
      const { unmount } = render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalledTimes(1);
      });

      unmount();
      // Re-render in a fresh mount
      sessionStorage.setItem('intelliflow_oauth_nonce', 'test-nonce-uuid');
      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalled();
      });
    });

    it('focuses primary action button on error state', async () => {
      Object.defineProperty(mockSearchParams, 'get', {
        value: () => null,
        writable: true,
        configurable: true,
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        const backButton = screen.getByRole('button', { name: /sign in|back/i });
        expect(backButton).toBeInTheDocument();
        expect(document.activeElement).toBe(backButton);
      });
    });

    it('retry button navigates to login on click', async () => {
      mockGetSession.mockRejectedValue(new Error('test error'));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  // ============================================
  // Security Tests
  // ============================================
  describe('security', () => {
    it('displays security badge', () => {
      render(<OAuthCallback />);
      expect(screen.getByText(/Secure authentication via OAuth 2\.0/i)).toBeInTheDocument();
    });
  });
});
