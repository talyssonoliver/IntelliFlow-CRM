import { describe, it, expect } from 'vitest';
import { caseSettingsSchema } from '../case-settings';

const VALID_CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('case-settings validators', () => {
  describe('caseSettingsSchema', () => {
    it('accepts valid default-like input', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects lowercase casePrefix', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'case-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty casePrefix', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: '',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects casePrefix longer than 20 chars', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'ABCDEFGHIJKLMNOPQRSTU',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects casePrefix with spaces', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE A',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects casePrefix with special chars (underscore)', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE_',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid defaultPriority value', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'CRITICAL',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
    });

    it('accepts LOW priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'LOW',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts MEDIUM priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts HIGH priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'HIGH',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts URGENT priority', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'URGENT',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts autoAssignUserId: null when autoAssignEnabled: false', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: false,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid cuid when autoAssignEnabled: true', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: true,
        autoAssignUserId: VALID_CUID,
      });
      expect(result.success).toBe(true);
    });

    it('rejects autoAssignEnabled: true with autoAssignUserId: null (cross-field)', () => {
      const result = caseSettingsSchema.safeParse({
        casePrefix: 'CASE-',
        defaultPriority: 'MEDIUM',
        autoAssignEnabled: true,
        autoAssignUserId: null,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('autoAssignUserId');
      }
    });
  });
});
