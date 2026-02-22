/**
 * @vitest-environment happy-dom
 *
 * Email Verification Component Tests
 *
 * IMPLEMENTS: PG-023 (Email Verification) — updated for IFC-120 tRPC wiring
 *
 * Component tests for the Email Verification component.
 * Tests rendering, states, and user interactions via tRPC mutations.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions to ensure they're available before vi.mock runs
const { mockVerifyMutateAsync, mockResendMutateAsync } = vi.hoisted(() => ({
  mockVerifyMutateAsync: vi.fn(),
  mockResendMutateAsync: vi.fn(),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock tRPC
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyEmail: {
        useMutation: () => ({
          mutateAsync: (...args: any[]) => mockVerifyMutateAsync(...args),
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
      resendVerification: {
        useMutation: () => ({
          mutateAsync: (...args: any[]) => mockResendMutateAsync(...args),
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
    },
  },
}));

// Import component after mocks are set up
import { EmailVerification } from '../email-verification';

describe('EmailVerification', () => {
  const defaultProps = {
    tokenHash: 'abc123hash',
    type: 'email' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyMutateAsync.mockResolvedValue({
      success: true,
      email: 'user@example.com',
    });
    mockResendMutateAsync.mockResolvedValue({ success: true });
  });

  // ============================================
  // Rendering Tests
  // ============================================
  describe('rendering', () => {
    it('renders verification container', () => {
      render(<EmailVerification {...defaultProps} />);

      expect(
        screen.getByRole('main') || screen.getByTestId('email-verification')
      ).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <EmailVerification {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  // ============================================
  // Success State Tests
  // ============================================
  describe('success state', () => {
    it('shows success message after verification', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /verified/i })).toBeInTheDocument();
      });
    });

    it('calls tRPC verifyEmail with token_hash and type', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        expect(mockVerifyMutateAsync).toHaveBeenCalledWith({
          token_hash: 'abc123hash',
          type: 'email',
        });
      });
    });

    it('displays verified email address', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/user@example.com/i)).toBeInTheDocument();
      });
    });

    it('shows continue button after success', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole('link', { name: /continue|dashboard|login/i })
        ).toBeInTheDocument();
      });
    });

    it('calls onVerified callback on success', async () => {
      const onVerified = vi.fn();
      render(<EmailVerification {...defaultProps} onVerified={onVerified} />);

      await waitFor(() => {
        expect(onVerified).toHaveBeenCalled();
      });
    });
  });

  // ============================================
  // Error State Tests
  // ============================================
  describe('error states', () => {
    it('shows expired message for BAD_REQUEST error', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Token expired',
      });

      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /expired/i })).toBeInTheDocument();
      });
    });

    it('shows error message for other errors', async () => {
      mockVerifyMutateAsync.mockRejectedValue(new Error('Network error'));

      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /failed/i })).toBeInTheDocument();
      });
    });

    it('shows invalid message for invalid token (short hash)', async () => {
      render(<EmailVerification tokenHash="abc" />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /invalid/i })).toBeInTheDocument();
      });
    });

    it('calls onError callback on error', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Token expired',
      });

      const onError = vi.fn();
      render(<EmailVerification {...defaultProps} onError={onError} />);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Token expired');
      });
    });
  });

  // ============================================
  // Resend Functionality Tests
  // ============================================
  describe('resend functionality', () => {
    it('shows resend button for expired tokens', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Expired',
      });

      render(<EmailVerification {...defaultProps} email="user@example.com" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();
      });
    });

    it('sends resend request via tRPC when button clicked', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Expired',
      });

      render(<EmailVerification {...defaultProps} email="user@example.com" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /resend/i }));

      await waitFor(() => {
        expect(mockResendMutateAsync).toHaveBeenCalledWith({ email: 'user@example.com' });
      });
    });

    it('shows success message after resend', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Expired',
      });

      render(<EmailVerification {...defaultProps} email="user@example.com" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /resend/i }));

      await waitFor(() => {
        expect(screen.getByText(/new verification link has been sent/i)).toBeInTheDocument();
      });
    });

    it('shows rate limit message when limited', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Expired',
      });

      mockResendMutateAsync.mockRejectedValue({
        data: { code: 'TOO_MANY_REQUESTS' },
        message: 'Too many requests',
      });

      render(<EmailVerification {...defaultProps} email="user@example.com" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /resend/i }));

      await waitFor(() => {
        expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Navigation Tests
  // ============================================
  describe('navigation', () => {
    it('provides link to signup for invalid token', async () => {
      render(<EmailVerification tokenHash="" />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /sign up|signup/i })).toBeInTheDocument();
      });
    });

    it('redirects to custom URL on success when provided', async () => {
      render(<EmailVerification {...defaultProps} redirectUrl="/onboarding" />);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
          'href',
          '/onboarding'
        );
      });
    });
  });

  // ============================================
  // Accessibility Tests
  // ============================================
  describe('accessibility', () => {
    it('has accessible status region', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        const statusRegion = screen.getByRole('status') || document.querySelector('[aria-live]');
        expect(statusRegion).toBeInTheDocument();
      });
    });

    it('buttons have accessible names', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Expired',
      });

      render(<EmailVerification {...defaultProps} email="user@example.com" />);

      await waitFor(() => {
        const resendButton = screen.getByRole('button', { name: /resend/i });
        expect(resendButton).toHaveAccessibleName();
      });
    });

    it('icons are hidden from screen readers', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        const icons = document.querySelectorAll('.material-symbols-outlined');
        icons.forEach((icon) => {
          expect(icon).toHaveAttribute('aria-hidden', 'true');
        });
      });
    });

    it('links have accessible names', async () => {
      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        const links = screen.getAllByRole('link');
        links.forEach((link) => {
          expect(link).toHaveAccessibleName();
        });
      });
    });
  });

  // ============================================
  // Edge Cases
  // ============================================
  describe('edge cases', () => {
    it('handles missing token gracefully', async () => {
      render(<EmailVerification token="" />);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /invalid/i })).toBeInTheDocument();
      });
    });

    it('handles null email for resend', async () => {
      mockVerifyMutateAsync.mockRejectedValue({
        data: { code: 'BAD_REQUEST' },
        message: 'Expired',
      });

      render(<EmailVerification {...defaultProps} />);

      await waitFor(() => {
        // Should not show resend button if no email provided
        const resendButton = screen.queryByRole('button', { name: /resend/i });
        // Either hidden or disabled without email
        if (resendButton) {
          expect(resendButton).toBeDisabled();
        }
      });
    });

    it('uses legacy token prop as fallback when tokenHash not provided', async () => {
      render(<EmailVerification token="legacy-token-value-12345" />);

      await waitFor(() => {
        expect(mockVerifyMutateAsync).toHaveBeenCalledWith({
          token_hash: 'legacy-token-value-12345',
          type: 'email',
        });
      });
    });
  });
});
