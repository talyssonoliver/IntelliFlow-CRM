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
  type SuppressionReason,
} from '@intelliflow/domain';
import {
  smtpAccountDto,
  smtpEndpointDto,
  type EmailSettingsDto,
  type EmailSignatureDto,
  type MailboxDto,
  type SmtpAccountRow,
  type SmtpEndpointRow,
  type SuppressionDto,
} from '@intelliflow/validators';
import { SYNC_READ_CHECKS } from './mail-sync-scopes';

/** A mailbox row; the SMTP columns come from SmtpEndpointRow and SmtpAccountRow (#1103). */
export interface MailboxRowLike extends SmtpEndpointRow, SmtpAccountRow {
  id: string;
  scope: string;
  kind: string;
  status: string;
  lastErrorCode: string | null;
  fromAddress: string;
  fromName: string | null;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  imapPassword: string | null;
  accountAddress: string | null;
  refreshToken: string | null;
  /** #1177 Outlook inbox sync: the last finished round (absent on rows read without it). */
  syncedAt?: Date | null;
  /** Scopes the provider granted (OAuth mailboxes). */
  grantedScopes?: string[];
  updatedAt: Date;
}

/**
 * MVP-001: whether replies are logged from this mailbox. ON when its kind has a sync reader and the
 * read permission was granted; NEEDS_RECONNECT when the kind can sync but the connection predates
 * the read permission; null when the kind does not sync (password mailboxes). MVP-011: a Gmail
 * mailbox without read is NEEDS_ADMIN_TRUST: Google grants read only once the Workspace admin trusts
 * Aurora, so reconnecting alone does not help.
 */
export function replySyncState(
  row: Pick<MailboxRowLike, 'kind' | 'grantedScopes'>
): 'ON' | 'NEEDS_RECONNECT' | 'NEEDS_ADMIN_TRUST' | null {
  const canRead = SYNC_READ_CHECKS[row.kind];
  if (!canRead) return null;
  if (canRead(row.grantedScopes ?? [])) return 'ON';
  return row.kind === 'GMAIL' ? 'NEEDS_ADMIN_TRUST' : 'NEEDS_RECONNECT';
}

/** Whether the bounce reader can scan this mailbox. */
export function canReadBounces(
  row: Pick<MailboxRowLike, 'kind' | 'imapHost' | 'imapPassword' | 'refreshToken'>
): boolean {
  if (row.kind === 'SMTP') return Boolean(row.imapHost && row.imapPassword);
  // Gmail's read permission (MVP-011) serves the inbox sync; its bounce reports are not scanned.
  // Zoho's reads serve the inbox sync too (MVP-001): no bounce scan either.
  if (row.kind === 'GMAIL' || row.kind === 'ZOHO') return false;
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
    ...smtpEndpointDto(row, show),
    ...smtpAccountDto(row, show),
    imapHost: show ? row.imapHost : null,
    imapPort: show ? row.imapPort : null,
    imapUsername: show ? row.imapUsername : null,
    hasImapPassword: Boolean(row.imapPassword),
    bounceReadingEnabled: canReadBounces(row),
    accountAddress: row.accountAddress,
    inboxSyncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
    replySync: replySyncState(row),
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
