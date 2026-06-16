// @vitest-environment jsdom

/**
 * Tests for VerifyEmailBanner
 *
 * Covers:
 * - Renders when authed + unverified
 * - Hidden when emailVerified=true
 * - Hidden when not authenticated
 * - Hidden on public/auth routes (non-protected)
 * - "Resend email" calls the mutation and transitions to sent state
 * - TOO_MANY_REQUESTS error shows rate-limit copy
 * - Dismiss writes sessionStorage and hides the banner
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock variables — required by vitest for factory closures
// ---------------------------------------------------------------------------
const { mockUseAuth, mockUsePathname, mockResendMutateAsync } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUsePathname: vi.fn(),
  mockResendMutateAsync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      resendVerification: {
        useMutation: () => ({
          mutateAsync: (...args: unknown[]) => mockResendMutateAsync(...args),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
const { VerifyEmailBanner } = await import('../VerifyEmailBanner');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authedUnverified() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    emailVerified: false,
    user: { email: 'test@example.com' },
  });
}
function authedVerified() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    emailVerified: true,
    user: { email: 'test@example.com' },
  });
}
function notAuthenticated() {
  mockUseAuth.mockReturnValue({ isAuthenticated: false, emailVerified: null });
}
function onProtectedRoute() {
  mockUsePathname.mockReturnValue('/dashboard');
}
function onPublicRoute() {
  mockUsePathname.mockReturnValue('/login');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('VerifyEmailBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: protected route, unverified user
    onProtectedRoute();
    authedUnverified();
    // Clear sessionStorage between tests
    sessionStorage.clear();
    // Default resend resolves successfully
    mockResendMutateAsync.mockResolvedValue({ success: true });
  });

  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------
  describe('visibility', () => {
    it('renders the banner when authenticated and email is unverified', () => {
      render(<VerifyEmailBanner />);
      expect(screen.getByTestId('verify-email-banner')).toBeInTheDocument();
    });

    it('renders the headline copy', () => {
      render(<VerifyEmailBanner />);
      expect(
        screen.getByText(/verify your email to unlock sending, invites and billing/i)
      ).toBeInTheDocument();
    });

    it('does NOT render when email is verified', () => {
      authedVerified();
      render(<VerifyEmailBanner />);
      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });

    it('does NOT render when user is not authenticated', () => {
      notAuthenticated();
      render(<VerifyEmailBanner />);
      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });

    it('does NOT render when emailVerified is null (unknown / types lagging)', () => {
      mockUseAuth.mockReturnValue({ isAuthenticated: true, emailVerified: null });
      render(<VerifyEmailBanner />);
      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });

    it('does NOT render on a public route (e.g. /login)', () => {
      onPublicRoute();
      render(<VerifyEmailBanner />);
      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });

    it('does NOT render on /signup', () => {
      mockUsePathname.mockReturnValue('/signup');
      render(<VerifyEmailBanner />);
      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Resend email
  // -------------------------------------------------------------------------
  describe('Resend email button', () => {
    it('shows "Resend email" button initially', () => {
      render(<VerifyEmailBanner />);
      expect(
        screen.getByRole('button', { name: /resend verification email/i })
      ).toBeInTheDocument();
    });

    it('calls resendVerification mutation when clicked', async () => {
      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /resend verification email/i }));

      await waitFor(() => {
        expect(mockResendMutateAsync).toHaveBeenCalledTimes(1);
      });
    });

    it('shows sent confirmation after successful resend', async () => {
      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /resend verification email/i }));

      await waitFor(() => {
        expect(screen.getByText(/verification email sent/i)).toBeInTheDocument();
      });
    });

    it('sent confirmation is in an <output> element', async () => {
      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /resend verification email/i }));

      await waitFor(() => {
        const output = document.querySelector('output');
        expect(output).toBeInTheDocument();
        expect(output).toHaveTextContent(/verification email sent/i);
      });
    });

    it('shows rate-limit message on TOO_MANY_REQUESTS error', async () => {
      mockResendMutateAsync.mockRejectedValue({ data: { code: 'TOO_MANY_REQUESTS' } });

      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /resend verification email/i }));

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
    });

    it('resets to idle on a generic error (allowing retry)', async () => {
      mockResendMutateAsync.mockRejectedValue(new Error('Network error'));

      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /resend verification email/i }));

      await waitFor(() => {
        // Button should reappear for retry
        expect(
          screen.getByRole('button', { name: /resend verification email/i })
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Dismiss
  // -------------------------------------------------------------------------
  describe('dismiss', () => {
    it('has a dismiss button with an accessible aria-label', () => {
      render(<VerifyEmailBanner />);
      expect(
        screen.getByRole('button', { name: /dismiss email verification banner/i })
      ).toBeInTheDocument();
    });

    it('hides the banner after clicking dismiss', async () => {
      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /dismiss email verification banner/i }));

      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });

    it('writes the dismissed flag to sessionStorage', async () => {
      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      await user.click(screen.getByRole('button', { name: /dismiss email verification banner/i }));

      expect(sessionStorage.getItem('intelliflow_verify_banner_dismissed')).toBe('1');
    });

    it('does NOT render when sessionStorage flag is already set', () => {
      sessionStorage.setItem('intelliflow_verify_banner_dismissed', '1');
      render(<VerifyEmailBanner />);
      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------
  describe('accessibility', () => {
    it('banner region has an accessible label', () => {
      render(<VerifyEmailBanner />);
      expect(
        screen.getByRole('region', { name: /email verification required/i })
      ).toBeInTheDocument();
    });

    it('icons are hidden from screen readers', () => {
      render(<VerifyEmailBanner />);
      const icons = document.querySelectorAll('.material-symbols-outlined');
      icons.forEach((icon) => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });

    it('dismiss button is keyboard-operable (Enter key)', async () => {
      const user = userEvent.setup();
      render(<VerifyEmailBanner />);

      const dismissBtn = screen.getByRole('button', { name: /dismiss email verification banner/i });
      dismissBtn.focus();
      await user.keyboard('{Enter}');

      expect(screen.queryByTestId('verify-email-banner')).not.toBeInTheDocument();
    });
  });
});
