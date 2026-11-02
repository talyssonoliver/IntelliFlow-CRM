/**
 * PG-207: field schemas shared by the mailbox validators (ADR-085). They sit in
 * their own module so smtp-endpoint.ts and smtp-account.ts can use them without
 * importing email-mailbox.ts, which composes those two (#1103).
 */
import { z } from 'zod';
import { EMAIL_LIMITS, SMTP_SECURITY_MODES, hasHeaderInjection } from '@intelliflow/domain';

export const smtpSecuritySchema = z.enum(SMTP_SECURITY_MODES);

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

export const noHeaderInjection = (value: string) => !hasHeaderInjection(value);

/** A mailbox login name: trimmed, 1-320 characters, no CR/LF. */
export const mailboxUsernameSchema = z
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
