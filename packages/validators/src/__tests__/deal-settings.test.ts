/**
 * Deal Settings Validators Tests - PG-184
 *
 * Covers the full validator surface. The critical rules (playbook §5, §6):
 *   - superRefine rejects duplicate (field, matchStrategy) pairs.
 *   - accountId + ownerId cannot be unchecked on updateDealRequiredFields.
 *   - AI defaults FALSE match the factory defaults constant.
 */

import { describe, it, expect } from 'vitest';
import {
  dealDuplicateRuleSchema,
  updateDealDuplicateRulesSchema,
  updateDealRequiredFieldsSchema,
  createDealWinLossReasonSchema,
  updateDealWinLossReasonSchema,
  createDealScoringRuleSchema,
  updateDealScoringRuleSchema,
  createDealTagSchema,
  updateDealTagSchema,
  dealAutomationSettingsSchema,
  DEFAULT_DEAL_AUTOMATION,
  DEFAULT_DEAL_DUPLICATE_RULES,
  DEFAULT_DEAL_REQUIRED_FIELDS,
  DEFAULT_DEAL_WIN_REASONS,
  DEFAULT_DEAL_LOSS_REASONS,
  generateDealReasonKey,
} from '../deal-settings';

describe('deal-settings validators', () => {
  describe('duplicate rule', () => {
    it('accepts a valid name_account-exact rule', () => {
      const result = dealDuplicateRuleSchema.safeParse({
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(true);
    });

    it('rejects threshold > 100', () => {
      const result = dealDuplicateRuleSchema.safeParse({
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 101,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown matchStrategy', () => {
      const result = dealDuplicateRuleSchema.safeParse({
        field: 'name_account',
        matchStrategy: 'phonetic',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown field', () => {
      const result = dealDuplicateRuleSchema.safeParse({
        field: 'industry',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateDealDuplicateRules superRefine (playbook §6)', () => {
    it('accepts a non-duplicate list of rules', () => {
      const result = updateDealDuplicateRulesSchema.safeParse({
        rules: [
          {
            field: 'name_account',
            matchStrategy: 'exact',
            threshold: 100,
            isActive: true,
            sortOrder: 0,
          },
          {
            field: 'name_amount_stage',
            matchStrategy: 'normalized',
            threshold: 90,
            isActive: true,
            sortOrder: 1,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects two rules with the same (field, matchStrategy) pair and points at the second row', () => {
      const result = updateDealDuplicateRulesSchema.safeParse({
        rules: [
          {
            field: 'name_account',
            matchStrategy: 'exact',
            threshold: 100,
            isActive: true,
            sortOrder: 0,
          },
          {
            field: 'name_account',
            matchStrategy: 'exact',
            threshold: 80,
            isActive: true,
            sortOrder: 1,
          },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        expect(issue.message).toMatch(/Duplicate \(field, strategy\)/);
        expect(issue.message).toMatch(/rows 1 and 2/);
        expect(issue.path).toEqual(['rules', 1, 'matchStrategy']);
      }
    });

    it('rejects an empty rules array', () => {
      const result = updateDealDuplicateRulesSchema.safeParse({ rules: [] });
      expect(result.success).toBe(false);
    });
  });

  describe('updateDealRequiredFields refine (accountId + ownerId always required)', () => {
    it('accepts the factory defaults', () => {
      const result = updateDealRequiredFieldsSchema.safeParse({
        fields: [...DEFAULT_DEAL_REQUIRED_FIELDS],
      });
      expect(result.success).toBe(true);
    });

    it('rejects payload where accountId is unchecked', () => {
      const result = updateDealRequiredFieldsSchema.safeParse({
        fields: [
          { fieldKey: 'accountId', isRequired: false },
          { fieldKey: 'ownerId', isRequired: true },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects payload where ownerId is unchecked', () => {
      const result = updateDealRequiredFieldsSchema.safeParse({
        fields: [
          { fieldKey: 'accountId', isRequired: true },
          { fieldKey: 'ownerId', isRequired: false },
        ],
      });
      expect(result.success).toBe(false);
    });

    it('rejects payload missing accountId row', () => {
      const result = updateDealRequiredFieldsSchema.safeParse({
        fields: [{ fieldKey: 'ownerId', isRequired: true }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('win/loss reason', () => {
    it('accepts a valid WON reason create payload', () => {
      const result = createDealWinLossReasonSchema.safeParse({
        category: 'WON',
        label: 'Fastest to market',
      });
      expect(result.success).toBe(true);
    });

    it('accepts a valid LOST reason', () => {
      const result = createDealWinLossReasonSchema.safeParse({
        category: 'LOST',
        label: 'No budget',
      });
      expect(result.success).toBe(true);
    });

    it('rejects unknown category', () => {
      const result = createDealWinLossReasonSchema.safeParse({
        category: 'PUSHED',
        label: 'Still in play',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty label', () => {
      const result = createDealWinLossReasonSchema.safeParse({
        category: 'WON',
        label: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects label longer than 100 chars', () => {
      const result = createDealWinLossReasonSchema.safeParse({
        category: 'WON',
        label: 'x'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('update accepts a partial patch', () => {
      const result = updateDealWinLossReasonSchema.safeParse({
        id: 'abc',
        isActive: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('scoring rule', () => {
    it('accepts a valid number-field rule', () => {
      const result = createDealScoringRuleSchema.safeParse({
        name: 'High value',
        field: 'value',
        operator: 'gte',
        valueJson: { type: 'number', value: 50000 },
        points: 10,
      });
      expect(result.success).toBe(true);
    });

    it('rejects points out of [-100, 100]', () => {
      const result = createDealScoringRuleSchema.safeParse({
        name: 'Too many',
        field: 'value',
        operator: 'gt',
        valueJson: { type: 'number', value: 100 },
        points: 101,
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing valueJson.type', () => {
      const result = createDealScoringRuleSchema.safeParse({
        name: 'No type',
        field: 'value',
        operator: 'gt',
        valueJson: { value: 100 } as unknown as { type: 'number'; value: number },
        points: 10,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown operator', () => {
      const result = createDealScoringRuleSchema.safeParse({
        name: 'Bad op',
        field: 'value',
        operator: 'matches',
        valueJson: { type: 'number', value: 100 },
        points: 10,
      });
      expect(result.success).toBe(false);
    });

    it('update accepts partial fields', () => {
      const result = updateDealScoringRuleSchema.safeParse({
        id: 'abc',
        points: -5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('tag', () => {
    it('accepts a minimal tag (default colorToken=slate)', () => {
      const result = createDealTagSchema.safeParse({ name: 'VIP' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.colorToken).toBe('slate');
      }
    });

    it('rejects unknown colorToken', () => {
      const result = createDealTagSchema.safeParse({
        name: 'Bad',
        colorToken: 'burgundy',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty name', () => {
      const result = createDealTagSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name > 60 chars', () => {
      const result = createDealTagSchema.safeParse({ name: 'x'.repeat(61) });
      expect(result.success).toBe(false);
    });

    it('update accepts isActive toggle', () => {
      const result = updateDealTagSchema.safeParse({ id: 'abc', isActive: false });
      expect(result.success).toBe(true);
    });
  });

  describe('automation settings', () => {
    it('accepts the factory defaults', () => {
      const result = dealAutomationSettingsSchema.safeParse(DEFAULT_DEAL_AUTOMATION);
      expect(result.success).toBe(true);
    });

    it('has all 6 AI flags defaulting to FALSE (playbook §7)', () => {
      expect(DEFAULT_DEAL_AUTOMATION.aiDuplicateDetection).toBe(false);
      expect(DEFAULT_DEAL_AUTOMATION.aiDealScoring).toBe(false);
      expect(DEFAULT_DEAL_AUTOMATION.aiNextStepRecommendation).toBe(false);
      expect(DEFAULT_DEAL_AUTOMATION.aiTagSuggestions).toBe(false);
      expect(DEFAULT_DEAL_AUTOMATION.aiInsightGeneration).toBe(false);
      expect(DEFAULT_DEAL_AUTOMATION.aiWinLossPrediction).toBe(false);
    });

    it('rejects missing fields', () => {
      const partial = { ...DEFAULT_DEAL_AUTOMATION } as Partial<typeof DEFAULT_DEAL_AUTOMATION>;
      delete partial.autoMergeOnExactNameAccount;
      const result = dealAutomationSettingsSchema.safeParse(partial);
      expect(result.success).toBe(false);
    });

    it('rejects negative highValueThreshold', () => {
      const result = dealAutomationSettingsSchema.safeParse({
        ...DEFAULT_DEAL_AUTOMATION,
        highValueThreshold: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('factory defaults shape', () => {
    it('duplicate rules include the 3 canonical defaults', () => {
      expect(DEFAULT_DEAL_DUPLICATE_RULES).toHaveLength(3);
      expect(DEFAULT_DEAL_DUPLICATE_RULES[0].field).toBe('name_account');
    });

    it('required fields include all 6 keys', () => {
      expect(DEFAULT_DEAL_REQUIRED_FIELDS).toHaveLength(6);
      expect(DEFAULT_DEAL_REQUIRED_FIELDS.find((f) => f.fieldKey === 'accountId')?.isRequired).toBe(
        true
      );
      expect(DEFAULT_DEAL_REQUIRED_FIELDS.find((f) => f.fieldKey === 'ownerId')?.isRequired).toBe(
        true
      );
    });

    it('win reasons list has 4 entries', () => {
      expect(DEFAULT_DEAL_WIN_REASONS).toHaveLength(4);
      expect(DEFAULT_DEAL_WIN_REASONS.every((r) => r.category === 'WON')).toBe(true);
    });

    it('loss reasons list has 4 entries', () => {
      expect(DEFAULT_DEAL_LOSS_REASONS).toHaveLength(4);
      expect(DEFAULT_DEAL_LOSS_REASONS.every((r) => r.category === 'LOST')).toBe(true);
    });
  });

  describe('generateDealReasonKey', () => {
    it('slugifies simple labels', () => {
      expect(generateDealReasonKey('Lost to Competitor')).toBe('lost_to_competitor');
    });

    it('collapses multiple non-alphanumeric characters', () => {
      expect(generateDealReasonKey('  No   Decision!!  ')).toBe('no_decision');
    });

    it('handles numbers', () => {
      expect(generateDealReasonKey('Q1 Budget Freeze')).toBe('q1_budget_freeze');
    });
  });
});
