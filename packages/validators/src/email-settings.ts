/**
 * PG-207: tenant email settings, suppression list and the user-mail send
 * input (ADR-085). Limits come from the domain (DRY).
 */
import { z } from 'zod';
import {
  EMAIL_LIMITS,
  HARD_BOUNCE_ACTIONS,
  SUPPRESSION_REASONS,
  hasHeaderInjection,
} from '@intelliflow/domain';
import { idSchema } from './common';
import { mailboxAddressSchema } from './email-mailbox';

export const hardBounceActionSchema = z.enum(HARD_BOUNCE_ACTIONS);
export const suppressionReasonSchema = z.enum(SUPPRESSION_REASONS);

export const updateEmailSettingsInputSchema = z
  .object({
    allowTenantMailboxFallback: z.boolean().optional(),
    replyToAddress: mailboxAddressSchema.nullable().optional(),
    trackOpens: z.boolean().optional(),
    trackClicks: z.boolean().optional(),
    hardBounceAction: hardBounceActionSchema.optional(),
    softBounceThreshold: z
      .number()
      .int()
      .min(EMAIL_LIMITS.minSoftBounceThreshold)
      .max(EMAIL_LIMITS.maxSoftBounceThreshold)
      .optional(),
    notifySenderOnBounce: z.boolean().optional(),
  })
  .strict();
export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsInputSchema>;

export const addSuppressionInputSchema = z.object({ email: mailboxAddressSchema }).strict();
export type AddSuppressionInput = z.infer<typeof addSuppressionInputSchema>;

export const removeSuppressionInputSchema = z.object({ id: idSchema }).strict();
export type RemoveSuppressionInput = z.infer<typeof removeSuppressionInputSchema>;

export const listSuppressionsInputSchema = z
  .object({
    cursor: idSchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .optional();

const recipientSchema = z.email().refine((v) => !hasHeaderInjection(v));

/** Storage paths are `<tenantId>/<object>`; no traversal, no absolute paths. */
const storagePathSchema = z
  .string()
  .min(3)
  .max(512)
  .refine(
    (v) => !v.startsWith('/') && !v.split('/').some((s) => s === '..' || s === '.' || s === ''),
    {
      message: 'Invalid attachment path',
    }
  );

export const emailAttachmentRefSchema = z
  .object({
    storagePath: storagePathSchema,
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(EMAIL_LIMITS.maxAttachmentFileNameLength)
      .refine((v) => !hasHeaderInjection(v) && !v.includes('"'), { message: 'Invalid file name' }),
    contentType: z
      .string()
      .min(3)
      .max(255)
      .regex(/^[\w.+-]+\/[\w.+-]+$/),
    size: z.number().int().min(0),
  })
  .strict();
export type EmailAttachmentRef = z.infer<typeof emailAttachmentRefSchema>;

/** Input of `email.sendEmail` (user mail). */
export const sendUserEmailInputSchema = z
  .object({
    to: z.array(recipientSchema).min(1),
    cc: z.array(recipientSchema).optional(),
    bcc: z.array(recipientSchema).optional(),
    subject: z
      .string()
      .max(EMAIL_LIMITS.maxSubjectLength)
      .refine((v) => !hasHeaderInjection(v), { message: 'The subject cannot contain line breaks' }),
    htmlBody: z.string().max(EMAIL_LIMITS.maxHtmlBodyBytes),
    textBody: z.string().max(EMAIL_LIMITS.maxHtmlBodyBytes).optional(),
    attachments: z.array(emailAttachmentRefSchema).max(20).optional(),
    threadId: z.string().max(200).optional(),
    templateId: z.string().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    const total = data.to.length + (data.cc?.length ?? 0) + (data.bcc?.length ?? 0);
    if (total > EMAIL_LIMITS.maxRecipients) {
      ctx.addIssue({
        code: 'custom',
        message: `At most ${EMAIL_LIMITS.maxRecipients} recipients per message`,
        path: ['to'],
      });
    }
  });
export type SendUserEmailInput = z.infer<typeof sendUserEmailInputSchema>;

export interface EmailSettingsDto {
  allowTenantMailboxFallback: boolean;
  replyToAddress: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  hardBounceAction: (typeof HARD_BOUNCE_ACTIONS)[number];
  softBounceThreshold: number;
  notifySenderOnBounce: boolean;
  /** Whether the caller may edit tenant settings. */
  canEdit: boolean;
  /** Whether an active company mailbox exists. */
  companyMailboxAvailable: boolean;
  /** The company mailbox address, shown to members only when fallback is on. */
  companyMailboxAddress: string | null;
}

export interface SuppressionDto {
  id: string;
  email: string;
  reason: (typeof SUPPRESSION_REASONS)[number];
  source: 'DSN' | 'MANUAL';
  createdAt: string;
}

export interface SendUserEmailResultDto {
  id: string;
  status: 'SENT' | 'FAILED';
  /** Suppressed recipients that were skipped (owner ruling Q9). */
  skipped: string[];
}
