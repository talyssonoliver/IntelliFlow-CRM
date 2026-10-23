/**
 * PG-207: email signature validators. Names are unique per owner scope,
 * case-insensitively and after trimming. `buildSignatureNameSchema` carries
 * the duplicate-name superRefine (playbook §6); the signatures dialog builds
 * it from the loaded list and the router builds it from the stored rows, so
 * client and server reject duplicates the same way. The DB unique index is
 * the last line.
 */
import { z } from 'zod';
import { EMAIL_LIMITS, SIGNATURE_SCOPES } from '@intelliflow/domain';
import { idSchema } from './common';

export const signatureScopeSchema = z.enum(SIGNATURE_SCOPES);

const signatureNameSchema = z.string().trim().min(1).max(EMAIL_LIMITS.maxSignatureNameLength);
const signatureHtmlSchema = z.string().max(EMAIL_LIMITS.maxSignatureHtmlLength);

const normalizeName = (name: string) => name.trim().toLowerCase();

export const createEmailSignatureInputSchema = z
  .object({
    scope: signatureScopeSchema,
    name: signatureNameSchema,
    html: signatureHtmlSchema,
    isDefault: z.boolean().default(false),
  })
  .strict();
export type CreateEmailSignatureInput = z.infer<typeof createEmailSignatureInputSchema>;

export const updateEmailSignatureInputSchema = z
  .object({
    id: idSchema,
    name: signatureNameSchema.optional(),
    html: signatureHtmlSchema.optional(),
  })
  .strict();
export type UpdateEmailSignatureInput = z.infer<typeof updateEmailSignatureInputSchema>;

export const setDefaultSignatureInputSchema = z.object({ id: idSchema }).strict();
export const deleteSignatureInputSchema = z.object({ id: idSchema }).strict();

/**
 * Name check against the other signatures in the same owner scope.
 * `selfId` is the signature being renamed (its own name never conflicts).
 * `siblings` lets a list payload be checked for internal duplicates too; the
 * issue points at the second offender ("rows N and M").
 */
export function buildSignatureNameSchema(
  existing: ReadonlyArray<{ id: string; name: string }>,
  selfId?: string
) {
  const taken = new Set(existing.filter((s) => s.id !== selfId).map((s) => normalizeName(s.name)));
  return z
    .object({ name: signatureNameSchema, siblings: z.array(signatureNameSchema).optional() })
    .superRefine((data, ctx) => {
      if (taken.has(normalizeName(data.name))) {
        ctx.addIssue({
          code: 'custom',
          message: 'A signature with this name already exists',
          path: ['name'],
        });
      }
      const seen = new Map<string, number>();
      (data.siblings ?? []).forEach((name, index) => {
        const key = normalizeName(name);
        const first = seen.get(key);
        if (first === undefined) {
          seen.set(key, index);
          return;
        }
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate signature name "${name}" in rows ${first + 1} and ${index + 1}`,
          path: ['siblings', index],
        });
      });
    });
}

export interface EmailSignatureDto {
  id: string;
  scope: (typeof SIGNATURE_SCOPES)[number];
  name: string;
  /** Sanitised HTML. */
  html: string;
  isDefault: boolean;
  updatedAt: string;
}

export interface EmailSignatureListDto {
  mine: EmailSignatureDto[];
  org: EmailSignatureDto[];
  canManageOrg: boolean;
}
