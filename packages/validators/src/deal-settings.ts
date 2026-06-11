/**
 * Deal Settings Validators - PG-184
 *
 * Zod schemas for deal duplicate detection rules, required-field policy,
 * win/loss reason taxonomy, scoring rules, tag vocabulary, and automation
 * settings.
 *
 * Pattern mirrors packages/validators/src/contact-settings.ts. The 18-token
 * colorToken allowlist is imported from contact-settings (single source of
 * truth).
 */

import { z } from 'zod';
import { tagColorTokenSchema } from './contact-settings';

// tagColorTokenSchema / TAG_COLOR_TOKENS live in ./contact-settings — single
// source of truth. Import the schema here and use it in deal validators.

// ─── Duplicate Rules ────────────────────────────────────────────────────────

export const dealDuplicateRuleFieldSchema = z.enum([
  'name_account',
  'name_amount_stage',
  'expected_close',
]);
export type DealDuplicateRuleField = z.infer<typeof dealDuplicateRuleFieldSchema>;

export const dealDuplicateRuleStrategySchema = z.enum(['exact', 'normalized', 'fuzzy']);
export type DealDuplicateRuleStrategy = z.infer<typeof dealDuplicateRuleStrategySchema>;

export const dealDuplicateRuleSchema = z.object({
  field: dealDuplicateRuleFieldSchema,
  matchStrategy: dealDuplicateRuleStrategySchema,
  threshold: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type DealDuplicateRuleInput = z.infer<typeof dealDuplicateRuleSchema>;

export const updateDealDuplicateRulesSchema = z
  .object({
    rules: z.array(dealDuplicateRuleSchema).min(1, 'At least one rule is required'),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>();
    data.rules.forEach((rule, index) => {
      const key = `${rule.field}__${rule.matchStrategy}`;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate (field, strategy) pair: "${rule.field}" + "${rule.matchStrategy}" appears in rows ${first + 1} and ${index + 1}`,
          path: ['rules', index, 'matchStrategy'],
        });
      } else {
        seen.set(key, index);
      }
    });
  });
export type UpdateDealDuplicateRulesInput = z.infer<typeof updateDealDuplicateRulesSchema>;

// ─── Required Fields ────────────────────────────────────────────────────────

export const dealRequiredFieldKeySchema = z.enum([
  'accountId',
  'ownerId',
  'value',
  'expectedCloseDate',
  'stage',
  'description',
]);
export type DealRequiredFieldKey = z.infer<typeof dealRequiredFieldKeySchema>;

export const dealRequiredFieldSchema = z.object({
  fieldKey: dealRequiredFieldKeySchema,
  isRequired: z.boolean(),
});
export type DealRequiredFieldInput = z.infer<typeof dealRequiredFieldSchema>;

export const updateDealRequiredFieldsSchema = z
  .object({
    fields: z.array(dealRequiredFieldSchema).min(1, 'At least one field is required'),
  })
  .refine(
    (d) =>
      d.fields.find((f) => f.fieldKey === 'accountId')?.isRequired === true &&
      d.fields.find((f) => f.fieldKey === 'ownerId')?.isRequired === true,
    { message: 'accountId and ownerId must remain required', path: ['fields'] }
  );
export type UpdateDealRequiredFieldsInput = z.infer<typeof updateDealRequiredFieldsSchema>;

// ─── Win / Loss Reasons ─────────────────────────────────────────────────────

export const winLossCategorySchema = z.enum(['WON', 'LOST']);
export type WinLossCategory = z.infer<typeof winLossCategorySchema>;

export const createDealWinLossReasonSchema = z.object({
  category: winLossCategorySchema,
  label: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateDealWinLossReasonInput = z.infer<typeof createDealWinLossReasonSchema>;

export const updateDealWinLossReasonSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDealWinLossReasonInput = z.infer<typeof updateDealWinLossReasonSchema>;

export const deleteDealWinLossReasonSchema = z.object({
  id: z.string().min(1),
});
export type DeleteDealWinLossReasonInput = z.infer<typeof deleteDealWinLossReasonSchema>;

// ─── Scoring Rules ──────────────────────────────────────────────────────────

export const dealScoringRuleFieldSchema = z.enum([
  'value',
  'stage',
  'expectedCloseDate',
  'ownerId',
  'accountIndustry',
]);
export type DealScoringRuleField = z.infer<typeof dealScoringRuleFieldSchema>;

export const dealScoringRuleOperatorSchema = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
]);
export type DealScoringRuleOperator = z.infer<typeof dealScoringRuleOperatorSchema>;

// Discriminated on `type` so callers cannot smuggle arbitrary shapes through
// the Prisma JSON column. Array values accept string | number scalars — the
// scoring engine (IFC-312) never reads nested objects, so this narrows the
// surface without losing any current expressiveness.
export const dealScoringRuleValueSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), value: z.number() }),
  z.object({ type: z.literal('string'), value: z.string() }),
  z.object({ type: z.literal('array'), value: z.array(z.union([z.string(), z.number()])) }),
]);
export type DealScoringRuleValue = z.infer<typeof dealScoringRuleValueSchema>;

export const createDealScoringRuleSchema = z.object({
  name: z.string().min(1).max(80),
  field: dealScoringRuleFieldSchema,
  operator: dealScoringRuleOperatorSchema,
  valueJson: dealScoringRuleValueSchema,
  points: z.number().int().min(-100).max(100),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateDealScoringRuleInput = z.infer<typeof createDealScoringRuleSchema>;

export const updateDealScoringRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  field: dealScoringRuleFieldSchema.optional(),
  operator: dealScoringRuleOperatorSchema.optional(),
  valueJson: dealScoringRuleValueSchema.optional(),
  points: z.number().int().min(-100).max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateDealScoringRuleInput = z.infer<typeof updateDealScoringRuleSchema>;

export const deleteDealScoringRuleSchema = z.object({
  id: z.string().min(1),
});
export type DeleteDealScoringRuleInput = z.infer<typeof deleteDealScoringRuleSchema>;

// ─── Tags ───────────────────────────────────────────────────────────────────

export const createDealTagSchema = z.object({
  name: z.string().min(1).max(60),
  colorToken: tagColorTokenSchema.default('slate'),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateDealTagInput = z.infer<typeof createDealTagSchema>;

export const updateDealTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60).optional(),
  colorToken: tagColorTokenSchema.optional(),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDealTagInput = z.infer<typeof updateDealTagSchema>;

export const deleteDealTagSchema = z.object({
  id: z.string().min(1),
});
export type DeleteDealTagInput = z.infer<typeof deleteDealTagSchema>;

// ─── Automation ─────────────────────────────────────────────────────────────

export const dealAutomationSettingsSchema = z.object({
  // Duplicate detection
  autoMergeOnExactNameAccount: z.boolean(),
  notifyOnDuplicate: z.boolean(),
  // Tags / RBAC
  restrictTagCreationToAdmins: z.boolean(),
  // Data hygiene
  normalizeCurrency: z.boolean(),
  autoCapitalizeDealNames: z.boolean(),
  preventDeleteWithOpenTasks: z.boolean(),
  // Notifications
  notifyOnOwnerChange: z.boolean(),
  notifyOnStageChange: z.boolean(),
  notifyOnHighValueStageMove: z.boolean(),
  highValueThreshold: z.number().min(0).max(1_000_000_000),
  // AI & Intelligence — defaults FALSE (opt-in; playbook §7)
  aiDuplicateDetection: z.boolean(),
  aiDealScoring: z.boolean(),
  aiNextStepRecommendation: z.boolean(),
  aiTagSuggestions: z.boolean(),
  aiInsightGeneration: z.boolean(),
  aiWinLossPrediction: z.boolean(),
});
export type DealAutomationSettingsInput = z.infer<typeof dealAutomationSettingsSchema>;

// ─── Factory Defaults (shared between router seed + tests) ───────────────────

export const DEFAULT_DEAL_AUTOMATION: DealAutomationSettingsInput = {
  autoMergeOnExactNameAccount: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizeCurrency: true,
  autoCapitalizeDealNames: true,
  preventDeleteWithOpenTasks: true,
  notifyOnOwnerChange: false,
  notifyOnStageChange: false,
  notifyOnHighValueStageMove: false,
  highValueThreshold: 50000,
  aiDuplicateDetection: false,
  aiDealScoring: false,
  aiNextStepRecommendation: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiWinLossPrediction: false,
};

export const DEFAULT_DEAL_DUPLICATE_RULES: ReadonlyArray<DealDuplicateRuleInput> = [
  { field: 'name_account', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
  {
    field: 'name_amount_stage',
    matchStrategy: 'normalized',
    threshold: 100,
    isActive: true,
    sortOrder: 1,
  },
  {
    field: 'expected_close',
    matchStrategy: 'fuzzy',
    threshold: 85,
    isActive: false,
    sortOrder: 2,
  },
];

export const DEFAULT_DEAL_REQUIRED_FIELDS: ReadonlyArray<DealRequiredFieldInput> = [
  { fieldKey: 'accountId', isRequired: true },
  { fieldKey: 'ownerId', isRequired: true },
  { fieldKey: 'value', isRequired: false },
  { fieldKey: 'expectedCloseDate', isRequired: false },
  { fieldKey: 'stage', isRequired: false },
  { fieldKey: 'description', isRequired: false },
];

export const DEFAULT_DEAL_WIN_REASONS: ReadonlyArray<{
  category: 'WON';
  label: string;
  key: string;
}> = [
  { category: 'WON', label: 'Price', key: 'price' },
  { category: 'WON', label: 'Features', key: 'features' },
  { category: 'WON', label: 'Support', key: 'support' },
  { category: 'WON', label: 'Reputation', key: 'reputation' },
];

export const DEFAULT_DEAL_LOSS_REASONS: ReadonlyArray<{
  category: 'LOST';
  label: string;
  key: string;
}> = [
  { category: 'LOST', label: 'Price', key: 'price' },
  { category: 'LOST', label: 'Lost to Competitor', key: 'lost_to_competitor' },
  { category: 'LOST', label: 'No Decision', key: 'no_decision' },
  { category: 'LOST', label: 'Budget', key: 'budget' },
];

// ─── Utility: slugify label → key ───────────────────────────────────────────

// Hard upper bound to prevent polynomial-redos backtracking on
// adversarial input (the `^_+|_+$` alternation can interact with the
// preceding `[^a-z0-9]+` pass on pathological strings). Slugified deal
// reason keys never legitimately approach this size; the cap is a
// defensive guard, not a UX limit.
const MAX_LABEL_INPUT_LENGTH = 512;

export function generateDealReasonKey(label: string): string {
  return label
    .slice(0, MAX_LABEL_INPUT_LENGTH)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_{1,100}/, '')
    .replace(/_{1,100}$/, '');
}
