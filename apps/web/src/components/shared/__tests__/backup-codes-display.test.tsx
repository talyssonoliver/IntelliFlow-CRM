/**
 * Backup Codes Display Component Tests
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BackupCodesDisplay } from '../backup-codes-display';

// Mock the backup-codes utility
vi.mock('@/lib/shared/backup-codes', () => ({
  formatBackupCodesForDisplay: (codes: string[]) =>
    codes.map((code, i) => ({
      index: i + 1,
      code: code.slice(0, 5) + '-' + code.slice(5),
    })),
  copyBackupCodesToClipboard: vi.fn().mockResolvedValue(true),
  downloadBackupCodes: vi.fn(),
  printBackupCodes: vi.fn(),
}));

// Import mocked functions for assertions
import {
  copyBackupCodesToClipboard,
  downloadBackupCodes,
  printBackupCodes,
} from '@/lib/shared/backup-codes';

describe('BackupCodesDisplay', () => {
  const defaultProps = {
    codes: [
      'A1B2C3D4E5',
      'F6G7H8I9J0',
      'K1L2M3N4O5',
      'P6Q7R8S9T0',
      'U1V2W3X4Y5',
      'Z6A7B8C9D0',
      'E1F2G3H4I5',
      'J6K7L8M9N0',
    ],
    email: 'user@example.com',
    generatedAt: new Date('2025-01-01T12:00:00Z'),
    onAcknowledge: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('should render warning banner', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/save your backup codes/i)).toBeInTheDocument();
    });

    it('should render all backup codes', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      // Check that all 8 codes are displayed
      expect(screen.getByText('A1B2C-3D4E5')).toBeInTheDocument();
      expect(screen.getByText('J6K7L-8M9N0')).toBeInTheDocument();
    });

    it('should render in 2-column grid', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const codesGrid = screen.getByLabelText(/backup codes list/i);
      expect(codesGrid).toHaveClass('grid-cols-2');
    });

    it('should render generation date', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByText(/generated/i)).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('button', { name: /copy all/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    });

    it('should render acknowledgment checkbox', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText(/i have saved my backup codes/i)).toBeInTheDocument();
    });

    it('should render continue button', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });

  describe('Copy Button', () => {
    it('should call copyBackupCodesToClipboard', async () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const copyButton = screen.getByRole('button', { name: /copy all/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(copyBackupCodesToClipboard).toHaveBeenCalledWith(defaultProps.codes);
      });
    });
  });

  describe('Download Button', () => {
    it('should call downloadBackupCodes', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const downloadButton = screen.getByRole('button', { name: /download/i });
      fireEvent.click(downloadButton);

      expect(downloadBackupCodes).toHaveBeenCalledWith(
        defaultProps.codes,
        defaultProps.email,
        defaultProps.generatedAt
      );
    });
  });

  describe('Print Button', () => {
    it('should call printBackupCodes', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const printButton = screen.getByRole('button', { name: /print/i });
      fireEvent.click(printButton);

      expect(printBackupCodes).toHaveBeenCalledWith(
        defaultProps.codes,
        defaultProps.email,
        defaultProps.generatedAt
      );
    });
  });

  describe('Acknowledgment', () => {
    it('should have checkbox unchecked by default', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('should disable continue button when not acknowledged', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).toBeDisabled();
    });

    it('should enable continue button when acknowledged', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).not.toBeDisabled();
    });

    it('should call onAcknowledge when continue is clicked and acknowledged', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      // Check the acknowledgment checkbox
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Click continue
      const continueButton = screen.getByRole('button', { name: /continue/i });
      fireEvent.click(continueButton);

      expect(defaultProps.onAcknowledge).toHaveBeenCalledTimes(1);
    });

    it('should NOT call onAcknowledge when not acknowledged', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      // Try to click continue without acknowledging
      const continueButton = screen.getByRole('button', { name: /continue/i });
      fireEvent.click(continueButton);

      expect(defaultProps.onAcknowledge).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have alert role on warning banner', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have aria-label on codes grid', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByLabelText(/backup codes list/i)).toBeInTheDocument();
    });

    it('should have aria-describedby on checkbox', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveAttribute('aria-describedby', 'acknowledge-description');
    });

    it('should have aria-label on continue button', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      expect(screen.getByRole('button', { name: /continue after saving/i })).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <BackupCodesDisplay {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should have proper focus styles on continue button', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).toHaveClass('focus:ring-2');
    });

    it('should have proper focus styles on checkbox', () => {
      render(<BackupCodesDisplay {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toHaveClass('focus:ring-2');
    });
  });
});
