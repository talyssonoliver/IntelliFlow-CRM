/**
 * Backup Codes Utility Tests
 *
 * IMPLEMENTS: PG-021 (MFA Setup)
 *
 * TDD tests for backup code formatting, clipboard, and download utilities.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

// Mock document.createElement for download
const mockLink = {
  href: '',
  download: '',
  click: vi.fn(),
  remove: vi.fn(),
};

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
const mockRevokeObjectURL = vi.fn();

describe('Backup Codes Utility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, { clipboard: mockClipboard });
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(mockCreateObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mockRevokeObjectURL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatBackupCode', () => {
    it('should format a 10-character code with dash in the middle', async () => {
      const { formatBackupCode } = await import('../backup-codes');
      expect(formatBackupCode('A1B2C3D4E5')).toBe('A1B2C-3D4E5');
    });

    it('should handle lowercase codes', async () => {
      const { formatBackupCode } = await import('../backup-codes');
      expect(formatBackupCode('a1b2c3d4e5')).toBe('A1B2C-3D4E5');
    });

    it('should handle already formatted codes', async () => {
      const { formatBackupCode } = await import('../backup-codes');
      expect(formatBackupCode('A1B2C-3D4E5')).toBe('A1B2C-3D4E5');
    });

    it('should handle codes with spaces', async () => {
      const { formatBackupCode } = await import('../backup-codes');
      expect(formatBackupCode(' A1B2C3D4E5 ')).toBe('A1B2C-3D4E5');
    });

    it('should handle 8-character codes', async () => {
      const { formatBackupCode } = await import('../backup-codes');
      expect(formatBackupCode('A1B2C3D4')).toBe('A1B2-C3D4');
    });

    it('should handle 12-character codes', async () => {
      const { formatBackupCode } = await import('../backup-codes');
      expect(formatBackupCode('A1B2C3D4E5F6')).toBe('A1B2C3-D4E5F6');
    });
  });

  describe('formatBackupCodesForDisplay', () => {
    it('should format codes as numbered list', async () => {
      const { formatBackupCodesForDisplay } = await import('../backup-codes');
      const codes = ['A1B2C3D4E5', 'F6G7H8I9J0'];
      const result = formatBackupCodesForDisplay(codes);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ index: 1, code: 'A1B2C-3D4E5' });
      expect(result[1]).toEqual({ index: 2, code: 'F6G7H-8I9J0' });
    });

    it('should handle empty array', async () => {
      const { formatBackupCodesForDisplay } = await import('../backup-codes');
      const result = formatBackupCodesForDisplay([]);
      expect(result).toHaveLength(0);
    });

    it('should format 8 codes correctly', async () => {
      const { formatBackupCodesForDisplay } = await import('../backup-codes');
      const codes = [
        'A1B2C3D4E5',
        'F6G7H8I9J0',
        'K1L2M3N4O5',
        'P6Q7R8S9T0',
        'U1V2W3X4Y5',
        'Z6A7B8C9D0',
        'E1F2G3H4I5',
        'J6K7L8M9N0',
      ];
      const result = formatBackupCodesForDisplay(codes);

      expect(result).toHaveLength(8);
      expect(result[7]).toEqual({ index: 8, code: 'J6K7L-8M9N0' });
    });
  });

  describe('generateBackupCodesDownload', () => {
    it('should generate text file content', async () => {
      const { generateBackupCodesDownload } = await import('../backup-codes');
      const codes = ['A1B2C3D4E5', 'F6G7H8I9J0'];
      const email = 'user@example.com';
      const date = new Date('2025-01-01T12:00:00Z');

      const content = generateBackupCodesDownload(codes, email, date);

      expect(content).toContain('IntelliFlow CRM - Backup Codes');
      expect(content).toContain('Account: user@example.com');
      expect(content).toContain('Generated: 2025-01-01');
      expect(content).toContain('A1B2C-3D4E5');
      expect(content).toContain('F6G7H-8I9J0');
      expect(content).toContain('IMPORTANT');
      expect(content).toContain('one-time use');
    });

    it('should include warning message', async () => {
      const { generateBackupCodesDownload } = await import('../backup-codes');
      const codes = ['A1B2C3D4E5'];
      const content = generateBackupCodesDownload(codes, 'test@test.com', new Date());

      expect(content).toContain('Keep these codes in a safe place');
      expect(content).toContain('Each code can only be used once');
    });
  });

  describe('copyBackupCodesToClipboard', () => {
    it('should copy formatted codes to clipboard', async () => {
      const { copyBackupCodesToClipboard } = await import('../backup-codes');
      const codes = ['A1B2C3D4E5', 'F6G7H8I9J0'];

      await copyBackupCodesToClipboard(codes);

      expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);
      const clipboardContent = mockClipboard.writeText.mock.calls[0][0];
      expect(clipboardContent).toContain('A1B2C-3D4E5');
      expect(clipboardContent).toContain('F6G7H-8I9J0');
    });

    it('should return true on success', async () => {
      const { copyBackupCodesToClipboard } = await import('../backup-codes');
      const result = await copyBackupCodesToClipboard(['A1B2C3D4E5']);
      expect(result).toBe(true);
    });

    it('should return false on clipboard failure', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
      const { copyBackupCodesToClipboard } = await import('../backup-codes');
      const result = await copyBackupCodesToClipboard(['A1B2C3D4E5']);
      expect(result).toBe(false);
    });
  });

  describe('downloadBackupCodes', () => {
    it('should create and trigger download', async () => {
      const { downloadBackupCodes } = await import('../backup-codes');
      const codes = ['A1B2C3D4E5'];
      const email = 'user@example.com';
      const date = new Date('2025-01-01T12:00:00Z');

      downloadBackupCodes(codes, email, date);

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockLink.download).toMatch(/intelliflow-backup-codes-.*\.txt$/);
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should include date in filename', async () => {
      const { downloadBackupCodes } = await import('../backup-codes');
      const date = new Date('2025-03-15T10:30:00Z');

      downloadBackupCodes(['A1B2C3D4E5'], 'test@test.com', date);

      expect(mockLink.download).toContain('2025-03-15');
    });

    it('should cleanup blob URL after download', async () => {
      vi.useFakeTimers();
      const { downloadBackupCodes } = await import('../backup-codes');

      downloadBackupCodes(['A1B2C3D4E5'], 'test@test.com', new Date());

      // Advance timers to trigger cleanup
      vi.advanceTimersByTime(150);

      // Verify revokeObjectURL was called (cleanup triggered)
      expect(mockRevokeObjectURL).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('printBackupCodes', () => {
    it('should open print dialog with formatted codes', async () => {
      const mockPrint = vi.fn();
      const mockClose = vi.fn();
      const mockWrite = vi.fn();
      const mockWindow = {
        document: {
          write: mockWrite,
          close: mockClose,
        },
        print: mockPrint,
        close: mockClose,
      };
      vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);

      const { printBackupCodes } = await import('../backup-codes');
      const codes = ['A1B2C3D4E5'];
      const email = 'user@example.com';
      const date = new Date('2025-01-01T12:00:00Z');

      printBackupCodes(codes, email, date);

      expect(window.open).toHaveBeenCalled();
      expect(mockWrite).toHaveBeenCalled();
      const printContent = mockWrite.mock.calls[0][0];
      expect(printContent).toContain('IntelliFlow CRM');
      expect(printContent).toContain('Backup Codes');
      expect(printContent).toContain('A1B2C-3D4E5');
    });

    it('should handle popup blocker', async () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { printBackupCodes } = await import('../backup-codes');
      printBackupCodes(['A1B2C3D4E5'], 'test@test.com', new Date());

      expect(consoleSpy).toHaveBeenCalledWith('Could not open print window');
    });
  });

  describe('validateBackupCode', () => {
    it('should validate correctly formatted code', async () => {
      const { validateBackupCode } = await import('../backup-codes');
      expect(validateBackupCode('A1B2C3D4E5')).toBe(true);
      expect(validateBackupCode('a1b2c3d4e5')).toBe(true);
      expect(validateBackupCode('A1B2C-3D4E5')).toBe(true);
    });

    it('should reject invalid codes', async () => {
      const { validateBackupCode } = await import('../backup-codes');
      expect(validateBackupCode('')).toBe(false);
      expect(validateBackupCode('short')).toBe(false);
      expect(validateBackupCode('contains!special')).toBe(false);
      expect(validateBackupCode('12345678901234567890')).toBe(false); // too long
    });

    it('should handle alphanumeric codes only', async () => {
      const { validateBackupCode } = await import('../backup-codes');
      expect(validateBackupCode('ABCDEFGHIJ')).toBe(true);
      expect(validateBackupCode('1234567890')).toBe(true);
      expect(validateBackupCode('ABC123XYZ9')).toBe(true);
    });
  });
});
