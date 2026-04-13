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
