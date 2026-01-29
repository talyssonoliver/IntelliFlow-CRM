/**
 * MFA QR Generator Component Tests
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MfaQrGenerator } from '../mfa-qr-generator';

// Mock qrcode.react
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size }: { value: string; size: number }) => (
    <svg data-testid="qr-code" data-value={value} width={size} height={size}>
      <rect width={size} height={size} fill="white" />
    </svg>
  ),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

describe('MfaQrGenerator', () => {
  const defaultProps = {
    otpauthUrl: 'otpauth://totp/IntelliFlow:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=IntelliFlow',
    secret: 'JBSWY3DPEHPK3PXP',
    accountName: 'user@example.com',
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, { clipboard: mockClipboard });
  });

  describe('Rendering', () => {
    it('should render QR code', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const qrCode = screen.getByTestId('qr-code');
      expect(qrCode).toBeInTheDocument();
      expect(qrCode).toHaveAttribute('data-value', defaultProps.otpauthUrl);
    });

    it('should render scan instructions', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      expect(screen.getByText(/scan this qr code/i)).toBeInTheDocument();
    });

    it('should render manual entry toggle', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      expect(screen.getByText(/can't scan\?/i)).toBeInTheDocument();
    });

    it('should render confirm button', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      expect(screen.getByRole('button', { name: /confirm you have scanned/i })).toBeInTheDocument();
    });

    it('should render setup instructions', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
      expect(screen.getByText(/open your authenticator app/i)).toBeInTheDocument();
    });
  });

  describe('Manual Entry Section', () => {
    it('should be hidden by default', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      // The manual entry section (with the secret key display) should not exist
      expect(screen.queryByLabelText(/secret key for manual entry/i)).not.toBeInTheDocument();
    });

    it('should toggle visibility when clicked', async () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const toggleButton = screen.getByRole('button', { name: /can't scan/i });

      // Initially hidden
      expect(screen.queryByLabelText(/secret key for manual entry/i)).not.toBeInTheDocument();

      // Click to show
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/secret key for manual entry/i)).toBeInTheDocument();
      });

      // Click again to hide
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.queryByLabelText(/secret key for manual entry/i)).not.toBeInTheDocument();
      });
    });

    it('should display formatted secret key', async () => {
      render(<MfaQrGenerator {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /can't scan/i }));

      await waitFor(() => {
        // Secret should be formatted with spaces every 4 chars
        expect(screen.getByText(/JBSW Y3DP EHPK 3PXP/)).toBeInTheDocument();
      });
    });

    it('should display account name in manual section', async () => {
      render(<MfaQrGenerator {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /can't scan/i }));

      await waitFor(() => {
        // The account text appears in the manual section
        const manualSection = screen.getByLabelText(/secret key for manual entry/i).parentElement?.parentElement;
        expect(manualSection).toHaveTextContent(defaultProps.accountName);
      });
    });

    it('should have aria-expanded attribute', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const toggleButton = screen.getByRole('button', { name: /can't scan/i });
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Copy Button', () => {
    it('should copy secret to clipboard', async () => {
      render(<MfaQrGenerator {...defaultProps} />);

      // Open manual section
      fireEvent.click(screen.getByText(/can't scan\?/i));

      await waitFor(() => {
        const copyButton = screen.getByRole('button', { name: /copy secret key/i });
        fireEvent.click(copyButton);
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(defaultProps.secret);
    });

    it('should show copied state', async () => {
      render(<MfaQrGenerator {...defaultProps} />);

      fireEvent.click(screen.getByText(/can't scan\?/i));

      await waitFor(() => {
        const copyButton = screen.getByRole('button', { name: /copy secret key/i });
        fireEvent.click(copyButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });

  describe('Confirm Button', () => {
    it('should call onConfirm when clicked', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /confirm you have scanned/i });
      fireEvent.click(confirmButton);

      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should have proper focus styles', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /confirm you have scanned/i });
      expect(confirmButton).toHaveClass('focus:ring-2');
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label on QR code container', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const qrContainer = screen.getByRole('img', { name: /qr code for setting up/i });
      expect(qrContainer).toBeInTheDocument();
    });

    it('should have aria-label on confirm button', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const confirmButton = screen.getByRole('button', { name: /confirm you have scanned/i });
      expect(confirmButton).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <MfaQrGenerator {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should have white background for QR code', () => {
      render(<MfaQrGenerator {...defaultProps} />);

      const qrContainer = screen.getByRole('img', { name: /qr code/i });
      expect(qrContainer).toHaveClass('bg-white');
    });
  });
});
