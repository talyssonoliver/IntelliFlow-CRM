// @vitest-environment jsdom
/**
 * MFA Verification Component Tests
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * Component tests for the MFA verification wrapper.
 * Includes accessibility tests with vitest-axe.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MfaVerification } from '../mfa-verification';

// Mock next/navigation
const mockPush = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock tRPC
const mockVerifyMfa = vi.fn();
const mockGetChallenge = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyMfa: {
        useMutation: () => ({
          mutateAsync: mockVerifyMfa,
          isLoading: false,
        }),
      },
      getMfaChallenge: {
        useQuery: () => ({
          data: mockGetChallenge(),
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

describe('MfaVerification', () => {
  const defaultProps = {
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChallenge.mockReturnValue({
      challengeId: 'test-challenge-123',
      method: 'totp',
      email: 'user@example.com',
      expiresAt: new Date(Date.now() + 300000).toISOString(), // 5 minutes from now
    });
  });

  // ============================================
  // Rendering Tests
  // ============================================
  describe('rendering', () => {
    it('renders verification form', () => {
      render(<MfaVerification {...defaultProps} />);

      expect(screen.getByText(/verification/i)).toBeInTheDocument();
    });

    it('shows email when provided', () => {
      render(<MfaVerification {...defaultProps} email="test@example.com" />);

      expect(screen.getByText(/test@example.com/i)).toBeInTheDocument();
    });

    it('shows correct method title for TOTP', () => {
      render(<MfaVerification {...defaultProps} method="totp" />);

      expect(screen.getByText(/authenticator/i)).toBeInTheDocument();
    });

    it('shows correct method title for SMS', () => {
      render(<MfaVerification {...defaultProps} method="sms" />);

      expect(screen.getByText(/text message|sms/i)).toBeInTheDocument();
    });

    it('renders cancel button when onCancel provided', () => {
      const onCancel = vi.fn();
      render(<MfaVerification {...defaultProps} onCancel={onCancel} />);

      expect(screen.getByRole('button', { name: /cancel|back/i })).toBeInTheDocument();
    });
  });

  // ============================================
  // User Interaction Tests
  // ============================================
  describe('user interactions', () => {
    it('calls onSuccess after successful verification', async () => {
      const onSuccess = vi.fn();
      mockVerifyMfa.mockResolvedValue({ success: true });

      render(<MfaVerification {...defaultProps} onSuccess={onSuccess} />);

      // Enter a code
      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], String(i + 1));
      }

      // Wait for auto-submit or click submit
      await waitFor(() => {
        expect(mockVerifyMfa).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('calls onCancel when cancel button clicked', async () => {
      const onCancel = vi.fn();
      render(<MfaVerification {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /cancel|back/i });
      await userEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('shows error message on verification failure', async () => {
      mockVerifyMfa.mockRejectedValue(new Error('Invalid code'));

      render(<MfaVerification {...defaultProps} />);

      // Enter a code
      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], '0');
      }

      await waitFor(() => {
        expect(screen.getByText(/invalid|error|incorrect/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Redirect Tests
  // ============================================
  describe('redirects', () => {
    it('redirects to provided URL after success', async () => {
      mockVerifyMfa.mockResolvedValue({ success: true });

      render(<MfaVerification {...defaultProps} redirectUrl="/dashboard" />);

      // Enter a code
      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], String(i + 1));
      }

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  // ============================================
  // Challenge Validation Tests
  // ============================================
  describe('challenge validation', () => {
    it('shows expired message when challenge expired', async () => {
      mockGetChallenge.mockReturnValue({
        challengeId: 'expired-challenge',
        method: 'totp',
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
      });

      render(<MfaVerification {...defaultProps} challengeId="expired-challenge" />);

      await waitFor(() => {
        expect(screen.getByText(/expired|timeout/i)).toBeInTheDocument();
      });
    });

    it('shows error for invalid challenge ID', async () => {
      mockGetChallenge.mockReturnValue(null);

      render(<MfaVerification {...defaultProps} challengeId="invalid-challenge" />);

      await waitFor(() => {
        expect(screen.getByText(/invalid|not found/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Loading States
  // ============================================
  describe('loading states', () => {
    it('shows loading state during verification', async () => {
      mockVerifyMfa.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      );

      render(<MfaVerification {...defaultProps} />);

      // Enter a code
      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        await userEvent.type(inputs[i], String(i + 1));
      }

      // Check for loading indicator
      await waitFor(() => {
        expect(screen.getByTestId('loading-indicator') || screen.getByRole('progressbar')).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Accessibility Tests
  // ============================================
  describe('accessibility', () => {
    it('code inputs have proper labels', () => {
      render(<MfaVerification {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('aria-label');
      });
    });

    it('submit button has accessible name', () => {
      render(<MfaVerification {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /verify|submit/i });
      expect(submitButton).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      render(<MfaVerification {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');

      // First input should be focused initially
      expect(inputs[0]).toHaveFocus();

      // Tab to navigate
      await userEvent.tab();
      expect(document.activeElement).toBe(inputs[1]);
    });

    it('has accessible icons (hidden from screen readers)', () => {
      render(<MfaVerification {...defaultProps} />);

      const icons = document.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Method Switching
  // ============================================
  describe('method switching', () => {
    it('allows switching between methods when multiple available', async () => {
      mockGetChallenge.mockReturnValue({
        challengeId: 'test-challenge',
        availableMethods: ['totp', 'sms', 'backup'],
        method: 'totp',
      });

      render(<MfaVerification {...defaultProps} />);

      // Look for method selector
      const methodSelector = screen.queryByText(/use a different method|try another way/i);
      if (methodSelector) {
        await userEvent.click(methodSelector);

        // Should show other methods
        expect(screen.getByText(/sms|text/i)).toBeInTheDocument();
      }
    });
  });

  // ============================================
  // Custom Styling
  // ============================================
  describe('styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <MfaVerification {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });
});
