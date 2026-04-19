/**
 * Document Settings Validator Tests - PG-186
 */

import { describe, it, expect } from 'vitest';
import {
  documentFileTypeConfigSchema,
  documentSizeLimitConfigSchema,
  documentAntivirusConfigSchema,
  documentRetentionPolicySchema,
  documentAutomationSettingsSchema,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_BLOCKED_EXTENSIONS,
  DOCUMENT_AUTOMATION_CAT1_KEYS,
  DOCUMENT_AUTOMATION_CAT2_PENDING,
  DOCUMENT_AUTOMATION_CAT3_AI_KEYS,
} from '../document-settings';

describe('documentFileTypeConfigSchema', () => {
  it('accepts a valid config with at least one allowed extension', () => {
    const result = documentFileTypeConfigSchema.safeParse({
      allowedExtensions: ['pdf', 'docx'],
      blockedExtensions: ['exe'],
      allowedMimeTypes: ['application/pdf'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty allowed extensions array', () => {
    const result = documentFileTypeConfigSchema.safeParse({
      allowedExtensions: [],
      blockedExtensions: [],
      allowedMimeTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-alphanumeric extensions', () => {
    const result = documentFileTypeConfigSchema.safeParse({
      allowedExtensions: ['pdf', 'bad-ext.'],
      blockedExtensions: [],
      allowedMimeTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects extension longer than 20 chars', () => {
    const result = documentFileTypeConfigSchema.safeParse({
      allowedExtensions: ['a'.repeat(21)],
      blockedExtensions: [],
      allowedMimeTypes: [],
    });
    expect(result.success).toBe(false);
  });

  it('exports sensible defaults', () => {
    expect(DEFAULT_ALLOWED_EXTENSIONS).toContain('pdf');
    expect(DEFAULT_ALLOWED_EXTENSIONS).toContain('docx');
    expect(DEFAULT_BLOCKED_EXTENSIONS).toContain('exe');
    expect(DEFAULT_BLOCKED_EXTENSIONS).toContain('bat');
  });
});

describe('documentSizeLimitConfigSchema', () => {
  it('accepts valid boundaries', () => {
    const result = documentSizeLimitConfigSchema.safeParse({
      maxFileSizeMB: 100,
      maxTotalStorageMB: 10240,
      maxFilesPerUpload: 20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxFileSizeMB = 0', () => {
    const result = documentSizeLimitConfigSchema.safeParse({
      maxFileSizeMB: 0,
      maxTotalStorageMB: 10240,
      maxFilesPerUpload: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxFileSizeMB > 10000', () => {
    const result = documentSizeLimitConfigSchema.safeParse({
      maxFileSizeMB: 10001,
      maxTotalStorageMB: 10240,
      maxFilesPerUpload: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer maxFileSizeMB', () => {
    const result = documentSizeLimitConfigSchema.safeParse({
      maxFileSizeMB: 100.5,
      maxTotalStorageMB: 10240,
      maxFilesPerUpload: 20,
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxFilesPerUpload > 1000', () => {
    const result = documentSizeLimitConfigSchema.safeParse({
      maxFileSizeMB: 100,
      maxTotalStorageMB: 10240,
      maxFilesPerUpload: 1001,
    });
    expect(result.success).toBe(false);
  });
});

describe('documentAntivirusConfigSchema', () => {
  it('accepts all-true config', () => {
    const result = documentAntivirusConfigSchema.safeParse({
      enableAntivirusScan: true,
      quarantineInfected: true,
      notifyAdminOnThreat: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all-false config', () => {
    const result = documentAntivirusConfigSchema.safeParse({
      enableAntivirusScan: false,
      quarantineInfected: false,
      notifyAdminOnThreat: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = documentAntivirusConfigSchema.safeParse({ enableAntivirusScan: true });
    expect(result.success).toBe(false);
  });
});

describe('documentRetentionPolicySchema', () => {
  it('accepts valid config', () => {
    const result = documentRetentionPolicySchema.safeParse({
      retentionDays: 365,
      archiveInsteadOfDelete: true,
      preserveVersions: 5,
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects retentionDays = 0', () => {
    const result = documentRetentionPolicySchema.safeParse({
      retentionDays: 0,
      archiveInsteadOfDelete: true,
      preserveVersions: 5,
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects retentionDays > 3650', () => {
    const result = documentRetentionPolicySchema.safeParse({
      retentionDays: 3651,
      archiveInsteadOfDelete: true,
      preserveVersions: 5,
      isActive: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts preserveVersions = 0', () => {
    const result = documentRetentionPolicySchema.safeParse({
      retentionDays: 365,
      archiveInsteadOfDelete: false,
      preserveVersions: 0,
      isActive: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects preserveVersions > 100', () => {
    const result = documentRetentionPolicySchema.safeParse({
      retentionDays: 365,
      archiveInsteadOfDelete: true,
      preserveVersions: 101,
      isActive: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('documentAutomationSettingsSchema', () => {
  it('accepts all 7 bool fields', () => {
    const result = documentAutomationSettingsSchema.safeParse({
      normalizeFilename: true,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: false,
      notifyOnUpload: false,
      aiDocumentClassification: false,
      aiSensitiveDataDetection: false,
      aiSummarization: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects payload missing AI fields', () => {
    const result = documentAutomationSettingsSchema.safeParse({
      normalizeFilename: true,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: false,
      notifyOnUpload: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('automation category metadata', () => {
  it('Cat-1 keys cover the two wired-now toggles', () => {
    expect(DOCUMENT_AUTOMATION_CAT1_KEYS).toEqual([
      'normalizeFilename',
      'preventDeleteIfReferenced',
    ]);
  });

  it('Cat-2 pending map references the expected IFC tasks', () => {
    expect(DOCUMENT_AUTOMATION_CAT2_PENDING.notifyOnOwnerChange).toBe('IFC-311');
    expect(DOCUMENT_AUTOMATION_CAT2_PENDING.notifyOnUpload).toBe('IFC-310');
  });

  it('Cat-3 AI keys cover the three opt-in toggles', () => {
    expect(DOCUMENT_AUTOMATION_CAT3_AI_KEYS).toEqual([
      'aiDocumentClassification',
      'aiSensitiveDataDetection',
      'aiSummarization',
    ]);
  });
});
