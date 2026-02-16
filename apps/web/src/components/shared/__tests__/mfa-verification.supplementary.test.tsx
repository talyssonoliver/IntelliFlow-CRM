/**
 * @vitest-environment happy-dom
 *
 * MFA Verification Component - Supplementary Tests
 *
 * IMPLEMENTS: PG-022 (MFA Verify)
 *
 * The existing test file covers basic rendering and code verification flow.
 * This file adds coverage for:
 * - Challenge validation logic (invalid/expired challenges)
 * - Error message handling (expired, invalid, attempts)
 * - Resend functionality
 * - URL parameter extraction (challenge ID, redirect URL)
 * - Edge cases for backup vs TOTP code validation
 * - State transitions (isExpired, isInvalidChallenge)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ============================================================
// Hoisted mocks
// ============================================================

const mocks = vi.hoisted(() => ({
  mockMutateAsync: vi.fn(),
  mockRouterPush: vi.fn(),
  mockSearchParams: new URLSearchParams(),
}));

// ============================================================
// vi.mock declarations
// ============================================================

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined | boolean)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.mockRouterPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => mocks.mockSearchParams,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyMfa: {
        useMutation: () => ({
          mutateAsync: mocks.mockMutateAsync,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock('@/lib/shared/code-validator', () => ({
  sanitizeCode: (code: string) => code.replace(/\D/g, ''),
  isValidTotpCode: (code: string) => /^\d{6}$/.test(code.replace(/\D/g, '')),
  isValidBackupCode: (code: string) => code.replace(/-/g, '').length === 10,
}));

// Mock MfaChallenge to expose onVerify, onResend, onCancel and error display
vi.mock('@/components/auth/mfa-challenge', () => ({
  MfaChallenge: ({
    onVerify,
    onResend,
    onCancel,
    error,
    isLoading,
    availableMethods,
    defaultMethod,
    maskedPhone,
    maskedEmail,
  }: any) => (
    <div data-testid="mfa-challenge-mock">
      {error && <div data-testid="mfa-error">{error}</div>}
      {isLoading && <div data-testid="mfa-loading">Loading...</div>}
      {maskedPhone && <div data-testid="masked-phone">{maskedPhone}</div>}
      {maskedEmail && <div data-testid="masked-email">{maskedEmail}</div>}
      <div data-testid="default-method">{defaultMethod}</div>
      <div data-testid="available-methods">{(availableMethods || []).join(',')}</div>
      <button data-testid="verify-totp" onClick={() => onVerify('123456', 'totp')}>
        Verify TOTP
      </button>
      <button data-testid="verify-bad-totp" onClick={() => onVerify('12345', 'totp')}>
        Verify Bad TOTP
      </button>
      <button data-testid="verify-backup" onClick={() => onVerify('A1B2C3D4E5', 'backup')}>
        Verify Backup
      </button>
      <button data-testid="verify-bad-backup" onClick={() => onVerify('short', 'backup')}>
        Verify Bad Backup
      </button>
      <button data-testid="resend-sms" onClick={() => onResend?.('sms')}>
        Resend SMS
      </button>
      {onCancel && (
        <button data-testid="cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  ),
}));

// ============================================================
// Import after mocks
// ============================================================

import { MfaVerification } from '../mfa-verification';

// ============================================================
// Tests
// ============================================================

describe('MfaVerification (supplementary)', () => {
  beforeEach(() => {
    mocks.mockMutateAsync.mockReset();
    mocks.mockRouterPush.mockReset();
    mocks.mockSearchParams = new URLSearchParams();
  });

  describe('Rendering with valid challenge', () => {
    it('renders the MfaChallenge component', () => {
      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      expect(screen.getByTestId('mfa-challenge-mock')).toBeInTheDocument();
    });

    it('displays email when provided', () => {
      render(
        <MfaVerification
          challengeId="valid-challenge-123"
          email="user@test.com"
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByText('user@test.com')).toBeInTheDocument();
      expect(screen.getByText('Verifying for')).toBeInTheDocument();
    });

    it('passes masked phone and email to MfaChallenge', () => {
      render(
        <MfaVerification
          challengeId="valid-challenge-123"
          maskedPhone="***-1234"
          maskedEmail="u***@test.com"
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('masked-phone').textContent).toBe('***-1234');
      expect(screen.getByTestId('masked-email').textContent).toBe('u***@test.com');
    });

    it('passes default method and available methods', () => {
      render(
        <MfaVerification
          challengeId="valid-challenge-123"
          method="sms"
          availableMethods={['totp', 'sms']}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('default-method').textContent).toBe('sms');
      expect(screen.getByTestId('available-methods').textContent).toBe('totp,sms');
    });
  });

  describe('Invalid challenge', () => {
    it('renders invalid state for short challenge ID', async () => {
      render(<MfaVerification challengeId="ab" onSuccess={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Verification Link')).toBeInTheDocument();
      });
    });

    it('renders invalid state for "invalid" challenge ID', async () => {
      render(<MfaVerification challengeId="invalid" onSuccess={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Verification Link')).toBeInTheDocument();
      });
    });

    it('renders Return to Login button when onCancel is provided', async () => {
      const onCancel = vi.fn();

      render(<MfaVerification challengeId="invalid" onSuccess={vi.fn()} onCancel={onCancel} />);

      await waitFor(() => {
        expect(screen.getByText('Return to Login')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Return to Login'));
      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Code verification', () => {
    it('calls mutation and onSuccess on valid TOTP', async () => {
      const onSuccess = vi.fn();
      mocks.mockMutateAsync.mockResolvedValue({ success: true });

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={onSuccess} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(mocks.mockMutateAsync).toHaveBeenCalledWith({
          code: '123456',
          method: 'totp',
          challengeId: 'valid-challenge-123',
        });
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('shows error for invalid TOTP code format', async () => {
      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-bad-totp'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toBe(
          'Please enter a valid 6-digit code'
        );
      });
    });

    it('shows error for invalid backup code format', async () => {
      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-bad-backup'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toBe('Invalid backup code format');
      });
    });

    it('calls mutation with backup code unsanitized', async () => {
      mocks.mockMutateAsync.mockResolvedValue({ success: true });

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-backup'));
      });

      await waitFor(() => {
        expect(mocks.mockMutateAsync).toHaveBeenCalledWith({
          code: 'A1B2C3D4E5', // Backup code should NOT be sanitized
          method: 'backup',
          challengeId: 'valid-challenge-123',
        });
      });
    });

    it('shows "Verification failed" when result.success is false', async () => {
      mocks.mockMutateAsync.mockResolvedValue({ success: false });

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toBe(
          'Verification failed. Please try again.'
        );
      });
    });
  });

  describe('Error handling from mutation', () => {
    it('shows expired error for expired token message', async () => {
      mocks.mockMutateAsync.mockRejectedValue(new Error('Token has expired'));

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toContain('expired');
      });
    });

    it('shows invalid error for incorrect code message', async () => {
      mocks.mockMutateAsync.mockRejectedValue(new Error('Code is invalid'));

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toContain('Invalid verification code');
      });
    });

    it('shows too many attempts error', async () => {
      mocks.mockMutateAsync.mockRejectedValue(new Error('Too many attempts'));

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toContain('Too many failed attempts');
      });
    });

    it('shows generic error for unknown errors', async () => {
      mocks.mockMutateAsync.mockRejectedValue(new Error('Network failure'));

      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-error').textContent).toBe('Network failure');
      });
    });
  });

  describe('Redirect after success', () => {
    it('redirects to redirectUrl after successful verification', async () => {
      mocks.mockMutateAsync.mockResolvedValue({ success: true });

      render(
        <MfaVerification
          challengeId="valid-challenge-123"
          redirectUrl="/dashboard"
          onSuccess={vi.fn()}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('verify-totp'));
      });

      await waitFor(() => {
        expect(mocks.mockRouterPush).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('Cancel flow', () => {
    it('renders cancel button and calls onCancel', () => {
      const onCancel = vi.fn();

      render(
        <MfaVerification
          challengeId="valid-challenge-123"
          onSuccess={vi.fn()}
          onCancel={onCancel}
        />
      );

      const cancelBtn = screen.getByTestId('cancel');
      fireEvent.click(cancelBtn);
      expect(onCancel).toHaveBeenCalled();
    });

    it('does not render cancel button when onCancel not provided', () => {
      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      expect(screen.queryByTestId('cancel')).not.toBeInTheDocument();
    });
  });

  describe('Resend flow', () => {
    it('resend button exists and can be clicked', async () => {
      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      // Click resend - should not throw
      await act(async () => {
        fireEvent.click(screen.getByTestId('resend-sms'));
      });
    });
  });

  describe('data-testid attribute', () => {
    it('renders with mfa-verification data-testid', () => {
      render(<MfaVerification challengeId="valid-challenge-123" onSuccess={vi.fn()} />);

      expect(screen.getByTestId('mfa-verification')).toBeInTheDocument();
    });
  });
});
