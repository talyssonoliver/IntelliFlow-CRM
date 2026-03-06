import type { DocumentStatus, DocumentClassification, AccessLevel } from './types';

// =============================================================================
// Document Manager — Shared Utilities
// Consolidates helpers duplicated across (list)/page.tsx, [id]/page.tsx, new/page.tsx
// =============================================================================

/**
 * Format byte count to human-readable file size.
 * Includes BigInt overflow guard for files >2GB (Number.MAX_SAFE_INTEGER check).
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (!Number.isSafeInteger(bytes) && bytes > Number.MAX_SAFE_INTEGER) {
    return '>8 PB (overflow)';
  }
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return unitIndex === 0 ? `${size} ${units[unitIndex]}` : `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format ISO date string to locale-friendly display.
 */
export function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Get visual configuration for document status badges.
 */
export function getStatusConfig(status: DocumentStatus): {
  label: string;
  color: string;
  icon: string;
} {
  const configs: Record<DocumentStatus, { label: string; color: string; icon: string }> = {
    DRAFT: {
      label: 'Draft',
      color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
      icon: 'edit_note',
    },
    UNDER_REVIEW: {
      label: 'In Review',
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      icon: 'rate_review',
    },
    APPROVED: {
      label: 'Approved',
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      icon: 'check_circle',
    },
    SIGNED: {
      label: 'Signed',
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      icon: 'verified',
    },
    ARCHIVED: {
      label: 'Archived',
      color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
      icon: 'inventory_2',
    },
    SUPERSEDED: {
      label: 'Superseded',
      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      icon: 'update_disabled',
    },
  };
  return configs[status] ?? { label: status, color: 'bg-slate-100 text-slate-700', icon: 'help' };
}

/**
 * Get badge configuration for document classification.
 */
export function getClassificationBadge(classification: DocumentClassification): {
  label: string;
  variant: string;
} {
  const configs: Record<DocumentClassification, { label: string; variant: string }> = {
    PUBLIC: { label: 'Public', variant: 'outline' },
    INTERNAL: { label: 'Internal', variant: 'secondary' },
    CONFIDENTIAL: { label: 'Confidential', variant: 'default' },
    PRIVILEGED: { label: 'Privileged', variant: 'destructive' },
  };
  return configs[classification] ?? { label: classification, variant: 'outline' };
}

/**
 * Get icon name for a MIME type.
 */
export function getMimeTypeIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'picture_as_pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'table_chart';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'slideshow';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'article';
  if (mimeType.startsWith('text/')) return 'text_snippet';
  return 'description';
}

/**
 * Check if a MIME type can be previewed in the browser.
 */
export function isPreviewableType(mimeType: string): boolean {
  if (mimeType === 'application/pdf') return true;
  if (mimeType.startsWith('image/')) return true;
  if (mimeType === 'text/html') return true;
  if (mimeType === 'text/plain') return true;
  return false;
}

/**
 * Check if user has ADMIN access level (required to modify ACL).
 */
export function canUserModifyACL(userAccessLevel: AccessLevel): boolean {
  return userAccessLevel === 'ADMIN';
}

/**
 * Sanitize file name to prevent path traversal attacks (SR-07).
 * Removes directory separators, parent directory references, and null bytes.
 */
export function sanitizeFileName(name: string): string {
  return (
    name.replace(/\.\./g, '').replace(/[/\\]/g, '').replace(/\0/g, '').replace(/^\.+/, '').trim() ||
    'unnamed'
  );
}

// Accepted file types for document upload
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'text/plain',
];

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.txt'];

export const MAX_FILE_SIZE_MB = 50;
