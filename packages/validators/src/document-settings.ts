/**
 * Document Settings Validators - PG-186
 *
 * Zod schemas for document file-type config, duplicate detection rules,
 * required fields, tags, automation toggles, and retention policies.
 * Mirrors the PG-183 account-settings pattern.
 */

import { z } from 'zod';

// ─── Tag Color Tokens ────────────────────────────────────────────────────────

export const DOCUMENT_TAG_COLOR_TOKENS = [
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

export const documentTagColorTokenSchema = z.enum(DOCUMENT_TAG_COLOR_TOKENS);
export type DocumentTagColorToken = z.infer<typeof documentTagColorTokenSchema>;

// ─── General Config ──────────────────────────────────────────────────────────

export const documentGeneralConfigSchema = z.object({
  allowedMimeTypes: z.array(z.string().min(1)).default([]),
  maxUploadSizeMb: z.number().int().min(1).max(500),
  defaultRetentionDays: z.number().int().min(0),
  enableAntivirusScan: z.boolean(),
  quarantineOnDetect: z.boolean(),
  blockOnScanFailure: z.boolean(),
});
export type DocumentGeneralConfigInput = z.infer<typeof documentGeneralConfigSchema>;

// ─── Duplicate Rules ─────────────────────────────────────────────────────────

export const documentDuplicateFieldSchema = z.enum(['content_hash', 'filename_normalized']);
export type DocumentDuplicateField = z.infer<typeof documentDuplicateFieldSchema>;

export const documentDuplicateStrategySchema = z.enum(['exact', 'normalized']);
export type DocumentDuplicateStrategy = z.infer<typeof documentDuplicateStrategySchema>;

export const documentCollisionActionSchema = z.enum(['warn', 'skip', 'replace', 'version']);
export type DocumentCollisionAction = z.infer<typeof documentCollisionActionSchema>;

export const documentDuplicateRuleSchema = z.object({
  field: documentDuplicateFieldSchema,
  matchStrategy: documentDuplicateStrategySchema,
  collisionAction: documentCollisionActionSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type DocumentDuplicateRuleInput = z.infer<typeof documentDuplicateRuleSchema>;

export const updateDocumentDuplicateRulesSchema = z
  .object({
    rules: z.array(documentDuplicateRuleSchema).min(1, 'At least one rule is required'),
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
export type UpdateDocumentDuplicateRulesInput = z.infer<typeof updateDocumentDuplicateRulesSchema>;

// ─── Required Fields ─────────────────────────────────────────────────────────

export const documentRequiredFieldKeySchema = z.enum([
  'title',
  'description',
  'category',
  'tags',
  'expiresAt',
]);
export type DocumentRequiredFieldKey = z.infer<typeof documentRequiredFieldKeySchema>;

export const documentRequiredFieldSchema = z.object({
  fieldKey: documentRequiredFieldKeySchema,
  isRequired: z.boolean(),
});
export type DocumentRequiredFieldInput = z.infer<typeof documentRequiredFieldSchema>;

export const updateDocumentRequiredFieldsSchema = z
  .object({
    fields: z.array(documentRequiredFieldSchema).min(1, 'At least one field is required'),
  })
  .refine((data) => data.fields.find((f) => f.fieldKey === 'title')?.isRequired === true, {
    message: 'The title field must remain required',
    path: ['fields'],
  });
export type UpdateDocumentRequiredFieldsInput = z.infer<typeof updateDocumentRequiredFieldsSchema>;

// ─── Tags ────────────────────────────────────────────────────────────────────

export const createDocumentTagSchema = z.object({
  name: z.string().min(1).max(50),
  colorToken: documentTagColorTokenSchema.default('slate'),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateDocumentTagInput = z.infer<typeof createDocumentTagSchema>;

export const updateDocumentTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50).optional(),
  colorToken: documentTagColorTokenSchema.optional(),
  description: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDocumentTagInput = z.infer<typeof updateDocumentTagSchema>;

export const deleteDocumentTagSchema = z.object({
  id: z.string().min(1),
});
export type DeleteDocumentTagInput = z.infer<typeof deleteDocumentTagSchema>;

// ─── Custom Document Types ───────────────────────────────────────────────────

export const createDocumentTypeDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type CreateDocumentTypeDefinitionInput = z.infer<typeof createDocumentTypeDefinitionSchema>;

export const updateDocumentTypeDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDocumentTypeDefinitionInput = z.infer<typeof updateDocumentTypeDefinitionSchema>;

export const deleteDocumentTypeDefinitionSchema = z.object({
  id: z.string().min(1),
});
export type DeleteDocumentTypeDefinitionInput = z.infer<typeof deleteDocumentTypeDefinitionSchema>;

// ─── Automation Settings ─────────────────────────────────────────────────────

export const documentAutomationSettingsSchema = z.object({
  // Category 1 — wired in this PR
  normalizeFilename: z.boolean(),
  preventDeleteIfReferenced: z.boolean(),
  notifyOnOwnerChange: z.boolean(),
  restrictTagCreationToAdmins: z.boolean(),
  notifyOnDuplicate: z.boolean(),
  // Category 2 — follow-up (IFC-310 / IFC-312)
  autoVersionOnCollision: z.boolean(),
  autoDetectDuplicates: z.boolean(),
  autoExtractText: z.boolean(),
  autoClassifyCategory: z.boolean(),
  autoDetectPii: z.boolean(),
  aiTagSuggestions: z.boolean(),
  aiInsightGeneration: z.boolean(),
});
export type DocumentAutomationSettingsInput = z.infer<typeof documentAutomationSettingsSchema>;

// ─── Retention Policies ──────────────────────────────────────────────────────

export const documentRetentionPolicySchema = z.object({
  categoryKey: z.string().min(1).max(100),
  // Retention bounds per spec §3.4: minimum 1 day (0 == no retention, which
  // would defeat the purpose of a policy), maximum 36500 days = 100 years.
  retentionDays: z.number().int().min(1).max(36500),
  autoArchive: z.boolean(),
  legalHoldOverride: z.boolean(),
});
export type DocumentRetentionPolicyInput = z.infer<typeof documentRetentionPolicySchema>;

export const updateDocumentRetentionPoliciesSchema = z
  .object({
    // Must keep at least one policy — empty array is a compliance hole
    // (no retention rule = documents can live forever and miss legal
    // shredding obligations). Duplicate categoryKey entries are rejected
    // via superRefine so the UI can highlight the offending row.
    policies: z.array(documentRetentionPolicySchema).min(1),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.policies.forEach((policy, index) => {
      if (seen.has(policy.categoryKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate retention policy for category "${policy.categoryKey}"`,
          path: ['policies', index, 'categoryKey'],
        });
      }
      seen.add(policy.categoryKey);
    });
  });
export type UpdateDocumentRetentionPoliciesInput = z.infer<
  typeof updateDocumentRetentionPoliciesSchema
>;
