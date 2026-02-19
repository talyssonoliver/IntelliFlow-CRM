import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  formatDate,
  getStatusConfig,
  getClassificationBadge,
  getMimeTypeIcon,
  isPreviewableType,
  canUserModifyACL,
  sanitizeFileName,
  ACCEPTED_FILE_TYPES,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
} from '../document-utils';

// =============================================================================
// document-utils.ts — Unit Tests (Step 3)
// =============================================================================

describe('formatFileSize', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('returns bytes for values < 1024', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats KB correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats MB correctly', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats GB correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });

  it('formats TB correctly', () => {
    expect(formatFileSize(1099511627776)).toBe('1.0 TB');
  });

  it('handles overflow for values > MAX_SAFE_INTEGER', () => {
    const result = formatFileSize(Number.MAX_SAFE_INTEGER + 1);
    expect(result).toContain('overflow');
  });

  it('returns "0 B" for negative numbers', () => {
    expect(formatFileSize(-1)).toBe('0 B');
  });

  it('returns "0 B" for NaN', () => {
    expect(formatFileSize(NaN)).toBe('0 B');
  });

  it('returns "0 B" for Infinity', () => {
    expect(formatFileSize(Infinity)).toBe('0 B');
  });
});

describe('formatDate', () => {
  it('formats ISO date string to locale string', () => {
    const result = formatDate('2026-01-15T10:30:00Z');
    // US locale: "Jan 15, 2026"
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });

  it('returns original string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('Invalid Date');
  });
});

describe('getStatusConfig', () => {
  it('returns correct config for DRAFT', () => {
    const config = getStatusConfig('DRAFT');
    expect(config.label).toBe('Draft');
    expect(config.icon).toBe('edit_note');
    expect(config.color).toContain('slate');
  });

  it('returns correct config for APPROVED', () => {
    const config = getStatusConfig('APPROVED');
    expect(config.label).toBe('Approved');
    expect(config.icon).toBe('check_circle');
    expect(config.color).toContain('emerald');
  });

  it('returns correct config for UNDER_REVIEW', () => {
    const config = getStatusConfig('UNDER_REVIEW');
    expect(config.label).toBe('In Review');
    expect(config.icon).toBe('rate_review');
    expect(config.color).toContain('amber');
  });

  it('returns correct config for SIGNED', () => {
    const config = getStatusConfig('SIGNED');
    expect(config.label).toBe('Signed');
    expect(config.icon).toBe('verified');
    expect(config.color).toContain('blue');
  });

  it('returns correct config for ARCHIVED', () => {
    const config = getStatusConfig('ARCHIVED');
    expect(config.label).toBe('Archived');
    expect(config.icon).toBe('inventory_2');
  });

  it('returns correct config for SUPERSEDED', () => {
    const config = getStatusConfig('SUPERSEDED');
    expect(config.label).toBe('Superseded');
    expect(config.icon).toBe('update_disabled');
    expect(config.color).toContain('red');
  });

  it('returns fallback for unknown status', () => {
    const config = getStatusConfig('UNKNOWN' as any);
    expect(config.icon).toBe('help');
  });
});

describe('getClassificationBadge', () => {
  it('returns correct config for PUBLIC', () => {
    const config = getClassificationBadge('PUBLIC');
    expect(config.label).toBe('Public');
    expect(config.variant).toBe('outline');
  });

  it('returns correct config for INTERNAL', () => {
    const config = getClassificationBadge('INTERNAL');
    expect(config.label).toBe('Internal');
    expect(config.variant).toBe('secondary');
  });

  it('returns correct config for CONFIDENTIAL', () => {
    const config = getClassificationBadge('CONFIDENTIAL');
    expect(config.label).toBe('Confidential');
    expect(config.variant).toBe('default');
  });

  it('returns correct config for RESTRICTED', () => {
    const config = getClassificationBadge('RESTRICTED');
    expect(config.label).toBe('Restricted');
    expect(config.variant).toBe('destructive');
  });
});

