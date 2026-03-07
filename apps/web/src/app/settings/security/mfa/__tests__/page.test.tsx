/**
 * @vitest-environment jsdom
 *
 * PG-021: MFA Setup Page — Page-level integration tests
 * Tests the 5-step wizard: method → setup → verify → backup → complete
 */
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Hoisted mocks (must be before vi.mock calls)
// ============================================

const { mockSetupMfa, mockConfirmMfa, mockGetBackupCodes, mockPush, mutationState } = vi.hoisted(
  () => ({
    mockSetupMfa: vi.fn(),
    mockConfirmMfa: vi.fn(),
    mockGetBackupCodes: vi.fn(),
    mockPush: vi.fn(),
    mutationState: {
      setupPending: false,
      confirmPending: false,
      backupPending: false,
    },
  })
);

// ============================================
// Module mocks
// ============================================

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn() }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      setupMfa: {
        useMutation: () => ({
          mutateAsync: mockSetupMfa,
          isPending: mutationState.setupPending,
          mutate: vi.fn(),
          isError: false,
          error: null,
        }),
      },
      confirmMfa: {
        useMutation: () => ({
          mutateAsync: mockConfirmMfa,
          isPending: mutationState.confirmPending,
          mutate: vi.fn(),
          isError: false,
          error: null,
        }),
      },
      getBackupCodes: {
        useMutation: () => ({
          mutateAsync: mockGetBackupCodes,
          isPending: mutationState.backupPending,
          mutate: vi.fn(),
          isError: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    isAuthenticated: true,
    isLoading: false,
  }),
  useRequireAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
    isAuthenticated: true,
  }),
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    breadcrumbs,
  }: Readonly<{
    title: string;
    breadcrumbs?: Array<{ label: string; href?: string }>;
  }>) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <nav aria-label="Breadcrumb">
        {breadcrumbs?.map((b, i) => (
          <span key={i}>{b.href ? <a href={b.href}>{b.label}</a> : b.label}</span>
        ))}
      </nav>
    </div>
  ),
}));

vi.mock('@/components/shared/mfa-qr-generator', () => ({
  MfaQrGenerator: ({
    otpauthUrl,
    secret,
    accountName,
    onConfirm,
  }: Readonly<{
    otpauthUrl: string;
    secret: string;
    accountName: string;
    onConfirm: () => void;
  }>) => (
    <div data-testid="mfa-qr-generator">
      <span data-testid="qr-url">{otpauthUrl}</span>
      <span data-testid="qr-secret">{secret}</span>
      <span data-testid="qr-account">{accountName}</span>
      <button onClick={onConfirm} data-testid="qr-confirm">
        Confirm QR Setup
      </button>
    </div>
  ),
}));

vi.mock('@/components/shared/backup-codes-display', () => ({
  BackupCodesDisplay: ({
    codes,
    email,
    onAcknowledge,
  }: Readonly<{
    codes: string[];
    email: string;
    onAcknowledge: () => void;
  }>) => (
    <div data-testid="backup-codes-display">
      <span data-testid="backup-codes-count">{codes?.length}</span>
      <span data-testid="backup-email">{email}</span>
      <button onClick={onAcknowledge} data-testid="backup-acknowledge">
        Acknowledge Codes
      </button>
    </div>
  ),
}));

// ============================================
// Import page AFTER all mocks
// ============================================

import MfaSetupPage from '../page';

// ============================================
// Test helpers
// ============================================

const TOTP_RESPONSE = {
  success: true,
  method: 'totp' as const,
  secret: 'JBSWY3DPEHPK3PXP',
  qrCodeUrl: 'otpauth://totp/IntelliFlow:test@example.com?secret=JBSWY3DPEHPK3PXP',
};

const SMS_RESPONSE = {
  success: true,
  method: 'sms' as const,
  codeSentTo: '+15551234567',
};

const EMAIL_RESPONSE = {
  success: true,
  method: 'email' as const,
  codeSentTo: 'test@example.com',
};

