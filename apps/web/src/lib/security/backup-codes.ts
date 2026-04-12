/**
 * Backup Codes Re-export
 * PG-125: Re-exports from shared backup-codes module
 */

export {
  formatBackupCode,
  formatBackupCodesForDisplay,
  copyBackupCodesToClipboard,
  downloadBackupCodes,
  printBackupCodes,
  validateBackupCode,
  generateBackupCodesDownload,
} from '@/lib/shared/backup-codes';
