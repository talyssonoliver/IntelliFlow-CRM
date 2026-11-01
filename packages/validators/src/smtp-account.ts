/**
 * The SMTP account half of a mailbox: the user name and the password (#1103).
 * The endpoint half (host, port, security) lives in smtp-endpoint.ts. See that
 * module for why the two are kept apart.
 */
import { mailboxUsernameSchema, secretUpdateSchema } from './mailbox-fields';

/** The account field names, in form order. */
export const SMTP_ACCOUNT_FIELDS = ['smtpUsername', 'smtpPassword'] as const;
export type SmtpAccountField = (typeof SMTP_ACCOUNT_FIELDS)[number];

/** Zod shape of the account fields in the SMTP mailbox save input. */
export const smtpAccountInputShape = {
  smtpUsername: mailboxUsernameSchema,
  smtpPassword: secretUpdateSchema,
};

/** The account columns as stored (the password is decrypted by the field-encryption client). */
export interface SmtpAccountRow {
  smtpUsername: string | null;
  smtpPassword: string | null;
}

/** What the API returns about the account: the password only as a boolean. */
export interface SmtpAccountDto {
  smtpUsername: string | null;
  hasSmtpPassword: boolean;
}

/** An OAuth mailbox has no SMTP account. */
export const NO_SMTP_ACCOUNT: SmtpAccountRow = Object.freeze({
  smtpUsername: null,
  smtpPassword: null,
});

/** The account fields from their values (`undefined` password = keep the stored one). */
export function smtpAccountFields<P extends string | null | undefined>(
  username: string,
  password: P
): { smtpUsername: string; smtpPassword: P } {
  return { smtpUsername: username, smtpPassword: password };
}

/** The account as the API shows it. */
export function smtpAccountSummary(username: string | null, hasPassword: boolean): SmtpAccountDto {
  return { smtpUsername: username, hasSmtpPassword: hasPassword };
}

/** The account as the API shows it; `show: false` hides the user name, never the boolean. */
export function smtpAccountDto(row: SmtpAccountRow, show: boolean): SmtpAccountDto {
  return smtpAccountSummary(show ? row.smtpUsername : null, Boolean(row.smtpPassword));
}

/** Whether a stored password would be used for a different account than it was entered for. */
export function smtpAccountDiffers(
  stored: Pick<SmtpAccountRow, 'smtpUsername'>,
  next: Pick<SmtpAccountRow, 'smtpUsername'>
): boolean {
  return stored.smtpUsername !== next.smtpUsername;
}

/** Whether the user name and the password are both set. */
export function hasSmtpAccount(row: SmtpAccountRow): boolean {
  return Boolean(row.smtpUsername && row.smtpPassword);
}

/** The account part of a transport connection config; unset fields become empty strings. */
export function smtpAccountConfig(row: SmtpAccountRow): { username: string; password: string } {
  return { username: row.smtpUsername ?? '', password: row.smtpPassword ?? '' };
}