const CONFIRM_RESPONSE = { success: true };

const BACKUP_CODES_RESPONSE = {
  codes: [
    'abc12345',
    'def67890',
    'ghi11111',
    'jkl22222',
    'mno33333',
    'pqr44444',
    'stu55555',
    'vwx66666',
    'yza77777',
    'bcd88888',
  ],
  generatedAt: '2026-01-15T10:00:00Z',
};

/** Advance wizard to the setup step with TOTP */
async function advanceToSetup() {
  mockSetupMfa.mockResolvedValue(TOTP_RESPONSE);
  render(<MfaSetupPage />);
  const continueBtn = screen.getByRole('button', { name: /continue with/i });
  fireEvent.click(continueBtn);
  await waitFor(() => expect(screen.getByTestId('mfa-qr-generator')).toBeInTheDocument());
}

/** Advance wizard to the verify step */
async function advanceToVerify() {
  await advanceToSetup();
  fireEvent.click(screen.getByTestId('qr-confirm'));
  await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument());
}

/** Advance wizard to the backup step */
async function advanceToBackup() {
  mockConfirmMfa.mockResolvedValue(CONFIRM_RESPONSE);
  mockGetBackupCodes.mockResolvedValue(BACKUP_CODES_RESPONSE);
  await advanceToVerify();
  const input = screen.getByLabelText(/verification code/i);
  fireEvent.change(input, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
  await waitFor(() => expect(screen.getByTestId('backup-codes-display')).toBeInTheDocument());
}

/** Advance wizard to the complete step */
async function advanceToComplete() {
  await advanceToBackup();
  fireEvent.click(screen.getByTestId('backup-acknowledge'));
  await waitFor(() => expect(screen.getByText(/setup complete/i)).toBeInTheDocument());
}

// ============================================
// Tests
// ============================================

describe('MfaSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationState.setupPending = false;
    mutationState.confirmPending = false;
    mutationState.backupPending = false;
  });

  afterEach(() => {
    cleanup();
  });

  // ------------------------------------------
  // Rendering (5 tests) — AC1, AC2, AC8, AC10
  // ------------------------------------------
  describe('Rendering', () => {
    it('renders method selection step by default', () => {
      // AC1
      render(<MfaSetupPage />);
      expect(screen.getByText(/choose authentication method/i)).toBeInTheDocument();
    });

    it('renders 3 method options: TOTP, SMS, Email', () => {
      // AC2
      render(<MfaSetupPage />);
      expect(screen.getByText('Authenticator App')).toBeInTheDocument();
      expect(screen.getByText('SMS Code')).toBeInTheDocument();
      expect(screen.getByText('Email Code')).toBeInTheDocument();
    });

    it('shows TOTP as recommended', () => {
      // AC2
      render(<MfaSetupPage />);
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });

    it('renders 5-step progress indicator', () => {
      // AC8
      render(<MfaSetupPage />);
      // 5 step circles: numbered 1-5 (step 1 is active, 2-5 show numbers)
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders cancel link to /settings/account', () => {
      // AC10
      render(<MfaSetupPage />);
      const cancelLink = screen.getByText(/cancel and return to settings/i);
      expect(cancelLink).toBeInTheDocument();
      expect(cancelLink.closest('a')).toHaveAttribute('href', '/settings/account');
    });
  });

  // ------------------------------------------
  // Wizard State Machine (12 tests) — AC2-AC5, AC7-AC10
  // ------------------------------------------
  describe('Wizard State Machine', () => {
    it('transitions method → setup after setupMfa succeeds (TOTP)', async () => {
      // AC3
      mockSetupMfa.mockResolvedValue(TOTP_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByTestId('mfa-qr-generator')).toBeInTheDocument();
      });
    });

    it('transitions method → setup after setupMfa succeeds (SMS)', async () => {
      // AC2
      mockSetupMfa.mockResolvedValue(SMS_RESPONSE);
      render(<MfaSetupPage />);
      // Select SMS method
      fireEvent.click(screen.getByText('SMS Code'));
      // Enter phone number (required for SMS)
      const phoneInput = screen.getByPlaceholderText(/\+1/);
      fireEvent.change(phoneInput, { target: { value: '+15551234567' } });
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByText(/enter your phone number/i)).toBeInTheDocument();
      });
    });

    it('transitions method → setup after setupMfa succeeds (Email)', async () => {
      // AC2
      mockSetupMfa.mockResolvedValue(EMAIL_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('Email Code'));
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByText(/send verification codes to your email/i)).toBeInTheDocument();
      });
    });

    it('transitions setup → verify after QR confirm', async () => {
      // AC4
      await advanceToSetup();
      fireEvent.click(screen.getByTestId('qr-confirm'));
      await waitFor(() => {
        expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
      });
    });

    it('transitions verify → backup after confirmMfa succeeds', async () => {
      // AC5
      mockConfirmMfa.mockResolvedValue(CONFIRM_RESPONSE);
      mockGetBackupCodes.mockResolvedValue(BACKUP_CODES_RESPONSE);
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i);
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(screen.getByTestId('backup-codes-display')).toBeInTheDocument();
      });
    });

    it('transitions backup → complete after acknowledgment', async () => {
      // AC7
      await advanceToBackup();
      fireEvent.click(screen.getByTestId('backup-acknowledge'));
      await waitFor(() => {
        expect(screen.getByText(/setup complete/i)).toBeInTheDocument();
      });
    });

    it('navigates to /settings/account on complete', async () => {
      // AC10
      await advanceToComplete();
      fireEvent.click(screen.getByRole('button', { name: /return to account settings/i }));
      expect(mockPush).toHaveBeenCalledWith('/settings/account');
    });

    it('stays on method step if setupMfa fails', async () => {
      // AC9
      mockSetupMfa.mockRejectedValue(new Error('Setup failed'));
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByText(/setup failed/i)).toBeInTheDocument();
      });
      // Still on method step
      expect(screen.getByText(/choose authentication method/i)).toBeInTheDocument();
    });

    it('stays on verify step if confirmMfa fails', async () => {
      // AC9
      mockConfirmMfa.mockRejectedValue(new Error('Invalid code'));
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i);
      fireEvent.change(input, { target: { value: '999999' } });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
      });
      // Still on verify step
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    });

    it('updates progress indicator on each step', async () => {
      // AC8
      mockSetupMfa.mockResolvedValue(TOTP_RESPONSE);
      render(<MfaSetupPage />);
      // On step 1: steps 2-5 should show their numbers
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();

      // Advance to step 2
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByTestId('mfa-qr-generator')).toBeInTheDocument();
      });
      // On step 2: step title changes, steps 3-5 still show numbers
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText(/set up authenticator/i)).toBeInTheDocument();
    });

    it('does not allow backward step navigation', async () => {
      await advanceToVerify();
      // No "back" button should exist
      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
      // Method selection should not be visible
      expect(screen.queryByText('Authenticator App')).not.toBeInTheDocument();
    });

    it('clears error when retrying', async () => {
      // AC9
      mockSetupMfa.mockRejectedValueOnce(new Error('Network error'));
      mockSetupMfa.mockResolvedValueOnce(TOTP_RESPONSE);
      render(<MfaSetupPage />);
      // First attempt fails
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
      // Second attempt succeeds — error should clear as we transition
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByTestId('mfa-qr-generator')).toBeInTheDocument();
      });
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------
  // tRPC Integration (8 tests) — AC2-AC5
  // ------------------------------------------
  describe('tRPC Integration', () => {
    it('calls setupMfa with TOTP method', async () => {
      // AC3
      mockSetupMfa.mockResolvedValue(TOTP_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(mockSetupMfa).toHaveBeenCalledWith({ method: 'totp', phone: undefined });
      });
    });

    it('calls setupMfa with SMS method and phone number', async () => {
      // AC2
      mockSetupMfa.mockResolvedValue(SMS_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('SMS Code'));
      const phoneInput = screen.getByPlaceholderText(/\+1/);
      fireEvent.change(phoneInput, { target: { value: '+15551234567' } });
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(mockSetupMfa).toHaveBeenCalledWith({ method: 'sms', phone: '+15551234567' });
      });
    });

    it('calls setupMfa with Email method', async () => {
      // AC2
      mockSetupMfa.mockResolvedValue(EMAIL_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('Email Code'));
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(mockSetupMfa).toHaveBeenCalledWith({ method: 'email', phone: undefined });
      });
    });

    it('handles TOTP response: passes secret+qrCodeUrl to QR component', async () => {
      // AC3
      mockSetupMfa.mockResolvedValue(TOTP_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByTestId('qr-secret')).toHaveTextContent('JBSWY3DPEHPK3PXP');
        expect(screen.getByTestId('qr-url')).toHaveTextContent('otpauth://totp/');
      });
    });

    it('handles SMS/Email response: shows code sent message', async () => {
      // AC2
      mockSetupMfa.mockResolvedValue(SMS_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('SMS Code'));
      const phoneInput = screen.getByPlaceholderText(/\+1/);
      fireEvent.change(phoneInput, { target: { value: '+15551234567' } });
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        // SMS setup step shows phone input instructions
        expect(screen.getByText(/enter your phone number/i)).toBeInTheDocument();
      });
    });

    it('calls confirmMfa with verification code', async () => {
      // AC4
      mockConfirmMfa.mockResolvedValue(CONFIRM_RESPONSE);
      mockGetBackupCodes.mockResolvedValue(BACKUP_CODES_RESPONSE);
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i);
      fireEvent.change(input, { target: { value: '654321' } });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(mockConfirmMfa).toHaveBeenCalledWith({ method: 'totp', code: '654321' });
      });
    });

    it('calls getBackupCodes after confirmMfa succeeds', async () => {
      // AC5
      mockConfirmMfa.mockResolvedValue(CONFIRM_RESPONSE);
      mockGetBackupCodes.mockResolvedValue(BACKUP_CODES_RESPONSE);
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i);
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(mockGetBackupCodes).toHaveBeenCalled();
      });
    });

    it('chains confirmMfa → getBackupCodes correctly', async () => {
      // AC5
      const callOrder: string[] = [];
      mockConfirmMfa.mockImplementation(async () => {
        callOrder.push('confirmMfa');
        return CONFIRM_RESPONSE;
      });
      mockGetBackupCodes.mockImplementation(async () => {
        callOrder.push('getBackupCodes');
        return BACKUP_CODES_RESPONSE;
      });
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i);
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(callOrder).toEqual(['confirmMfa', 'getBackupCodes']);
      });
    });
  });

  // ------------------------------------------
  // Component Integration (4 tests) — AC3, AC4, AC6, AC12
  // ------------------------------------------
  describe('Component Integration', () => {
    it('passes qrCodeUrl and secret to MfaQrGenerator', async () => {
      // AC3
      await advanceToSetup();
      expect(screen.getByTestId('qr-url')).toHaveTextContent(TOTP_RESPONSE.qrCodeUrl);
      expect(screen.getByTestId('qr-secret')).toHaveTextContent(TOTP_RESPONSE.secret);
    });

    it('passes backupCodes to BackupCodesDisplay', async () => {
      // AC6
      await advanceToBackup();
      expect(screen.getByTestId('backup-codes-count')).toHaveTextContent('10');
    });

    it('passes verificationCode to VerificationInput', async () => {
      // AC4
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: '789012' } });
      expect(input.value).toBe('789012');
    });

    it('displays user email from AuthContext', async () => {
      // AC12
      await advanceToSetup();
      expect(screen.getByTestId('qr-account')).toHaveTextContent('test@example.com');
    });
  });

  // ------------------------------------------
  // Loading States (3 tests) — AC11
  // ------------------------------------------
  describe('Loading States', () => {
    it('shows loading during setupMfa mutation', () => {
      // AC11
      mutationState.setupPending = true;
      render(<MfaSetupPage />);
      expect(screen.getByText(/setting up/i)).toBeInTheDocument();
    });

    it('shows loading during confirmMfa mutation', async () => {
      // AC11
      mutationState.confirmPending = true;
      await advanceToVerify();
      // The verify button shows "Verifying..." when pending
      expect(screen.getByText(/verifying/i)).toBeInTheDocument();
    });

    it('disables buttons during mutations', () => {
      // AC11
      mutationState.setupPending = true;
      render(<MfaSetupPage />);
      const continueBtn = screen.getByRole('button', { name: /setting up/i });
      expect(continueBtn).toBeDisabled();
    });
  });

  // ------------------------------------------
  // Phone Number Validation (3 tests)
  // ------------------------------------------
  describe('Phone Number Validation', () => {
    it('disables Continue when SMS selected and no phone entered', () => {
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('SMS Code'));
      const continueBtn = screen.getByRole('button', { name: /continue with/i });
      expect(continueBtn).toBeDisabled();
    });

    it('enables Continue when phone number entered', () => {
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('SMS Code'));
      const phoneInput = screen.getByPlaceholderText(/\+1/);
      fireEvent.change(phoneInput, { target: { value: '+15551234567' } });
      const continueBtn = screen.getByRole('button', { name: /continue with/i });
      expect(continueBtn).not.toBeDisabled();
    });

    it('passes phone number to setupMfa mutation', async () => {
      mockSetupMfa.mockResolvedValue(SMS_RESPONSE);
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByText('SMS Code'));
      const phoneInput = screen.getByPlaceholderText(/\+1/);
      fireEvent.change(phoneInput, { target: { value: '+447700900000' } });
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(mockSetupMfa).toHaveBeenCalledWith(
          expect.objectContaining({ phone: '+447700900000' })
        );
      });
    });
  });

  // ------------------------------------------
  // Error Handling (3 tests) — AC9
  // ------------------------------------------
  describe('Error Handling', () => {
    it('shows error banner when setupMfa fails', async () => {
      // AC9
      mockSetupMfa.mockRejectedValue(new Error('Service unavailable'));
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
      });
    });

    it('shows error below verification input on confirmMfa fail', async () => {
      // AC9
      mockConfirmMfa.mockRejectedValue(new Error('Invalid verification code'));
      await advanceToVerify();
      const input = screen.getByLabelText(/verification code/i);
      fireEvent.change(input, { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: /verify code/i }));
      await waitFor(() => {
        expect(screen.getByText(/invalid verification code/i)).toBeInTheDocument();
      });
    });

    it('logs errors to console.error', async () => {
      // AC9
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSetupMfa.mockRejectedValue(new Error('Test error'));
      render(<MfaSetupPage />);
      fireEvent.click(screen.getByRole('button', { name: /continue with/i }));
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('MFA setup failed:', expect.any(Error));
      });
      consoleSpy.mockRestore();
    });
  });

  // ------------------------------------------
  // Accessibility (3 tests) — AC12
  // ------------------------------------------
  describe('Accessibility', () => {
    it('renders breadcrumbs with correct navigation', () => {
      // AC12
      render(<MfaSetupPage />);
      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('MFA Setup')).toBeInTheDocument();
    });

    it('cancel link is keyboard accessible', () => {
      // AC12
      render(<MfaSetupPage />);
      const cancelLink = screen.getByText(/cancel and return to settings/i);
      expect(cancelLink.tagName).toBe('A');
      expect(cancelLink).toHaveAttribute('href', '/settings/account');
    });

    it('provides sr-only text for progress indicator state', () => {
      // AC12
      const { container } = render(<MfaSetupPage />);
      // Progress indicator uses aria-hidden on icons and visible step numbers
      const ariaHiddenIcons = container.querySelectorAll('[aria-hidden="true"]');
      expect(ariaHiddenIcons.length).toBeGreaterThan(0);
    });
  });
});
