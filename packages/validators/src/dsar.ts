/**
 * PG-203 — data subject request schemas (spec Addendum A, rounds 2-4).
 *
 * Public inputs are strict and carry no tenant, subject or request id the server did not
 * issue. Free text is control-character stripped and bounded. Tokens are the 43-character
 * base64url form of 32 random bytes. Which completion fields a request type requires is the
 * service's rule (it knows the stored type); these schemas bound their shapes.
 */
import { z } from 'zod';
import {
  DSAR_IDENTITY_METHODS,
  DSAR_LIMITS,
  accessResolutionNote,
  DSAR_OBJECTION_SCOPES,
  DSAR_REQUEST_TYPES,
  DSAR_STATUSES,
  DSAR_WITHHELD_CATEGORIES,
  EVENT_TYPE_LIMITS,
  type DsarIdentityMethod,
  type DsarObjectionScope,
  type DsarRequestType,
  type DsarSource,
  type DsarStatus,
  type DsarWithheldCategory,
} from '@intelliflow/domain';
import { idSchema } from './common';
import { stripControlChars } from './event-types';

export const dsarRequestTypeSchema = z.enum(DSAR_REQUEST_TYPES);
export const dsarStatusSchema = z.enum(DSAR_STATUSES);
export const dsarIdentityMethodSchema = z.enum(DSAR_IDENTITY_METHODS);
export const dsarObjectionScopeSchema = z.enum(DSAR_OBJECTION_SCOPES);
export const dsarWithheldCategorySchema = z.enum(DSAR_WITHHELD_CATEGORIES);

const subjectEmailSchema = z.string().trim().toLowerCase().max(320).pipe(z.email());

/** Bounded free text with control characters removed. */
function cleanText(min: number, max: number) {
  return z
    .string()
    .max(max * 2)
    .transform((value) => stripControlChars(value).trim())
    .pipe(z.string().min(min).max(max));
}

const handleSchema = z.string().trim().toLowerCase().min(1).max(EVENT_TYPE_LIMITS.handleMax);

/** 32 random bytes, base64url without padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// ─── Public ─────────────────────────────────────────────────────────────────────

export const dsarFirmLookupSchema = z.object({ handle: handleSchema }).strict();
export type DsarFirmLookupInput = z.infer<typeof dsarFirmLookupSchema>;

export const dsarSubmitSchema = z
  .object({
    handle: handleSchema,
    type: dsarRequestTypeSchema,
    email: subjectEmailSchema,
    details: cleanText(0, DSAR_LIMITS.detailsMax).optional(),
    objectionScope: dsarObjectionScopeSchema.optional(),
    consent: z.literal(true),
    // Any short value is accepted so the router can return a fake success to bots.
    __honeypot: z.string().max(200).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'OBJECTION' && !value.objectionScope) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose what you object to',
        path: ['objectionScope'],
      });
    }
    if (value.type !== 'OBJECTION' && value.objectionScope) {
      ctx.addIssue({ code: 'custom', message: 'Only for objections', path: ['objectionScope'] });
    }
  });
export type DsarSubmitInput = z.infer<typeof dsarSubmitSchema>;

export const dsarTokenInputSchema = z
  .object({
    requestId: idSchema,
    token: z.string().regex(TOKEN_PATTERN),
  })
  .strict();
export type DsarTokenInput = z.infer<typeof dsarTokenInputSchema>;

// ─── Admin ──────────────────────────────────────────────────────────────────────

export const dsarListSchema = z.object({ status: dsarStatusSchema.optional() }).strict();

export const dsarIdInputSchema = z.object({ id: idSchema }).strict();

export const dsarLogRequestSchema = z
  .object({
    type: dsarRequestTypeSchema,
    email: subjectEmailSchema,
    details: cleanText(0, DSAR_LIMITS.detailsMax).optional(),
    objectionScope: dsarObjectionScopeSchema.optional(),
    /** The day the firm received the request (may be earlier than today; the service bounds it). */
    receivedOn: z.iso.date(),
    receivedOnReason: cleanText(1, 500).optional(),
    identityMethod: dsarIdentityMethodSchema,
    identityNote: cleanText(DSAR_LIMITS.identityNoteMin, DSAR_LIMITS.identityNoteMax),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === 'OBJECTION' && !value.objectionScope) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose the objection scope',
        path: ['objectionScope'],
      });
    }
    // dsar_requests_objectionScope_check: only an objection carries a scope (codex).
    if (value.type !== 'OBJECTION' && value.objectionScope) {
      ctx.addIssue({ code: 'custom', message: 'Only for objections', path: ['objectionScope'] });
    }
  });
