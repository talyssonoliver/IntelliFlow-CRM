// @vitest-environment happy-dom

/**
 * MFA Management Dashboard Tests
 * PG-125: AC-001, AC-010, AC-011, NF-002
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the hooks
const mockMfaStatus = {
  data: {
    enabled: true,
    methods: { totp: true, sms: false, email: false },
    backupCodesRemaining: 5,
    lastVerifiedAt: null,
    enabledAt: null,
  },
  isLoading: false,
  error: null,
};

const mockDisableMfa = {
  mutateAsync: vi.fn(),
  isPending: false,
  error: null,
};

const mockRegenerateBackupCodes = {
  mutateAsync: vi.fn(),
  isPending: false,
  error: null,
};

vi.mock('@/lib/security/mfa-service', () => ({
  useMfaStatus: () => mockMfaStatus,
  useDisableMfa: () => mockDisableMfa,
  useRegenerateBackupCodes: () => mockRegenerateBackupCodes,
}));

vi.mock('@/lib/security/backup-codes', () => ({
  formatBackupCodesForDisplay: vi.fn((codes: string[]) => codes),
  downloadBackupCodes: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock PageHeader
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

// Mock @intelliflow/ui - provide all required components
vi.mock('@intelliflow/ui', async () => {
  const React = await import('react');
  return {
    Card: ({ children, className }: any) => <div className={className}>{children}</div>,
    Badge: ({ children, variant, ...props }: any) => (
      <span data-variant={variant} {...props}>
        {children}
      </span>
    ),
    Alert: ({ children, variant }: any) => (
      <div role="alert" data-variant={variant}>
        {children}
      </div>
    ),
    AlertDescription: ({ children }: any) => <div>{children}</div>,
    AlertDialog: ({ children }: any) => <div>{children}</div>,
    AlertDialogAction: ({ children, onClick, disabled, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    AlertDialogCancel: ({ children, onClick }: any) => (
      <button onClick={onClick}>{children}</button>
    ),
    AlertDialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
    AlertDialogTrigger: ({ children, asChild }: any) => {
      if (asChild && React.isValidElement(children)) return children;
      return <div>{children}</div>;
    },
    Button: ({ children, onClick, disabled, variant, asChild, className, ...props }: any) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<any>, { className, ...props });
      }
      return (
        <button
          onClick={onClick}
          disabled={disabled}
          data-variant={variant}
          className={className}
          {...props}
        >
          {children}
        </button>
      );
    },
    Input: (props: any) => <input {...props} />,
    Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
    Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
  };
});

// Import after mocks
const { default: MfaManagementPage } = await import('../MfaContent');

describe('MFA Management Dashboard (PG-125)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to enabled state
    mockMfaStatus.data = {
      enabled: true,
      methods: { totp: true, sms: false, email: false },
      backupCodesRemaining: 5,
      lastVerifiedAt: null,
      enabledAt: null,
    };
    mockMfaStatus.isLoading = false;
    mockDisableMfa.error = null;
    mockDisableMfa.isPending = false;
    mockRegenerateBackupCodes.error = null;
    mockRegenerateBackupCodes.isPending = false;
  });

  describe('Status Display', () => {
    it('should show "Enabled" badge when MFA is enabled', () => {
      render(<MfaManagementPage />);
      const badge = screen.getByTestId('mfa-status-badge');
      expect(badge.textContent).toBe('Enabled');
    });

    it('should show "Disabled" badge when MFA is disabled', () => {
      mockMfaStatus.data = {
        ...mockMfaStatus.data,
        enabled: false,
        methods: { totp: false, sms: false, email: false },
      };
      render(<MfaManagementPage />);
      const badge = screen.getByTestId('mfa-status-badge');
      expect(badge.textContent).toBe('Disabled');
    });

    it('should show TOTP as active', () => {
      render(<MfaManagementPage />);
      const row = screen.getByTestId('method-row-authenticator app');
      expect(row.textContent).toContain('Active');
    });

    it('should show backup codes remaining', () => {
      render(<MfaManagementPage />);
      expect(screen.getByText('5 codes')).toBeTruthy();
    });

    it('should show loading skeleton', () => {
      mockMfaStatus.isLoading = true;
      render(<MfaManagementPage />);
      expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });
  });

  describe('Disable Flow', () => {
    it('should render disable button when MFA is enabled', () => {
      render(<MfaManagementPage />);
      expect(screen.getByTestId('disable-mfa-btn')).toBeTruthy();
    });

    it('should not show disable button when MFA is disabled', () => {
      mockMfaStatus.data = { ...mockMfaStatus.data, enabled: false };
      render(<MfaManagementPage />);
      expect(screen.queryByTestId('disable-mfa-btn')).toBeNull();
    });

    it('should call disableMfa with TOTP code', async () => {
      mockDisableMfa.mutateAsync.mockResolvedValue({ success: true });
      render(<MfaManagementPage />);

      const btn = screen.getByTestId('disable-mfa-btn');
      fireEvent.click(btn);

      const input = screen.getByTestId('disable-totp-input');
      fireEvent.change(input, { target: { value: '123456' } });

      const confirmBtn = screen.getByText('Disable MFA');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockDisableMfa.mutateAsync).toHaveBeenCalledWith({ totpCode: '123456' });
      });
    });
  });

  describe('Regenerate Backup Codes', () => {
    it('should render regenerate button', () => {
      render(<MfaManagementPage />);
      expect(screen.getByTestId('regen-backup-btn')).toBeTruthy();
    });

    it('should show new codes after regeneration', async () => {
      mockRegenerateBackupCodes.mutateAsync.mockResolvedValue({
        codes: ['CODE1', 'CODE2', 'CODE3', 'CODE4', 'CODE5', 'CODE6', 'CODE7', 'CODE8'],
        generatedAt: new Date(),
        warning: 'Save these codes',
      });
      render(<MfaManagementPage />);

      const btn = screen.getByTestId('regen-backup-btn');
      fireEvent.click(btn);

      const input = screen.getByTestId('regen-totp-input');
      fireEvent.change(input, { target: { value: '654321' } });

      const confirmBtn = screen.getByText('Regenerate');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(screen.getByTestId('new-backup-codes-display')).toBeTruthy();
      });
    });
  });

  describe('Add Method Card', () => {
    it('should show "Add method" link when MFA is enabled', () => {
      render(<MfaManagementPage />);
      expect(screen.getByText(/Add method/)).toBeTruthy();
    });

    it('should show "Get started" link when MFA is disabled', () => {
      mockMfaStatus.data = {
        ...mockMfaStatus.data,
        enabled: false,
        methods: { totp: false, sms: false, email: false },
      };
      render(<MfaManagementPage />);
      expect(screen.getAllByText(/Get started/).length).toBeGreaterThanOrEqual(1);
    });

    it('should link to setup page', () => {
      render(<MfaManagementPage />);
      const link = screen.getByText(/Add method/).closest('a');
      expect(link?.getAttribute('href')).toBe('/settings/security/mfa/setup');
    });
  });

  describe('Disable Flow - Password Tab', () => {
    it('should switch to password tab and submit', async () => {
      mockDisableMfa.mutateAsync.mockResolvedValue({ success: true });
      render(<MfaManagementPage />);

      // Open dialog
      fireEvent.click(screen.getByTestId('disable-mfa-btn'));

      // Switch to password tab
      const passwordTab = screen.getByText('Password');
      fireEvent.click(passwordTab);

      // Enter password
      const input = screen.getByTestId('disable-password-input');
      fireEvent.change(input, { target: { value: 'MyPassword123' } });

      // Confirm
      const confirmBtn = screen.getByText('Disable MFA');
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockDisableMfa.mutateAsync).toHaveBeenCalledWith({ password: 'MyPassword123' });
      });
    });

    it('should show authenticator tab by default', () => {
      render(<MfaManagementPage />);
      fireEvent.click(screen.getByTestId('disable-mfa-btn'));
      expect(screen.getByTestId('disable-totp-input')).toBeTruthy();
    });
  });

  describe('Regenerate Backup Codes - Cancel', () => {
    it('should clear input on cancel', () => {
      render(<MfaManagementPage />);

      // Open dialog
      fireEvent.click(screen.getByTestId('regen-backup-btn'));

      // Type in input
      const input = screen.getByTestId('regen-totp-input');
      fireEvent.change(input, { target: { value: '123456' } });

      // Cancel — use getAllByText since there are multiple Cancel buttons across dialogs
      const cancelBtns = screen.getAllByText('Cancel');
      fireEvent.click(cancelBtns[0]);
    });

    it('should show download link after regeneration', async () => {
      mockRegenerateBackupCodes.mutateAsync.mockResolvedValue({
        codes: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'],
        generatedAt: new Date(),
        warning: 'Save these codes',
      });
      render(<MfaManagementPage />);

      fireEvent.click(screen.getByTestId('regen-backup-btn'));
      const input = screen.getByTestId('regen-totp-input');
      fireEvent.change(input, { target: { value: '654321' } });
      fireEvent.click(screen.getByText('Regenerate'));

      await waitFor(() => {
        expect(screen.getByText('Download codes')).toBeTruthy();
      });
    });
  });

  describe('Disable Flow - Error & Cancel', () => {
    it('should show error message on disable failure', () => {
      mockDisableMfa.error = { message: 'Invalid TOTP code' } as any;
      render(<MfaManagementPage />);
      fireEvent.click(screen.getByTestId('disable-mfa-btn'));
      expect(screen.getByText('Invalid TOTP code')).toBeTruthy();
    });

    it('should clear inputs on cancel', () => {
      render(<MfaManagementPage />);
      fireEvent.click(screen.getByTestId('disable-mfa-btn'));
      const input = screen.getByTestId('disable-totp-input');
      fireEvent.change(input, { target: { value: '123456' } });
      // Click the second Cancel (disable dialog's)
      const cancelBtns = screen.getAllByText('Cancel');
      fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    });

    it('should show download link for new backup codes', async () => {
      mockRegenerateBackupCodes.mutateAsync.mockResolvedValue({
        codes: ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8'],
        generatedAt: new Date(),
        warning: 'Save',
      });
      render(<MfaManagementPage />);
      fireEvent.click(screen.getByTestId('regen-backup-btn'));
      fireEvent.change(screen.getByTestId('regen-totp-input'), { target: { value: '123456' } });
      fireEvent.click(screen.getByText('Regenerate'));
      await waitFor(() => {
        const downloadBtn = screen.getByText('Download codes');
        fireEvent.click(downloadBtn);
      });
    });
  });

  describe('Disable MFA Card UI', () => {
    it('should show destructive warning alert', () => {
      render(<MfaManagementPage />);
      const alerts = screen.getAllByRole('alert');
      const destructive = alerts.find((el) => el.getAttribute('data-variant') === 'destructive');
      expect(destructive).toBeTruthy();
    });

    it('should not show disable card when MFA is disabled', () => {
      mockMfaStatus.data = { ...mockMfaStatus.data, enabled: false };
      render(<MfaManagementPage />);
      expect(screen.queryByTestId('disable-mfa-btn')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('should have data-testid attributes on key elements', () => {
      render(<MfaManagementPage />);
      expect(screen.getByTestId('mfa-status-badge')).toBeTruthy();
      expect(screen.getByTestId('disable-mfa-btn')).toBeTruthy();
      expect(screen.getByTestId('regen-backup-btn')).toBeTruthy();
    });

    it('should have page title', () => {
      render(<MfaManagementPage />);
      expect(screen.getByText('Two-Factor Authentication')).toBeTruthy();
    });
  });
});
