/**
 * Contact Settings Validators - PG-182
 *
 * Zod schemas for contact duplicate-detection rules, required-field policy,
 * tag vocabulary, and automation settings.
 */

import { z } from 'zod';

// ─── Duplicate Rules ────────────────────────────────────────────────────────

export const duplicateRuleFieldSchema = z.enum(['email', 'phone', 'name_company']);
export type DuplicateRuleField = z.infer<typeof duplicateRuleFieldSchema>;

export const duplicateRuleStrategySchema = z.enum(['exact', 'normalized', 'fuzzy']);
export type DuplicateRuleStrategy = z.infer<typeof duplicateRuleStrategySchema>;

export const contactDuplicateRuleSchema = z.object({
  field: duplicateRuleFieldSchema,
  matchStrategy: duplicateRuleStrategySchema,
  threshold: z.number().int().min(0).max(100),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type ContactDuplicateRuleInput = z.infer<typeof contactDuplicateRuleSchema>;

export const updateContactDuplicateRulesSchema = z
  .object({
    rules: z.array(contactDuplicateRuleSchema).min(1, 'At least one rule is required'),
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
export type UpdateContactDuplicateRulesInput = z.infer<typeof updateContactDuplicateRulesSchema>;

// ─── Required Fields ────────────────────────────────────────────────────────

export const contactRequiredFieldKeySchema = z.enum([
  'email',
  'phone',
  'company',
  'jobTitle',
  'ownerId',
]);
export type ContactRequiredFieldKey = z.infer<typeof contactRequiredFieldKeySchema>;

export const contactRequiredFieldSchema = z.object({
  fieldKey: contactRequiredFieldKeySchema,
  isRequired: z.boolean(),
});
export type ContactRequiredFieldInput = z.infer<typeof contactRequiredFieldSchema>;

export const updateContactRequiredFieldsSchema = z
  .object({
    fields: z.array(contactRequiredFieldSchema).min(1, 'At least one field is required'),
  })
  .refine((data) => data.fields.find((f) => f.fieldKey === 'email')?.isRequired === true, {
    message: 'The email field must remain required',
    path: ['fields'],
  });
export type UpdateContactRequiredFieldsInput = z.infer<typeof updateContactRequiredFieldsSchema>;

// ─── Tags ───────────────────────────────────────────────────────────────────

export const TAG_COLOR_TOKENS = [
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

export const tagColorTokenSchema = z.enum(TAG_COLOR_TOKENS);
export type TagColorToken = z.infer<typeof tagColorTokenSchema>;

export const createContactTagSchema = z.object({
  name: z.string().min(1).max(60),
  colorToken: tagColorTokenSchema.default('slate'),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateContactTagInput = z.infer<typeof createContactTagSchema>;

export const updateContactTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60).optional(),
  colorToken: tagColorTokenSchema.optional(),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateContactTagInput = z.infer<typeof updateContactTagSchema>;

export const deleteContactTagSchema = z.object({
  id: z.string().min(1),
});
export type DeleteContactTagInput = z.infer<typeof deleteContactTagSchema>;

// ─── Automation ─────────────────────────────────────────────────────────────

export const contactAutomationSettingsSchema = z.object({
  autoMergeOnExactEmail: z.boolean(),
  notifyOnDuplicate: z.boolean(),
  restrictTagCreationToAdmins: z.boolean(),
  // Data hygiene (PG-182)
  normalizePhoneNumbers: z.boolean(),
  autoCapitalizeNames: z.boolean(),
  preventDeleteWithOpenDeals: z.boolean(),
  notifyOnOwnerChange: z.boolean(),
  // AI & Intelligence (PG-182)
  aiDuplicateDetection: z.boolean(),
  aiEnrichment: z.boolean(),
  aiTagSuggestions: z.boolean(),
  aiInsightGeneration: z.boolean(),
  aiAutoReplyDrafting: z.boolean(),
});
export type ContactAutomationSettingsInput = z.infer<typeof contactAutomationSettingsSchema>;
