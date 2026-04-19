/**
 * Account Settings Validators - PG-183
 *
 * Zod schemas for account hierarchy rules, industry taxonomy,
 * and custom fields. Mirrors the PG-178 lead-settings pattern.
 */

import { z } from 'zod';

// ─── Industry key normalization helper ──────────────────────────────────────

/**
 * Normalize a human-readable industry label into a snake_case machine key.
 * Example: "Software & SaaS" → "software_saas"
 */
export function generateIndustryKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ─── Default industries (canonical taxonomy) ────────────────────────────────

export const DEFAULT_ACCOUNT_INDUSTRIES: ReadonlyArray<{ label: string; key: string }> = [
  { label: 'Technology', key: 'technology' },
  { label: 'Software & SaaS', key: 'software_saas' },
  { label: 'Financial Services', key: 'financial_services' },
  { label: 'Healthcare', key: 'healthcare' },
  { label: 'Retail', key: 'retail' },
  { label: 'Manufacturing', key: 'manufacturing' },
  { label: 'Media', key: 'media' },
  { label: 'Consulting', key: 'consulting' },
  { label: 'Education', key: 'education' },
  { label: 'Government', key: 'government' },
  { label: 'Nonprofit', key: 'nonprofit' },
  { label: 'Other', key: 'other' },
];

// ─── Account Hierarchy Config ───────────────────────────────────────────────

export const accountHierarchyConfigSchema = z.object({
  maxDepth: z.number().int().min(1).max(10),
  requireParentForTiers: z.array(z.string().min(1).max(50)),
  preventCycles: z.boolean(),
});
export type AccountHierarchyConfigInput = z.infer<typeof accountHierarchyConfigSchema>;

// ─── Account Industry Option ────────────────────────────────────────────────

export const accountIndustryOptionSchema = z.object({
  label: z.string().min(1).max(100),
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Key must be lowercase letters, numbers, or underscores'),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});
export type AccountIndustryOptionInput = z.infer<typeof accountIndustryOptionSchema>;

export const createAccountIndustryOptionSchema = z.object({
  label: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type CreateAccountIndustryOptionInput = z.infer<typeof createAccountIndustryOptionSchema>;

export const updateAccountIndustryOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountIndustryOptionInput = z.infer<typeof updateAccountIndustryOptionSchema>;

export const deleteAccountIndustryOptionSchema = z.object({
  id: z.string().min(1),
});
export type DeleteAccountIndustryOptionInput = z.infer<typeof deleteAccountIndustryOptionSchema>;

// ─── Account Custom Field ───────────────────────────────────────────────────

export const accountCustomFieldDataTypeSchema = z.enum([
  'text',
  'number',
  'currency',
  'dropdown',
  'date',
  'boolean',
]);
export type AccountCustomFieldDataType = z.infer<typeof accountCustomFieldDataTypeSchema>;

export const createAccountCustomFieldSchema = z.object({
  fieldName: z.string().min(1).max(100),
  dataType: accountCustomFieldDataTypeSchema,
  options: z.object({ values: z.array(z.string()) }).optional(),
  isRequired: z.boolean().optional(),
});
export type CreateAccountCustomFieldInput = z.infer<typeof createAccountCustomFieldSchema>;

export const updateAccountCustomFieldSchema = createAccountCustomFieldSchema.extend({
  id: z.string().min(1),
});
export type UpdateAccountCustomFieldInput = z.infer<typeof updateAccountCustomFieldSchema>;

export const deleteAccountCustomFieldSchema = z.object({
  id: z.string().min(1),
});
export type DeleteAccountCustomFieldInput = z.infer<typeof deleteAccountCustomFieldSchema>;

// ─── Duplicate Rules ────────────────────────────────────────────────────────

export const accountDuplicateRuleFieldSchema = z.enum(['name', 'website', 'phone', 'name_address']);
export type AccountDuplicateRuleField = z.infer<typeof accountDuplicateRuleFieldSchema>;

export const accountDuplicateRuleStrategySchema = z.enum(['exact', 'normalized', 'fuzzy']);
export type AccountDuplicateRuleStrategy = z.infer<typeof accountDuplicateRuleStrategySchema>;

export const accountDuplicateRuleSchema = z.object({
  field: accountDuplicateRuleFieldSchema,
  matchStrategy: accountDuplicateRuleStrategySchema,
  threshold: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type AccountDuplicateRuleInput = z.infer<typeof accountDuplicateRuleSchema>;

export const updateAccountDuplicateRulesSchema = z
  .object({
    rules: z.array(accountDuplicateRuleSchema).min(1, 'At least one rule is required'),
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
export type UpdateAccountDuplicateRulesInput = z.infer<typeof updateAccountDuplicateRulesSchema>;

// ─── Required Fields ────────────────────────────────────────────────────────

export const accountRequiredFieldKeySchema = z.enum([
  'name',
  'industry',
  'website',
  'ownerId',
  'employees',
  'revenue',
]);
export type AccountRequiredFieldKey = z.infer<typeof accountRequiredFieldKeySchema>;

export const accountRequiredFieldSchema = z.object({
  fieldKey: accountRequiredFieldKeySchema,
  isRequired: z.boolean(),
});
export type AccountRequiredFieldInput = z.infer<typeof accountRequiredFieldSchema>;

export const updateAccountRequiredFieldsSchema = z
  .object({
    fields: z.array(accountRequiredFieldSchema).min(1, 'At least one field is required'),
  })
  .refine((data) => data.fields.find((f) => f.fieldKey === 'name')?.isRequired === true, {
    message: 'The name field must remain required',
    path: ['fields'],
  });
export type UpdateAccountRequiredFieldsInput = z.infer<typeof updateAccountRequiredFieldsSchema>;

// ─── Tags ───────────────────────────────────────────────────────────────────

// Reuse the TAG_COLOR_TOKENS palette from contact-settings semantics (same literal list).
export const ACCOUNT_TAG_COLOR_TOKENS = [
  'slate',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

export const accountTagColorTokenSchema = z.enum(ACCOUNT_TAG_COLOR_TOKENS);
export type AccountTagColorToken = z.infer<typeof accountTagColorTokenSchema>;

export const createAccountTagSchema = z.object({
  name: z.string().min(1).max(60),
  colorToken: accountTagColorTokenSchema.default('slate'),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateAccountTagInput = z.infer<typeof createAccountTagSchema>;

export const updateAccountTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60).optional(),
  colorToken: accountTagColorTokenSchema.optional(),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAccountTagInput = z.infer<typeof updateAccountTagSchema>;

export const deleteAccountTagSchema = z.object({
  id: z.string().min(1),
});
export type DeleteAccountTagInput = z.infer<typeof deleteAccountTagSchema>;

// ─── Automation ─────────────────────────────────────────────────────────────

export const accountAutomationSettingsSchema = z.object({
  autoAssignOwner: z.boolean(),
  autoLinkContactsByDomain: z.boolean(),
  preventDeleteWithOpenOpportunities: z.boolean(),
  notifyOnOwnerChange: z.boolean(),
  normalizeWebsiteDomain: z.boolean(),
  autoCapitalizeAccountNames: z.boolean(),
  notifyOnDuplicate: z.boolean(),
  restrictTagCreationToAdmins: z.boolean(),
  aiIndustryInference: z.boolean(),
  aiEnrichment: z.boolean(),
  aiTagSuggestions: z.boolean(),
  aiInsightGeneration: z.boolean(),
  aiAccountScoring: z.boolean(),
});
export type AccountAutomationSettingsInput = z.infer<typeof accountAutomationSettingsSchema>;
