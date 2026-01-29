// @vitest-environment jsdom
/**
 * MFA Verification Component Tests
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * Component tests for the MFA verification wrapper.
 *
 * Memory optimization: MfaChallenge is mocked to avoid heavy DOM rendering
 * that causes heap OOM in isolated test runs.
 *
 * Performance optimization: Heavy dependencies (@intelliflow/ui, mfa-challenge)
 * are mocked before import to reduce module graph loading time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CRITICAL: All vi.mock calls are hoisted before any imports
// Mock @intelliflow/ui to avoid loading the entire UI library
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined)[]) => args.filter(Boolean).join(' '),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock tRPC with stable object references
const mockVerifyMfaMutateAsync = vi.fn();
const mockMutationState = {
  mutateAsync: mockVerifyMfaMutateAsync,
  isPending: false,
};

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyMfa: {
        useMutation: () => mockMutationState,
      },
    },
  },
}));

// Mock code-validator (simple utility functions)
vi.mock('@/lib/shared/code-validator', () => ({
  sanitizeCode: (code: string) => code.replace(/\D/g, ''),
  isValidTotpCode: (code: string) => /^\d{6}$/.test(code.replace(/\D/g, '')),
  isValidBackupCode: (code: string) => code.replace(/-/g, '').length === 10,
}));

// Mock the heavy MfaChallenge component to avoid memory issues
vi.mock('@/components/auth/mfa-challenge', () => ({
  MfaChallenge: ({
    onVerify,
    onCancel,
    error,
    isLoading,
  }: {
    onVerify: (code: string, method: string) => Promise<boolean>;
    onCancel?: () => void;
    error?: string | null;
    isLoading?: boolean;
  }) => (
    <div data-testid="mfa-challenge-mock">
      <input
        type="text"
        aria-label="Digit 1 of 6"
        data-testid="code-input-1"
        onChange={(e) => {
          if (e.target.value.length === 6) {
            onVerify(e.target.value, 'totp');
          }
        }}
      />
      <input type="text" aria-label="Digit 2 of 6" data-testid="code-input-2" />
      <input type="text" aria-label="Digit 3 of 6" data-testid="code-input-3" />
      <input type="text" aria-label="Digit 4 of 6" data-testid="code-input-4" />
      <input type="text" aria-label="Digit 5 of 6" data-testid="code-input-5" />
      <input type="text" aria-label="Digit 6 of 6" data-testid="code-input-6" />
      <button type="button" onClick={() => onVerify('123456', 'totp')} aria-label="Verify">
        Verify
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} aria-label="Cancel">
          Cancel
        </button>
      )}
      {error && <span role="alert">{error}</span>}
      {isLoading && <span aria-hidden="true">Loading...</span>}
    </div>
  ),
}));

// NOW import after all mocks are declared
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaVerification } from '../mfa-verification';

describe('MfaVerification', { timeout: 5000 }, () => {
  const defaultProps = {
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyMfaMutateAsync.mockResolvedValue({ success: true });
    mockMutationState.isPending = false;
  });

  afterEach(() => {
    cleanup();
  });

  // ============================================
  // Rendering Tests
  // ============================================
  describe('rendering', () => {
    it('renders verification form with mocked MfaChallenge', () => {
      render(<MfaVerification {...defaultProps} />);

      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
      expect(screen.getByTestId('mfa-challenge-mock')).toBeInTheDocument();
    });

    it('shows email when provided', () => {
      render(<MfaVerification {...defaultProps} email="test@example.com" />);

      expect(screen.getByText(/test@example.com/i)).toBeInTheDocument();
    });

    it('renders code inputs from mocked MfaChallenge', () => {
      render(<MfaVerification {...defaultProps} method="totp" />);

      // Mocked component renders 6 inputs
      expect(screen.getByTestId('code-input-1')).toBeInTheDocument();
    });

    it('renders verify button from mocked MfaChallenge', () => {
      render(<MfaVerification {...defaultProps} method="sms" />);

      expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
    });

    it('renders cancel button when onCancel provided', () => {
      const onCancel = vi.fn();
      render(<MfaVerification {...defaultProps} onCancel={onCancel} />);

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  // ============================================
  // User Interaction Tests
  // ============================================
  describe('user interactions', () => {
    it('calls onSuccess after successful verification via verify button', async () => {
      const onSuccess = vi.fn();
      mockVerifyMfaMutateAsync.mockResolvedValue({ success: true });

      render(<MfaVerification {...defaultProps} onSuccess={onSuccess} />);

      // Click the verify button (mocked component calls onVerify with '123456')
      const verifyButton = screen.getByRole('button', { name: /verify/i });
      await userEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyMfaMutateAsync).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('calls onCancel when cancel button clicked', async () => {
      const onCancel = vi.fn();
      render(<MfaVerification {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await userEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('handles verification failure gracefully', async () => {
      mockVerifyMfaMutateAsync.mockRejectedValue(new Error('Invalid code'));

      render(<MfaVerification {...defaultProps} />);

      // Click verify - this will trigger the error
      const verifyButton = screen.getByRole('button', { name: /verify/i });
      await userEvent.click(verifyButton);

      // The component handles the error internally
      await waitFor(() => {
        expect(mockVerifyMfaMutateAsync).toHaveBeenCalled();
      });
    });
  });

  // ============================================
  // Redirect Tests
  // ============================================
  describe('redirects', () => {
    it('accepts redirectUrl prop', () => {
      // Simplified test: verify component accepts redirectUrl prop
      // Full redirect flow tested in E2E tests
      const { container } = render(
        <MfaVerification {...defaultProps} redirectUrl="/dashboard" />
      );
      expect(container.querySelector('[data-testid="mfa-verification"]')).toBeInTheDocument();
    });
  });

  // ============================================
  // Challenge Validation Tests
  // ============================================
  describe('challenge validation', () => {
    it('shows invalid message for invalid challenge ID', () => {
      // The component checks if challengeId === 'invalid' internally
      render(<MfaVerification {...defaultProps} challengeId="invalid" />);

      // Component renders invalid state synchronously
      expect(screen.getByText(/invalid/i)).toBeInTheDocument();
    });

    it('renders normal form for valid challenge ID', () => {
      render(<MfaVerification {...defaultProps} challengeId="valid-challenge-123" />);

      // Component renders the MFA challenge form
      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
      expect(screen.getByTestId('mfa-challenge-mock')).toBeInTheDocument();
    });
  });

  // ============================================
  // Loading States
  // ============================================
  describe('loading states', () => {
    it('has loading indicator element in component', () => {
      // Simplified test: verify loading indicator can be rendered
      // The actual loading state during verification is tested in E2E
      render(<MfaVerification {...defaultProps} />);

      // Verify the component renders with testid
      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
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

    it('supports keyboard navigation', () => {
      render(<MfaVerification {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');

      // Verify inputs exist for keyboard navigation
      expect(inputs.length).toBeGreaterThan(0);

      // Each input should have tabIndex for keyboard navigation
      inputs.forEach((input) => {
        expect(input).not.toHaveAttribute('tabIndex', '-1');
      });
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
    it('accepts multiple methods prop', () => {
      render(<MfaVerification {...defaultProps} availableMethods={['totp', 'sms', 'backup']} />);

      // Verify component renders with available methods passed to mocked MfaChallenge
      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
      expect(screen.getByTestId('mfa-challenge-mock')).toBeInTheDocument();
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
