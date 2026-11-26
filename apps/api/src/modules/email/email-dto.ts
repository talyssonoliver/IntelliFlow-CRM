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
import { lookbackProgress } from './mail-sync-lookback';
import { SYNC_READ_CHECKS, hasGoogleCalendar } from './mail-sync-scopes';

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
  /** The history look-back's stored progress (absent on rows read without it). */
  lookbackImportTotal?: number | null;
  lookbackImportDone?: number | null;
  lookbackNextAt?: Date | null;
  lookbackBackoffCount?: number | null;
  /** Scopes the provider granted (OAuth mailboxes). */
  grantedScopes?: string[];
  /** MVP-013: the calendar sync's state and last finished round (absent on rows read without them). */
  calendarStatus?: string | null;
  calendarSyncedAt?: Date | null;
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

/**
 * MVP-013: whether the connected Google account let Aurora use its calendar. A calendar belongs to a
 * person, so only a user's own Google mailbox has one (null for the company mailbox and other kinds).
 * GRANTED says the permission is there; it does not say a sync has run.
 */
export function calendarAccessState(
  row: Pick<MailboxRowLike, 'kind' | 'scope' | 'grantedScopes'>
): 'GRANTED' | 'NOT_GRANTED' | null {
  if (row.kind !== 'GMAIL' || row.scope !== 'USER') return null;
  return hasGoogleCalendar(row.grantedScopes ?? []) ? 'GRANTED' : 'NOT_GRANTED';
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

/**
 * MVP-013: the state of the calendar sync of a user's Google mailbox that has the calendar permission:
 * ON, or NEEDS_RECONNECT when Google refused the sync's access (the permission was withdrawn); null
 * when there is no calendar to sync (see calendarAccessState).
 */
export function calendarSyncState(
  row: Pick<MailboxRowLike, 'kind' | 'scope' | 'grantedScopes' | 'calendarStatus'>
): 'ON' | 'NEEDS_RECONNECT' | null {
  if (calendarAccessState(row) !== 'GRANTED') return null;
  return row.calendarStatus === 'NEEDS_RECONNECT' ? 'NEEDS_RECONNECT' : 'ON';
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
    historyImport: lookbackProgress(row, new Date()),
    replySync: replySyncState(row),
    calendarAccess: calendarAccessState(row),
    calendarSync: calendarSyncState(row),
    calendarSyncedAt: row.calendarSyncedAt ? row.calendarSyncedAt.toISOString() : null,
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
