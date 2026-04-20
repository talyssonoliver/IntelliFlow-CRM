/**
 * Document Settings Validator Tests - PG-186
 *
 * Tests for document-settings.ts Zod schemas:
 * - documentGeneralConfigSchema
 * - updateDocumentDuplicateRulesSchema (incl. superRefine dedup)
 * - updateDocumentRequiredFieldsSchema (incl. title locked)
 * - createDocumentTagSchema
 * - documentAutomationSettingsSchema
 * - updateDocumentRetentionPoliciesSchema
 */

import { describe, it, expect } from 'vitest';
import {
  documentGeneralConfigSchema,
  updateDocumentDuplicateRulesSchema,
  updateDocumentRequiredFieldsSchema,
  createDocumentTagSchema,
  documentAutomationSettingsSchema,
  updateDocumentRetentionPoliciesSchema,
} from '../document-settings';

// ─── documentGeneralConfigSchema ────────────────────────────────────────────

describe('documentGeneralConfigSchema', () => {
  it('valid full config passes', () => {
    const result = documentGeneralConfigSchema.safeParse({
      allowedMimeTypes: ['application/pdf'],
      maxUploadSizeMb: 50,
      defaultRetentionDays: 365,
      enableAntivirusScan: true,
      quarantineOnDetect: true,
      blockOnScanFailure: true,
    });
    expect(result.success).toBe(true);
  });

  it('maxUploadSizeMb below 1 is rejected', () => {
    const result = documentGeneralConfigSchema.safeParse({
      allowedMimeTypes: [],
      maxUploadSizeMb: 0,
      defaultRetentionDays: 365,
      enableAntivirusScan: true,
      quarantineOnDetect: true,
      blockOnScanFailure: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('maxUploadSizeMb'))).toBe(true);
    }
  });

  it('maxUploadSizeMb above 500 is rejected', () => {
    const result = documentGeneralConfigSchema.safeParse({
      allowedMimeTypes: [],
      maxUploadSizeMb: 501,
      defaultRetentionDays: 365,
      enableAntivirusScan: true,
      quarantineOnDetect: true,
      blockOnScanFailure: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('maxUploadSizeMb'))).toBe(true);
    }
  });
});

// ─── updateDocumentDuplicateRulesSchema ─────────────────────────────────────

describe('updateDocumentDuplicateRulesSchema', () => {
  it('valid two distinct rules passes', () => {
    const result = updateDocumentDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'content_hash',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'filename_normalized',
          matchStrategy: 'normalized',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('superRefine rejects duplicate (field, matchStrategy) pair', () => {
    const result = updateDocumentDuplicateRulesSchema.safeParse({
      rules: [
        {
          field: 'content_hash',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 0,
        },
        {
          field: 'content_hash',
          matchStrategy: 'exact',
          collisionAction: 'warn',
          isActive: true,
          sortOrder: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[1] === 1 && i.path[2] === 'matchStrategy'
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toMatch(/rows 1 and 2/);
    }
  });

  it('empty rules array is rejected (min 1)', () => {
    const result = updateDocumentDuplicateRulesSchema.safeParse({ rules: [] });
    expect(result.success).toBe(false);
  });
});

// ─── updateDocumentRequiredFieldsSchema ─────────────────────────────────────

describe('updateDocumentRequiredFieldsSchema', () => {
  it('valid with title required passes', () => {
    const result = updateDocumentRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'title', isRequired: true },
        { fieldKey: 'description', isRequired: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('title.isRequired=false is rejected', () => {
    const result = updateDocumentRequiredFieldsSchema.safeParse({
      fields: [
        { fieldKey: 'title', isRequired: false },
        { fieldKey: 'description', isRequired: false },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes('title field must remain required'))
      ).toBe(true);
    }
  });

  it('empty fields array is rejected', () => {
    const result = updateDocumentRequiredFieldsSchema.safeParse({ fields: [] });
    expect(result.success).toBe(false);
  });
});

// ─── createDocumentTagSchema ─────────────────────────────────────────────────

describe('createDocumentTagSchema', () => {
  it('valid tag passes', () => {
    const result = createDocumentTagSchema.safeParse({ name: 'Contract', colorToken: 'teal' });
    expect(result.success).toBe(true);
  });

  it('name too long (>50 chars) is rejected', () => {
    const result = createDocumentTagSchema.safeParse({
      name: 'A'.repeat(51),
      colorToken: 'teal',
    });
    expect(result.success).toBe(false);
  });
});

// ─── documentAutomationSettingsSchema ───────────────────────────────────────

describe('documentAutomationSettingsSchema', () => {
  it('all 12 booleans provided passes', () => {
    const result = documentAutomationSettingsSchema.safeParse({
      normalizeFilename: true,
      preventDeleteIfReferenced: true,
      notifyOnOwnerChange: false,
      restrictTagCreationToAdmins: false,
      notifyOnDuplicate: true,
      autoVersionOnCollision: false,
      autoDetectDuplicates: false,
      autoExtractText: false,
      autoClassifyCategory: false,
      autoDetectPii: false,
      aiTagSuggestions: false,
      aiInsightGeneration: false,
    });
    expect(result.success).toBe(true);
  });

  it('missing required boolean is rejected', () => {
    const result = documentAutomationSettingsSchema.safeParse({
      normalizeFilename: true,
      // missing the rest
    });
    expect(result.success).toBe(false);
  });
});

// ─── updateDocumentRetentionPoliciesSchema ───────────────────────────────────

describe('updateDocumentRetentionPoliciesSchema', () => {
  it('valid retention policy passes', () => {
    const result = updateDocumentRetentionPoliciesSchema.safeParse({
      policies: [
        {
          categoryKey: 'default',
          retentionDays: 365,
          autoArchive: false,
          legalHoldOverride: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty policies array (spec §3.4: min 1)', () => {
    const result = updateDocumentRetentionPoliciesSchema.safeParse({ policies: [] });
    expect(result.success).toBe(false);
  });

  it('rejects retentionDays === 0', () => {
    const result = updateDocumentRetentionPoliciesSchema.safeParse({
      policies: [
        { categoryKey: 'default', retentionDays: 0, autoArchive: false, legalHoldOverride: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects retentionDays > 36500 (100-year cap)', () => {
    const result = updateDocumentRetentionPoliciesSchema.safeParse({
      policies: [
        {
          categoryKey: 'default',
          retentionDays: 40000,
          autoArchive: false,
          legalHoldOverride: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts retentionDays at the 36500 boundary', () => {
    const result = updateDocumentRetentionPoliciesSchema.safeParse({
      policies: [
        {
          categoryKey: 'default',
          retentionDays: 36500,
          autoArchive: false,
          legalHoldOverride: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate categoryKey entries', () => {
    const result = updateDocumentRetentionPoliciesSchema.safeParse({
      policies: [
        {
          categoryKey: 'contracts',
          retentionDays: 365,
          autoArchive: true,
          legalHoldOverride: false,
        },
        {
          categoryKey: 'contracts',
          retentionDays: 730,
          autoArchive: true,
          legalHoldOverride: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
