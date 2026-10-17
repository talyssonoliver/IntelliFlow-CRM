/**
 * PG-205: Module Settings — Contact Types validators (ADR-080).
 *
 * Limits, required-field keys and owner rules derive from the domain (DRY
 * rule); colour tokens are the contact tag allowlist so the swatches, the
 * validator and the DB CHECK agree. Inputs are strict: a type's `key`,
 * `isSystem` and `tenantId` are never client-supplied. Router outputs are
 * explicit DTOs (no inferred Prisma shapes leak to the web, #772).
 */
import { z } from 'zod';
import {
  CONTACT_TYPE_LIMITS,
  CONTACT_TYPE_OWNER_DEFAULTS,
  CONTACT_TYPE_REQUIRED_FIELD_KEYS,
  type ContactStatus,
  type ContactTypeOwnerDefault,
  type ContactTypeRequiredFieldKey,
} from '@intelliflow/domain';
import { idSchema } from './common';
import { contactStatusSchema } from './contact';
import { TAG_COLOR_TOKENS, tagColorTokenSchema } from './contact-settings';

export const CONTACT_TYPE_COLOR_TOKENS = TAG_COLOR_TOKENS;
export const contactTypeColorTokenSchema = tagColorTokenSchema;
export const contactTypeOwnerDefaultSchema = z.enum(CONTACT_TYPE_OWNER_DEFAULTS);
export const contactTypeRequiredFieldKeySchema = z.enum(CONTACT_TYPE_REQUIRED_FIELD_KEYS);

const contactTypeFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(CONTACT_TYPE_LIMITS.maxNameLength),
    colorToken: contactTypeColorTokenSchema.default('slate'),
    isActive: z.boolean().default(true),
    defaultStatus: contactStatusSchema.nullable().default(null),
    defaultDepartment: z
      .string()
      .trim()
      .max(CONTACT_TYPE_LIMITS.maxDepartmentLength)
      .nullish()
      .transform((value) => (value ? value : null)),
    defaultOwner: contactTypeOwnerDefaultSchema.default('CREATOR'),
    requiredFields: z
      .array(contactTypeRequiredFieldKeySchema)
      .max(CONTACT_TYPE_REQUIRED_FIELD_KEYS.length)
      .default([]),
    defaultTagIds: z.array(idSchema).max(CONTACT_TYPE_LIMITS.maxDefaultTags).default([]),
  })
  .strict();

type ContactTypeFields = z.infer<typeof contactTypeFieldsSchema>;

function reportDuplicates(
  values: readonly string[],
  path: 'requiredFields' | 'defaultTagIds',
  label: string,
  ctx: z.RefinementCtx
): void {
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const first = seen.get(value);
    if (first === undefined) {
      seen.set(value, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate ${label}: items ${first + 1} and ${index + 1}`,
      path: [path, index],
    });
  });
}

/** Duplicate required keys and duplicate default tags, reported at the second row. */
function refineContactType(data: ContactTypeFields, ctx: z.RefinementCtx): void {
  reportDuplicates(data.requiredFields, 'requiredFields', 'required field', ctx);
  reportDuplicates(data.defaultTagIds, 'defaultTagIds', 'default tag', ctx);
}

export const createContactTypeSchema = contactTypeFieldsSchema.superRefine(refineContactType);
export type CreateContactTypeInput = z.infer<typeof createContactTypeSchema>;

// isActive has no default here: an update that omits it must not reactivate an inactive type.
export const updateContactTypeSchema = contactTypeFieldsSchema
  .extend({ id: idSchema, isActive: z.boolean() })
  .strict()
  .superRefine(refineContactType);
export type UpdateContactTypeInput = z.infer<typeof updateContactTypeSchema>;

export const deleteContactTypeSchema = z.object({ id: idSchema });

/** `id: null` clears the default contact type. */
export const setDefaultContactTypeSchema = z.object({ id: idSchema.nullable() });
export type SetDefaultContactTypeInput = z.infer<typeof setDefaultContactTypeSchema>;

// ─── Duplicate type names (row DoD: "Zod superRefine for duplicate type names") ──

/**
 * The existing type whose name matches `candidate` case-insensitively (trimmed),
 * ignoring `excludeId` (the type being edited). The DB `lower(name)` unique index
 * is authoritative; this lets the dialog say so before a round-trip.
 */
export function findDuplicateContactTypeName(
  existing: readonly { id: string; name: string }[],
  candidate: string,
  excludeId?: string | null
): string | null {
  const key = candidate.trim().toLowerCase();
  if (!key) return null;
  const match = existing.find((t) => t.id !== excludeId && t.name.trim().toLowerCase() === key);
  return match ? match.name : null;
}

export function contactTypeNameSchema(
  existing: readonly { id: string; name: string }[],
  excludeId?: string | null
) {
  return z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(CONTACT_TYPE_LIMITS.maxNameLength)
    .superRefine((name, ctx) => {
      const duplicate = findDuplicateContactTypeName(existing, name, excludeId);
      if (duplicate) {
        ctx.addIssue({
          code: 'custom',
          message: `A contact type named "${duplicate}" already exists.`,
        });
      }
    });
}

// ─── Output contracts ───────────────────────────────────────────────────────

export interface ContactTypeDefaultTagDto {
  id: string;
  name: string;
}

export interface ContactTypeDto {
  id: string;
  key: string;
  name: string;
  colorToken: string;
  isSystem: boolean;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  defaultStatus: ContactStatus | null;
  defaultDepartment: string | null;
  defaultOwner: ContactTypeOwnerDefault;
  requiredFields: ContactTypeRequiredFieldKey[];
  defaultTags: ContactTypeDefaultTagDto[];
  contactCount: number;
}

export interface ContactTypeListDto {
  types: ContactTypeDto[];
  limits: typeof CONTACT_TYPE_LIMITS;
  canEdit: boolean;
}

/** Slim shape for the New/Edit Contact picker, list filter and badges. */
export interface ContactTypeOptionDto {
  id: string;
  key: string;
  name: string;
  colorToken: string;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  requiredFields: ContactTypeRequiredFieldKey[];
}
