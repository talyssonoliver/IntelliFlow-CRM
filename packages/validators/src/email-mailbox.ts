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
  SMTP_PORTS,
  SMTP_SECURITY_MODES,
  hasHeaderInjection,
} from '@intelliflow/domain';

export const mailboxKindSchema = z.enum(MAILBOX_KINDS);
export const mailboxScopeSchema = z.enum(MAILBOX_SCOPES);
export const mailboxStatusSchema = z.enum(MAILBOX_STATUSES);
export const mailboxErrorCodeSchema = z.enum(MAILBOX_ERROR_CODES);
export const smtpSecuritySchema = z.enum(SMTP_SECURITY_MODES);
export const oauthMailboxProviderSchema = z.enum(OAUTH_MAILBOX_PROVIDERS);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function isAcceptableMailHost(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => LABEL.test(label))) return false;
  // The top-level label must start with a letter: this refuses every IPv4
  // literal and numeric shorthand (8.8.8.8, 2130706433, 0x7f.1).
  return /^[a-z]/.test(labels[labels.length - 1] ?? '');
}

/** A public mail-server hostname (lower-cased). */
export const mailboxHostSchema = z.string().trim().toLowerCase().refine(isAcceptableMailHost, {
  message: 'Enter the mail server hostname (for example smtp.example.com)',
});

const noHeaderInjection = (value: string) => !hasHeaderInjection(value);

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

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(320)
  .refine(noHeaderInjection, { message: 'Invalid username' });

/** absent = keep, null = clear, string = replace. Never echoed back by the API. */
export const secretUpdateSchema = z
  .string()
  .min(1)
  .max(EMAIL_LIMITS.maxPasswordLength)
  .nullable()
  .optional();

export const saveSmtpMailboxInputSchema = z
  .object({
    scope: mailboxScopeSchema,
    smtpHost: mailboxHostSchema,
    smtpPort: z
      .number()
      .int()
      .refine((p) => (SMTP_PORTS as readonly number[]).includes(p), {
        message: `SMTP port must be one of ${SMTP_PORTS.join(', ')}`,
      }),
    smtpSecurity: smtpSecuritySchema,
    smtpUsername: usernameSchema,
    smtpPassword: secretUpdateSchema,
    fromAddress: mailboxAddressSchema,
    fromName: fromNameSchema.nullish().transform((v) => (v ? v : null)),
    imapHost: mailboxHostSchema.nullish().transform((v) => v ?? null),
    imapPort: z
      .literal(IMAP_PORT)
      .nullish()
      .transform((v) => v ?? null),
    imapUsername: usernameSchema.nullish().transform((v) => v ?? null),
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

/** What the API returns about a mailbox. Secrets appear only as booleans. */
export interface MailboxDto {
  id: string;
  scope: (typeof MAILBOX_SCOPES)[number];
  kind: (typeof MAILBOX_KINDS)[number];
  status: (typeof MAILBOX_STATUSES)[number];
  lastErrorCode: (typeof MAILBOX_ERROR_CODES)[number] | null;
  fromAddress: string;
  fromName: string | null;
  /** SMTP only; null for OAuth mailboxes. Hidden from non-admins for the company mailbox. */
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: (typeof SMTP_SECURITY_MODES)[number] | null;
  smtpUsername: string | null;
  hasSmtpPassword: boolean;
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