describe('getMimeTypeIcon', () => {
  it('returns "image" for image MIME types', () => {
    expect(getMimeTypeIcon('image/png')).toBe('image');
    expect(getMimeTypeIcon('image/jpeg')).toBe('image');
  });

  it('returns "picture_as_pdf" for PDF', () => {
    expect(getMimeTypeIcon('application/pdf')).toBe('picture_as_pdf');
  });

  it('returns "table_chart" for spreadsheets', () => {
    expect(getMimeTypeIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('table_chart');
  });

  it('returns "slideshow" for presentations', () => {
    expect(getMimeTypeIcon('application/vnd.ms-powerpoint')).toBe('slideshow');
  });

  it('returns "article" for word documents', () => {
    expect(getMimeTypeIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('article');
  });

  it('returns "text_snippet" for text files', () => {
    expect(getMimeTypeIcon('text/plain')).toBe('text_snippet');
  });

  it('returns "description" for unknown types', () => {
    expect(getMimeTypeIcon('application/octet-stream')).toBe('description');
  });
});

describe('isPreviewableType', () => {
  it('returns true for PDF', () => {
    expect(isPreviewableType('application/pdf')).toBe(true);
  });

  it('returns true for images', () => {
    expect(isPreviewableType('image/png')).toBe(true);
    expect(isPreviewableType('image/jpeg')).toBe(true);
  });

  it('returns true for text/html', () => {
    expect(isPreviewableType('text/html')).toBe(true);
  });

  it('returns true for text/plain', () => {
    expect(isPreviewableType('text/plain')).toBe(true);
  });

  it('returns false for DOCX', () => {
    expect(isPreviewableType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
  });

  it('returns false for unknown types', () => {
    expect(isPreviewableType('application/octet-stream')).toBe(false);
  });
});

describe('canUserModifyACL', () => {
  it('returns true for ADMIN', () => {
    expect(canUserModifyACL('ADMIN')).toBe(true);
  });

  it('returns false for EDIT', () => {
    expect(canUserModifyACL('EDIT')).toBe(false);
  });

  it('returns false for VIEW', () => {
    expect(canUserModifyACL('VIEW')).toBe(false);
  });

  it('returns false for COMMENT', () => {
    expect(canUserModifyACL('COMMENT')).toBe(false);
  });

  it('returns false for NONE', () => {
    expect(canUserModifyACL('NONE')).toBe(false);
  });
});

describe('sanitizeFileName', () => {
  it('returns normal filenames unchanged', () => {
    expect(sanitizeFileName('normal-file')).toBe('normal-file');
  });

  it('removes parent directory traversal', () => {
    const result = sanitizeFileName('../../../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).not.toContain('/');
  });

  it('removes forward slashes', () => {
    expect(sanitizeFileName('path/to/file')).toBe('pathtofile');
  });

  it('removes backslashes', () => {
    expect(sanitizeFileName('path\\to\\file')).toBe('pathtofile');
  });

  it('removes null bytes', () => {
    expect(sanitizeFileName('file\0name')).toBe('filename');
  });

  it('removes leading dots', () => {
    expect(sanitizeFileName('.hidden')).toBe('hidden');
  });

  it('returns "unnamed" for empty input after sanitization', () => {
    expect(sanitizeFileName('../..')).toBe('unnamed');
  });

  it('trims whitespace', () => {
    expect(sanitizeFileName('  file  ')).toBe('file');
  });
});

describe('constants', () => {
  it('has accepted file types', () => {
    expect(ACCEPTED_FILE_TYPES).toContain('application/pdf');
    expect(ACCEPTED_FILE_TYPES.length).toBeGreaterThan(0);
  });

  it('has accepted extensions', () => {
    expect(ACCEPTED_EXTENSIONS).toContain('.pdf');
    expect(ACCEPTED_EXTENSIONS).toContain('.docx');
    expect(ACCEPTED_EXTENSIONS.length).toBeGreaterThan(0);
  });

  it('has max file size constant', () => {
    expect(MAX_FILE_SIZE_MB).toBe(50);
  });
});
