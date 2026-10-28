/**
 * PG-207: allow-list mappers from Prisma rows to API DTOs (CA-3).
 *
 * Rows from the field-encryption client can carry plaintext secrets (reads)
 * or ciphertext (write results), so a row is never spread into a response:
 * each DTO picks its fields by name and turns secrets into booleans.
 */
import {
  EMAIL_SETTINGS_DEFAULTS,
  type HardBounceAction,
  type MailboxErrorCode,
  type MailboxKind,
  type MailboxScope,
  type MailboxStatus,
  type SignatureScope,
  type SmtpSecurityMode,
  type SuppressionReason,
} from '@intelliflow/domain';
import type {
  EmailSettingsDto,
  EmailSignatureDto,
  MailboxDto,
  SuppressionDto,
} from '@intelliflow/validators';

export interface MailboxRowLike {
  id: string;
  scope: string;
  kind: string;
  status: string;
  lastErrorCode: string | null;
  fromAddress: string;
  fromName: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: string | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  imapPassword: string | null;
  accountAddress: string | null;
  refreshToken: string | null;
  updatedAt: Date;
}

/** Whether the bounce reader can scan this mailbox. */
export function canReadBounces(
  row: Pick<MailboxRowLike, 'kind' | 'imapHost' | 'imapPassword' | 'refreshToken'>
): boolean {
  if (row.kind === 'SMTP') return Boolean(row.imapHost && row.imapPassword);
  return Boolean(row.refreshToken);
}

export function toMailboxDto(
  row: MailboxRowLike,
  options: { includeConnection: boolean }
): MailboxDto {
  const show = options.includeConnection;
  return {
    id: row.id,
    scope: row.scope as MailboxScope,
    kind: row.kind as MailboxKind,
    status: row.status as MailboxStatus,
    lastErrorCode: row.lastErrorCode as MailboxErrorCode | null,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    smtpHost: show ? row.smtpHost : null,
    smtpPort: show ? row.smtpPort : null,
    smtpSecurity: show ? (row.smtpSecurity as SmtpSecurityMode | null) : null,
    smtpUsername: show ? row.smtpUsername : null,
    hasSmtpPassword: Boolean(row.smtpPassword),
    imapHost: show ? row.imapHost : null,
    imapPort: show ? row.imapPort : null,
    imapUsername: show ? row.imapUsername : null,
    hasImapPassword: Boolean(row.imapPassword),
    bounceReadingEnabled: canReadBounces(row),
    accountAddress: row.accountAddress,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface EmailSettingsValues {
  allowTenantMailboxFallback: boolean;
  replyToAddress: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  hardBounceAction: HardBounceAction;
  softBounceThreshold: number;
  notifySenderOnBounce: boolean;
}

/** The stored settings, or the documented defaults when the tenant has no row. */
export function settingsValues(
  row: Partial<EmailSettingsValues> | null | undefined
): EmailSettingsValues {
  const d = EMAIL_SETTINGS_DEFAULTS;
  return {
    allowTenantMailboxFallback: row?.allowTenantMailboxFallback ?? d.allowTenantMailboxFallback,
    replyToAddress: row?.replyToAddress ?? d.replyToAddress,
    trackOpens: row?.trackOpens ?? d.trackOpens,
    trackClicks: row?.trackClicks ?? d.trackClicks,
    hardBounceAction: (row?.hardBounceAction as HardBounceAction | undefined) ?? d.hardBounceAction,
    softBounceThreshold: row?.softBounceThreshold ?? d.softBounceThreshold,
    notifySenderOnBounce: row?.notifySenderOnBounce ?? d.notifySenderOnBounce,
  };
}

export function toEmailSettingsDto(
  row: Partial<EmailSettingsValues> | null | undefined,
  viewer: {
    canEdit: boolean;
    companyMailboxAvailable: boolean;
    companyMailboxAddress: string | null;
  }
): EmailSettingsDto {
  return { ...settingsValues(row), ...viewer };
}

export function toSignatureDto(row: {
  id: string;
  scope: string;
  name: string;
  html: string;
  isDefault: boolean;
  updatedAt: Date;
}): EmailSignatureDto {
  return {
    id: row.id,
    scope: row.scope as SignatureScope,
    name: row.name,
    html: row.html,
    isDefault: row.isDefault,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSuppressionDto(row: {
  id: string;
  email: string;
  reason: string;
  source: string;
  createdAt: Date;
}): SuppressionDto {
  return {
    id: row.id,
    email: row.email,
    reason: row.reason as SuppressionReason,
    source: row.source as SuppressionDto['source'],
    createdAt: row.createdAt.toISOString(),
  };
}
