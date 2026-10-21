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

/** Executable / script types that are never accepted as email attachments. */
export const BLOCKED_ATTACHMENT_EXTENSIONS = [
  'exe',
  'bat',
  'cmd',
  'com',
  'scr',
  'pif',
  'msi',
  'js',
  'jse',
  'vbs',
  'vbe',
  'wsf',
  'ps1',
  'jar',
  'hta',
  'cpl',
  'lnk',
] as const;

/** 10 MB per attachment (base64 is ~4/3 of the bytes). */
export const MAX_EMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** At most 25 MB of attachments per message (most mail servers refuse more). */
export const MAX_EMAIL_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Whether a file name ends in an executable / script extension. */
export function isBlockedAttachmentName(fileName: string): boolean {
  const ext = fileName.includes('.') ? (fileName.split('.').pop() ?? '').toLowerCase() : '';
  return (BLOCKED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext);
}

const attachmentFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(EMAIL_LIMITS.maxAttachmentFileNameLength)
  .refine((v) => !hasHeaderInjection(v) && !v.includes('"'), { message: 'Invalid file name' })
  .refine((v) => !isBlockedAttachmentName(v), { message: 'This file type cannot be attached' });

const attachmentContentTypeSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[\w.+-]+\/[\w.+-]+$/);

export const emailAttachmentRefSchema = z
  .object({
    storagePath: storagePathSchema,
    // Checked again at send: the name sent with the path is client input too.
    fileName: attachmentFileNameSchema,
    contentType: attachmentContentTypeSchema,
    size: z.number().int().min(0).max(MAX_EMAIL_ATTACHMENT_BYTES),
  })
  .strict();
export type EmailAttachmentRef = z.infer<typeof emailAttachmentRefSchema>;

/** Input of `emailAttachments.upload` (compose attachments, owner ruling Q11). */
export const uploadEmailAttachmentInputSchema = z
  .object({
    fileName: attachmentFileNameSchema,
    contentType: attachmentContentTypeSchema,
    contentBase64: z
      .string()
      .min(1)
      .max(Math.ceil((MAX_EMAIL_ATTACHMENT_BYTES * 4) / 3) + 4)
      .regex(/^[A-Za-z0-9+/]+=*$/, { message: 'Invalid file content' }),
  })
  .strict();
export type UploadEmailAttachmentInput = z.infer<typeof uploadEmailAttachmentInputSchema>;

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
    const bytes = (data.attachments ?? []).reduce((sum, a) => sum + a.size, 0);
    if (bytes > MAX_EMAIL_TOTAL_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: 'Attachments may add up to at most 25 MB per message',
        path: ['attachments'],
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
  /** Recipients the mail server refused at send time (SMTP); the rest were sent. */
  rejected?: string[];
}
