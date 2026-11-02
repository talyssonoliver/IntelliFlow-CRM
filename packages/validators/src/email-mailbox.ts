/**
 * PG-207: user / company mailbox validators (ADR-085).
 *
 * Hosts are hostnames only: IP literals, numeric shorthands, local/internal
 * names and non-ASCII labels are refused at save time (CA-4); the API still
 * resolves and checks every address at connect time. Secrets use a tri-state:
 * absent = keep the stored value, null = clear it, string = replace it.
 * tenantId / userId are never client-supplied (strict objects).
 */
import { z } from 'zod';
import {
  EMAIL_LIMITS,
  IMAP_PORT,
  MAILBOX_KINDS,
  MAILBOX_SCOPES,
  MAILBOX_STATUSES,
  MAILBOX_ERROR_CODES,
  OAUTH_MAILBOX_PROVIDERS,
} from '@intelliflow/domain';
import {
  mailboxHostSchema,
  mailboxUsernameSchema,
  noHeaderInjection,
  secretUpdateSchema,
} from './mailbox-fields';
import { smtpEndpointInputShape, type SmtpEndpointDto } from './smtp-endpoint';
import { smtpAccountInputShape, type SmtpAccountDto } from './smtp-account';

export { mailboxHostSchema, secretUpdateSchema, smtpSecuritySchema } from './mailbox-fields';

export const mailboxKindSchema = z.enum(MAILBOX_KINDS);
export const mailboxScopeSchema = z.enum(MAILBOX_SCOPES);
export const mailboxStatusSchema = z.enum(MAILBOX_STATUSES);
export const mailboxErrorCodeSchema = z.enum(MAILBOX_ERROR_CODES);
export const oauthMailboxProviderSchema = z.enum(OAUTH_MAILBOX_PROVIDERS);

/** Mailbox address: valid, lower-cased, no CR/LF. */
export const mailboxAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(noHeaderInjection, { message: 'Invalid email address' })
  .pipe(z.email('Invalid email address'));

export const fromNameSchema = z
  .string()
  .trim()
  .max(EMAIL_LIMITS.maxFromNameLength)
  .refine((v) => noHeaderInjection(v) && !/[<>"]/.test(v), {
    message: 'The display name cannot contain line breaks, quotes or angle brackets',
  });

export const saveSmtpMailboxInputSchema = z
  .object({
    scope: mailboxScopeSchema,
    ...smtpEndpointInputShape,
    ...smtpAccountInputShape,
    fromAddress: mailboxAddressSchema,
    fromName: fromNameSchema.nullish().transform((v) => (v ? v : null)),
    imapHost: mailboxHostSchema.nullish().transform((v) => v ?? null),
    imapPort: z
      .literal(IMAP_PORT)
      .nullish()
      .transform((v) => v ?? null),
    imapUsername: mailboxUsernameSchema.nullish().transform((v) => v ?? null),
    imapPassword: secretUpdateSchema,
  })
  .strict();
export type SaveSmtpMailboxInput = z.infer<typeof saveSmtpMailboxInputSchema>;

export const mailboxScopeInputSchema = z.object({ scope: mailboxScopeSchema }).strict();
export type MailboxScopeInput = z.infer<typeof mailboxScopeInputSchema>;

export const oauthStartInputSchema = z
  .object({ provider: oauthMailboxProviderSchema, scope: mailboxScopeSchema })
  .strict();
export type OAuthStartInput = z.infer<typeof oauthStartInputSchema>;

export const oauthCompleteInputSchema = z
  .object({
    provider: oauthMailboxProviderSchema,
    code: z.string().min(1).max(4096),
    state: z.string().min(16).max(256),
  })
  .strict();
export type OAuthCompleteInput = z.infer<typeof oauthCompleteInputSchema>;

/**
 * What the API returns about a mailbox. Secrets appear only as booleans. The SMTP
 * fields come from SmtpEndpointDto and SmtpAccountDto: null for OAuth mailboxes,
 * and the endpoint and user name are hidden from non-admins for the company mailbox.
 */
export interface MailboxDto extends SmtpEndpointDto, SmtpAccountDto {
  id: string;
  scope: (typeof MAILBOX_SCOPES)[number];
  kind: (typeof MAILBOX_KINDS)[number];
  status: (typeof MAILBOX_STATUSES)[number];
  lastErrorCode: (typeof MAILBOX_ERROR_CODES)[number] | null;
  fromAddress: string;
  fromName: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  hasImapPassword: boolean;
  /** True when this mailbox can be scanned for bounce reports. */
  bounceReadingEnabled: boolean;
  accountAddress: string | null;
  updatedAt: string;
}

export interface OAuthProvidersAvailableDto {
  GMAIL: boolean;
  MICROSOFT: boolean;
}

export interface ConnectionTestResultDto {
  ok: boolean;
  code: (typeof MAILBOX_ERROR_CODES)[number] | null;
}
