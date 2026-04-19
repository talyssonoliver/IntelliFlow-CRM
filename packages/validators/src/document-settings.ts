/**
 * Document Settings Validators - PG-186
 *
 * Zod schemas for document file types, size limits, antivirus,
 * retention policy, and automation toggles. Mirrors the PG-182/PG-183
 * settings-validators pattern.
 */

import { z } from 'zod';

// ─── Defaults (exported for router + tests) ──────────────────────────────────

export const DEFAULT_ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'rtf',
  'odt',
  'ods',
  'odp',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'mp4',
  'mov',
  'avi',
  'zip',
] as const;

export const DEFAULT_BLOCKED_EXTENSIONS = [
  'exe',
  'bat',
  'sh',
  'cmd',
  'ps1',
  'vbs',
  'com',
  'scr',
  'msi',
] as const;

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'application/zip',
] as const;

// ─── File Type Config ────────────────────────────────────────────────────────

export const documentFileTypeConfigSchema = z.object({
  allowedExtensions: z
    .array(
      z
        .string()
        .min(1)
        .max(20)
        .regex(/^[a-z0-9]+$/i, 'Extension must be alphanumeric')
    )
    .min(1, 'At least one allowed extension is required'),
  blockedExtensions: z.array(z.string().min(1).max(20)),
  allowedMimeTypes: z.array(z.string().min(1)),
});
export type DocumentFileTypeConfigInput = z.infer<typeof documentFileTypeConfigSchema>;

// ─── Size Limits ─────────────────────────────────────────────────────────────

export const documentSizeLimitConfigSchema = z.object({
  maxFileSizeMB: z
    .number()
    .int()
    .min(1, 'Max file size must be at least 1 MB')
    .max(10000, 'Max file size cannot exceed 10000 MB (10 GB)'),
  maxTotalStorageMB: z
    .number()
    .int()
    .min(1, 'Max total storage must be at least 1 MB')
    .max(1_000_000, 'Max total storage cannot exceed 1 TB'),
  maxFilesPerUpload: z.number().int().min(1).max(1000),
});
export type DocumentSizeLimitConfigInput = z.infer<typeof documentSizeLimitConfigSchema>;

// ─── Antivirus ───────────────────────────────────────────────────────────────

export const documentAntivirusConfigSchema = z.object({
  enableAntivirusScan: z.boolean(),
  quarantineInfected: z.boolean(),
  notifyAdminOnThreat: z.boolean(),
});
export type DocumentAntivirusConfigInput = z.infer<typeof documentAntivirusConfigSchema>;

// ─── Retention Policy ────────────────────────────────────────────────────────

export const documentRetentionPolicySchema = z.object({
  retentionDays: z
    .number()
    .int()
    .min(1, 'Retention must be at least 1 day')
    .max(3650, 'Retention cannot exceed 10 years (3650 days)'),
  archiveInsteadOfDelete: z.boolean(),
  preserveVersions: z.number().int().min(0).max(100),
  isActive: z.boolean(),
});
export type DocumentRetentionPolicyInput = z.infer<typeof documentRetentionPolicySchema>;

// ─── Automation Settings ─────────────────────────────────────────────────────

export const documentAutomationSettingsSchema = z.object({
  // Cat-1: wired now
  normalizeFilename: z.boolean(),
  preventDeleteIfReferenced: z.boolean(),
  // Cat-2: pending IFC-310/311
  notifyOnOwnerChange: z.boolean(),
  notifyOnUpload: z.boolean(),
  // Cat-3: AI (opt-in, default false)
  aiDocumentClassification: z.boolean(),
  aiSensitiveDataDetection: z.boolean(),
  aiSummarization: z.boolean(),
});
export type DocumentAutomationSettingsInput = z.infer<typeof documentAutomationSettingsSchema>;

// ─── Automation Category Metadata (for UI) ───────────────────────────────────

export const DOCUMENT_AUTOMATION_CAT1_KEYS = [
  'normalizeFilename',
  'preventDeleteIfReferenced',
] as const;

export const DOCUMENT_AUTOMATION_CAT2_PENDING: Record<string, string> = {
  notifyOnOwnerChange: 'IFC-311',
  notifyOnUpload: 'IFC-310',
};

export const DOCUMENT_AUTOMATION_CAT3_AI_KEYS = [
  'aiDocumentClassification',
  'aiSensitiveDataDetection',
  'aiSummarization',
] as const;
