/**
 * Case Settings Validators — PG-190 v2 (scope-up).
 *
 * Zod schemas for:
 *   - General (case prefix, default priority, auto-assign) — v1
 *   - Duplicate Detection — v2
 *   - Required Fields — v2
 *   - Tags — v2
 *   - Automation + AI toggles — v2
 */

import { z } from 'zod';
import { casePrioritySchema } from './case';

// ─── General (v1) ───────────────────────────────────────────────────────────

export const caseSettingsSchema = z
  .object({
    casePrefix: z
      .string()
      .min(1, 'Case prefix is required')
      .max(20, 'Case prefix must be 20 characters or fewer')
      .regex(/^[A-Z0-9-]+$/, 'Only uppercase letters, digits, and hyphens are allowed'),
    defaultPriority: casePrioritySchema,
    autoAssignEnabled: z.boolean(),
    autoAssignUserId: z.string().cuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.autoAssignEnabled && !data.autoAssignUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A user must be selected when auto-assign is enabled',
        path: ['autoAssignUserId'],
      });
    }
  });

export type CaseSettingsInput = z.infer<typeof caseSettingsSchema>;
export const updateCaseSettingsSchema = caseSettingsSchema;
export type UpdateCaseSettingsInput = z.infer<typeof updateCaseSettingsSchema>;

// ─── Duplicate Detection (v2) ───────────────────────────────────────────────

export const caseDuplicateRuleFieldSchema = z.enum(['title', 'client', 'deadline', 'externalId']);
export type CaseDuplicateRuleField = z.infer<typeof caseDuplicateRuleFieldSchema>;

export const caseDuplicateRuleStrategySchema = z.enum(['exact', 'fuzzy', 'normalized']);
export type CaseDuplicateRuleStrategy = z.infer<typeof caseDuplicateRuleStrategySchema>;

export const caseCollisionActionSchema = z.enum(['warn', 'block', 'merge']);
export type CaseCollisionAction = z.infer<typeof caseCollisionActionSchema>;

export const caseDuplicateRuleSchema = z.object({
  field: caseDuplicateRuleFieldSchema,
  matchStrategy: caseDuplicateRuleStrategySchema,
  collisionAction: caseCollisionActionSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type CaseDuplicateRuleInput = z.infer<typeof caseDuplicateRuleSchema>;

export const updateCaseDuplicateRulesSchema = z
  .object({
    rules: z.array(caseDuplicateRuleSchema),
  })
  .superRefine((data, ctx) => {
    const seen = new Map<string, number>();
    data.rules.forEach((rule, idx) => {
      const key = `${rule.field}::${rule.matchStrategy}`;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate rule: (${rule.field}, ${rule.matchStrategy}) is already defined at index ${first}`,
          path: ['rules', idx, 'matchStrategy'],
        });
      } else {
        seen.set(key, idx);
      }
    });
  });
export type UpdateCaseDuplicateRulesInput = z.infer<typeof updateCaseDuplicateRulesSchema>;

// ─── Required Fields (v2) ───────────────────────────────────────────────────

export const caseRequiredFieldKeySchema = z.enum([
  'title',
  'description',
  'deadline',
  'jurisdiction',
  'clientId',
  'assignedTo',
]);
export type CaseRequiredFieldKey = z.infer<typeof caseRequiredFieldKeySchema>;

export const caseRequiredFieldSchema = z.object({
  fieldKey: caseRequiredFieldKeySchema,
  isRequired: z.boolean(),
});
export type CaseRequiredFieldInput = z.infer<typeof caseRequiredFieldSchema>;

export const updateCaseRequiredFieldsSchema = z.object({
  fields: z.array(caseRequiredFieldSchema),
});
export type UpdateCaseRequiredFieldsInput = z.infer<typeof updateCaseRequiredFieldsSchema>;

// ─── Tags (v2) ──────────────────────────────────────────────────────────────

export const CASE_TAG_COLOR_TOKENS = [
  'slate',
  'blue',
  'red',
  'amber',
  'green',
  'violet',
  'rose',
  'teal',
] as const;
export const caseTagColorTokenSchema = z.enum(CASE_TAG_COLOR_TOKENS);
export type CaseTagColorToken = z.infer<typeof caseTagColorTokenSchema>;

export const createCaseTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(50, 'Tag name max 50 chars'),
  colorToken: caseTagColorTokenSchema,
  description: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateCaseTagInput = z.infer<typeof createCaseTagSchema>;

export const updateCaseTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50).optional(),
  colorToken: caseTagColorTokenSchema.optional(),
  description: z.string().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCaseTagInput = z.infer<typeof updateCaseTagSchema>;

export const deleteCaseTagSchema = z.object({ id: z.string().min(1) });
export type DeleteCaseTagInput = z.infer<typeof deleteCaseTagSchema>;

// ─── Automation + AI (v2) ───────────────────────────────────────────────────

export const caseAutomationSettingsSchema = z.object({
  // Workflow
  autoEscalateOverdue: z.boolean(),
  notifyOnAssignmentChange: z.boolean(),
  notifyOnDeadlineApproaching: z.boolean(),
  notifyOnStatusChange: z.boolean(),
  // Data hygiene
  notifyOnDuplicate: z.boolean(),
  restrictTagCreationToAdmins: z.boolean(),
  preventDeleteWithOpenTasks: z.boolean(),
  // AI toggles (default FALSE — explicit opt-in)
  aiCaseSummarization: z.boolean(),
  aiPriorityPrediction: z.boolean(),
  aiResolutionSuggestion: z.boolean(),
  aiTagSuggestions: z.boolean(),
  aiInsightGeneration: z.boolean(),
});
export type CaseAutomationSettingsInput = z.infer<typeof caseAutomationSettingsSchema>;
export const updateCaseAutomationSettingsSchema = caseAutomationSettingsSchema.partial();
export type UpdateCaseAutomationSettingsInput = z.infer<typeof updateCaseAutomationSettingsSchema>;

export const DEFAULT_CASE_AUTOMATION: CaseAutomationSettingsInput = {
  autoEscalateOverdue: false,
  notifyOnAssignmentChange: true,
  notifyOnDeadlineApproaching: true,
  notifyOnStatusChange: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  preventDeleteWithOpenTasks: true,
  aiCaseSummarization: false,
  aiPriorityPrediction: false,
  aiResolutionSuggestion: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

export const DEFAULT_CASE_DUPLICATE_RULES: CaseDuplicateRuleInput[] = [
  { field: 'title', matchStrategy: 'fuzzy', collisionAction: 'warn', isActive: true, sortOrder: 0 },
  {
    field: 'externalId',
    matchStrategy: 'exact',
    collisionAction: 'block',
    isActive: false,
    sortOrder: 1,
  },
];

export const DEFAULT_CASE_REQUIRED_FIELDS: CaseRequiredFieldInput[] = [
  { fieldKey: 'title', isRequired: true },
  { fieldKey: 'clientId', isRequired: true },
  { fieldKey: 'assignedTo', isRequired: true },
  { fieldKey: 'description', isRequired: false },
  { fieldKey: 'deadline', isRequired: false },
  { fieldKey: 'jurisdiction', isRequired: false },
];
