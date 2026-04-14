/**
 * Contact Settings Validators Tests - PG-182
 */

import { describe, it, expect } from 'vitest';
import {
  contactDuplicateRuleSchema,
  updateContactDuplicateRulesSchema,
  updateContactRequiredFieldsSchema,
  createContactTagSchema,
  updateContactTagSchema,
  contactAutomationSettingsSchema,
  TAG_COLOR_TOKENS,
} from '../contact-settings';

describe('contact-settings validators', () => {
  describe('duplicate rule', () => {
    it('accepts a valid email-exact rule', () => {
      const result = contactDuplicateRuleSchema.safeParse({
        field: 'email',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects threshold > 100', () => {
      const result = contactDuplicateRuleSchema.safeParse({
        field: 'email',
        matchStrategy: 'exact',
        threshold: 101,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown matchStrategy', () => {
      const result = contactDuplicateRuleSchema.safeParse({
        field: 'email',
        matchStrategy: 'magical',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(false);
    });

    it('updateContactDuplicateRulesSchema requires at least one rule', () => {
      const result = updateContactDuplicateRulesSchema.safeParse({ rules: [] });
      expect(result.success).toBe(false);
    });

    it('updateContactDuplicateRulesSchema rejects duplicate (field, strategy) pairs', () => {
      const result = updateContactDuplicateRulesSchema.safeParse({
        rules: [
          {
            field: 'email',
            matchStrategy: 'exact',
            threshold: 100,
            isActive: true,
            sortOrder: 0,
          },
          {
            field: 'email',
            matchStrategy: 'exact',
            threshold: 80,
            isActive: false,
            sortOrder: 1,
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('accepts distinct (field, strategy) pairs', () => {
      const result = updateContactDuplicateRulesSchema.safeParse({
        rules: [
          {
            field: 'email',
            matchStrategy: 'exact',
            threshold: 100,
            isActive: true,
            sortOrder: 0,
          },
          {
            field: 'email',
            matchStrategy: 'normalized',
            threshold: 100,
            isActive: true,
            sortOrder: 1,
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('required fields', () => {
    it('accepts valid field list when email is required', () => {
      const result = updateContactRequiredFieldsSchema.safeParse({
        fields: [
          { fieldKey: 'email', isRequired: true },
          { fieldKey: 'phone', isRequired: false },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects when email is not required', () => {
      const result = updateContactRequiredFieldsSchema.safeParse({
        fields: [
          { fieldKey: 'email', isRequired: false },
          { fieldKey: 'phone', isRequired: true },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects when email row is missing', () => {
      const result = updateContactRequiredFieldsSchema.safeParse({
        fields: [{ fieldKey: 'phone', isRequired: true }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty list', () => {
      const result = updateContactRequiredFieldsSchema.safeParse({ fields: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('tags', () => {
    it('accepts a valid tag create', () => {
      const result = createContactTagSchema.safeParse({
        name: 'VIP',
        colorToken: 'amber',
        description: 'High-value contact',
      });
      expect(result.success).toBe(true);
    });

    it('defaults colorToken to slate when omitted', () => {
      const result = createContactTagSchema.safeParse({ name: 'Partner' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.colorToken).toBe('slate');
    });

    it('rejects blank names', () => {
      const result = createContactTagSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects names over 60 characters', () => {
      const result = createContactTagSchema.safeParse({ name: 'x'.repeat(61) });
      expect(result.success).toBe(false);
    });

    it('rejects colors outside the allowlist', () => {
      const result = createContactTagSchema.safeParse({
        name: 'x',
        colorToken: 'chartreuse',
      });
      expect(result.success).toBe(false);
    });

    it('updateContactTagSchema requires id', () => {
      const result = updateContactTagSchema.safeParse({ name: 'hi' });
      expect(result.success).toBe(false);
    });

    it('exposes the expected color token palette', () => {
      expect(TAG_COLOR_TOKENS).toContain('slate');
      expect(TAG_COLOR_TOKENS).toContain('emerald');
      expect(TAG_COLOR_TOKENS.length).toBeGreaterThanOrEqual(18);
    });
  });

  describe('automation settings', () => {
    it('accepts all booleans including AI flags', () => {
      const result = contactAutomationSettingsSchema.safeParse({
        autoMergeOnExactEmail: false,
        notifyOnDuplicate: true,
        restrictTagCreationToAdmins: false,
        normalizePhoneNumbers: true,
        autoCapitalizeNames: true,
        preventDeleteWithOpenDeals: true,
        notifyOnOwnerChange: false,
        aiDuplicateDetection: true,
        aiEnrichment: false,
        aiTagSuggestions: true,
        aiInsightGeneration: true,
        aiAutoReplyDrafting: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing fields', () => {
      const result = contactAutomationSettingsSchema.safeParse({
        notifyOnDuplicate: true,
      });
      expect(result.success).toBe(false);
    });

    it('rejects when an AI flag is missing', () => {
      const result = contactAutomationSettingsSchema.safeParse({
        autoMergeOnExactEmail: false,
        notifyOnDuplicate: true,
        restrictTagCreationToAdmins: false,
        normalizePhoneNumbers: true,
        autoCapitalizeNames: true,
        preventDeleteWithOpenDeals: true,
        notifyOnOwnerChange: false,
        aiDuplicateDetection: true,
        aiEnrichment: false,
        aiTagSuggestions: true,
        aiInsightGeneration: true,
        // aiAutoReplyDrafting missing
      });
      expect(result.success).toBe(false);
    });
  });
});
