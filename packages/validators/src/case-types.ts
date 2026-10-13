/**
 * PG-204: Module Settings — Case Types validators (ADR-076).
 *
 * Limits and required-field keys derive from the domain (DRY rule); colour
 * tokens are the PG-190 case-tag allowlist so the swatches, the validator and
 * the DB CHECK agree. Router outputs are explicit DTOs (no inferred Prisma
 * shapes leak to the web, #772).
 */
import { z } from 'zod';
import {
  CASE_TYPE_LIMITS,
  type CasePriority,
  type CaseRequiredFieldKey,
} from '@intelliflow/domain';
import { idSchema } from './common';
import { casePrioritySchema } from './case';
import { CASE_TAG_COLOR_TOKENS, caseRequiredFieldKeySchema } from './case-settings';

export const caseTypeColorTokenSchema = z.enum(CASE_TAG_COLOR_TOKENS);

export const caseTypeChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(CASE_TYPE_LIMITS.maxChecklistTitleLength),
});
export type CaseTypeChecklistItemInput = z.infer<typeof caseTypeChecklistItemSchema>;

const caseTypeFieldsSchema = z.object({
  name: z.string().trim().min(1).max(CASE_TYPE_LIMITS.maxNameLength),
  category: z
    .string()
    .trim()
    .max(CASE_TYPE_LIMITS.maxCategoryLength)
    .nullish()
    .transform((value) => (value ? value : null)),
  colorToken: caseTypeColorTokenSchema,
  defaultPriority: casePrioritySchema.nullable(),
  defaultSlaDays: z
    .number()
    .int()
    .min(CASE_TYPE_LIMITS.minSlaDays)
    .max(CASE_TYPE_LIMITS.maxSlaDays)
    .nullable(),
  requiredFields: z.array(caseRequiredFieldKeySchema).max(6),
  checklist: z.array(caseTypeChecklistItemSchema).max(CASE_TYPE_LIMITS.maxChecklistItems),
  isActive: z.boolean().default(true),
});

type CaseTypeFields = z.infer<typeof caseTypeFieldsSchema>;

/** Duplicate required keys and case-insensitive duplicate checklist steps, reported at the second row. */
function refineCaseType(data: CaseTypeFields, ctx: z.RefinementCtx): void {
  const seenKeys = new Map<string, number>();
  data.requiredFields.forEach((key, index) => {
    const first = seenKeys.get(key);
    if (first === undefined) {
      seenKeys.set(key, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate required field: items ${first + 1} and ${index + 1}`,
      path: ['requiredFields', index],
    });
  });

  const seenTitles = new Map<string, number>();
  data.checklist.forEach((item, index) => {
    const key = item.title.toLowerCase();
    const first = seenTitles.get(key);
    if (first === undefined) {
      seenTitles.set(key, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate checklist step: items ${first + 1} and ${index + 1}`,
      path: ['checklist', index, 'title'],
    });
  });
}

export const createCaseTypeSchema = caseTypeFieldsSchema.superRefine(refineCaseType);
export type CreateCaseTypeInput = z.infer<typeof createCaseTypeSchema>;

export const updateCaseTypeSchema = caseTypeFieldsSchema
  .extend({ id: idSchema })
  .superRefine(refineCaseType);
export type UpdateCaseTypeInput = z.infer<typeof updateCaseTypeSchema>;

export const deleteCaseTypeSchema = z.object({ id: idSchema });

/** `id: null` clears the default case type. */
export const setDefaultCaseTypeSchema = z.object({ id: idSchema.nullable() });
export type SetDefaultCaseTypeInput = z.infer<typeof setDefaultCaseTypeSchema>;

// ─── Duplicate type names (row DoD: "Zod superRefine for duplicate type names") ──

/**
 * The existing type whose name matches `candidate` case-insensitively (trimmed),
 * ignoring `excludeId` (the type being edited). The DB `lower(name)` unique index
 * is authoritative; this lets the dialog say so before a round-trip.
 */
export function findDuplicateCaseTypeName(
  existing: readonly { id: string; name: string }[],
  candidate: string,
  excludeId?: string | null
): string | null {
  const key = candidate.trim().toLowerCase();
  if (!key) return null;
  const match = existing.find((t) => t.id !== excludeId && t.name.trim().toLowerCase() === key);
  return match ? match.name : null;
}

export function caseTypeNameSchema(
  existing: readonly { id: string; name: string }[],
  excludeId?: string | null
) {
  return z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(CASE_TYPE_LIMITS.maxNameLength)
    .superRefine((name, ctx) => {
      const duplicate = findDuplicateCaseTypeName(existing, name, excludeId);
      if (duplicate) {
        ctx.addIssue({
          code: 'custom',
          message: `A case type named "${duplicate}" already exists.`,
        });
      }
    });
}

// ─── Output contracts ───────────────────────────────────────────────────────

export interface CaseTypeChecklistItemDto {
  id: string;
  title: string;
  sortOrder: number;
}

export interface CaseTypeDto {
  id: string;
  name: string;
  category: string | null;
  colorToken: string;
  defaultPriority: CasePriority | null;
  defaultSlaDays: number | null;
  requiredFields: CaseRequiredFieldKey[];
  isActive: boolean;
  isDefault: boolean;
  checklist: CaseTypeChecklistItemDto[];
  caseCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseTypeListDto {
  types: CaseTypeDto[];
  limits: typeof CASE_TYPE_LIMITS;
  canEdit: boolean;
}

/** Slim shape for the New Case picker (active types only). */
export interface CaseTypeOptionDto {
  id: string;
  name: string;
  category: string | null;
  colorToken: string;
  defaultPriority: CasePriority | null;
  defaultSlaDays: number | null;
  requiredFields: CaseRequiredFieldKey[];
  isDefault: boolean;
}

/** The case type shown on a case (read-only after creation). */
export interface CaseTypeSummaryDto {
  id: string;
  name: string;
  colorToken: string;
}