export type DsarLogRequestInput = z.infer<typeof dsarLogRequestSchema>;

export const dsarCompleteSchema = z
  .object({
    id: idSchema,
    note: cleanText(1, DSAR_LIMITS.noteMax),
    /** ERASURE: the admin confirms no legal hold or retention duty (SRA/AML, legal claims) applies. */
    noHoldConfirmed: z.literal(true).optional(),
    /** MARKETING objection: the admin confirms marketing has stopped, and says how. */
    marketingStoppedConfirmed: z.literal(true).optional(),
    marketingStopMethod: cleanText(DSAR_LIMITS.marketingStopMethodMin, 500).optional(),
  })
  .strict();
export type DsarCompleteInput = z.infer<typeof dsarCompleteSchema>;

export const dsarCompleteAccessSchema = z
  .object({
    id: idSchema,
    note: cleanText(1, DSAR_LIMITS.noteMax),
    withheld: z
      .array(
        z
          .object({
            category: dsarWithheldCategorySchema,
            count: z.number().int().min(0).max(100_000),
            reason: cleanText(1, 500),
          })
          .strict()
      )
      .max(DSAR_WITHHELD_CATEGORIES.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Stored as one note: the note plus the withholding reasons must fit the column.
    if (accessResolutionNote(value.note, value.withheld).length > DSAR_LIMITS.noteMax) {
      ctx.addIssue({
        code: 'custom',
        message: `The note and the withholding reasons together must fit in ${DSAR_LIMITS.noteMax} characters`,
        path: ['note'],
      });
    }
  });
export type DsarCompleteAccessInput = z.infer<typeof dsarCompleteAccessSchema>;

export const dsarExtendSchema = z
  .object({
    id: idSchema,
    months: z.union([z.literal(1), z.literal(2)]),
    reason: cleanText(10, 500),
  })
  .strict();

export const dsarRejectSchema = z
  .object({ id: idSchema, reason: cleanText(10, DSAR_LIMITS.noteMax) })
  .strict();

export const dsarCancelErasureSchema = z
  .object({ id: idSchema, reason: cleanText(10, 500) })
  .strict();

export const dsarLiftRestrictionSchema = z
  .object({ restrictionId: idSchema, note: cleanText(10, 500) })
  .strict();

/** Banner read: by record, so staff cannot probe arbitrary emails (security R3). */
export const restrictionForSchema = z
  .object({ entity: z.enum(['lead', 'contact']), id: idSchema })
  .strict();
export type RestrictionForInput = z.infer<typeof restrictionForSchema>;

// ─── Output contracts (explicit DTOs; no Prisma shapes leak to the web) ─────────

export interface DsarFirmDto {
  firmName: string;
  privacyUrl: string | null;
}

/** Always the same shape and message, whether or not the email matches anything. */
export interface DsarSubmitResultDto {
  message: string;
}

export interface DsarVerifyResultDto {
  type: DsarRequestType;
  dueDate: string;
  /** ACCESS/PORTABILITY: the export link was emailed (the token never returns to the browser). */
  exportEmailed: boolean;
}

export interface ProcessingRestrictionStatusDto {
  restricted: boolean;
  blocksMarketing: boolean;
  since: string | null;
}

export interface DsarRequestDto {
  id: string;
  type: DsarRequestType;
  status: DsarStatus;
  source: DsarSource;
  subjectEmail: string;
  details: string | null;
  objectionScope: DsarObjectionScope | null;
  identityMethod: DsarIdentityMethod | null;
  receivedOn: string;
  verifiedAt: string | null;
  slaDeadline: string | null;
  extendedUntil: string | null;
  effectiveDeadline: string | null;
  overdue: boolean;
  exportIssuedAt: string | null;
  /** A download link exists and has not expired: the admin can revoke it, whatever the status. */
  exportLinkActive: boolean;
  completedAt: string | null;
  resolutionNote: string | null;
  clockBreached: boolean;
  createdAt: string;
}

export interface DsarErasureResultDto {
  counts: Record<string, number>;
  checklist: Record<string, number>;
}

export interface DsarExportDto {
  generatedAt: string;
  processingInformation: {
    controller: { name: string; privacyUrl: string | null };
    purposes: string[];
    categories: string[];
    recipients: string[];
    retention: string;
    source: string;
    rights: string[];
    complaint: string;
    automatedDecisions: string;
  };
  data: Record<string, Array<Record<string, unknown>>>;
  withheld: Array<{ category: DsarWithheldCategory; count: number; note: string }>;
}
