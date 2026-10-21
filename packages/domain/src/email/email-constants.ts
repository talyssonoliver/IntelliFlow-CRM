/**
 * Email module constants — PG-207 (ADR-085).
 *
 * The single source for mailbox kinds, ports, bounce rules and settings
 * defaults. Validators derive their Zod enums from these arrays; the API and
 * the web settings page read the same values.
 */

import { ACCOUNT_OWNER_ADMIN_ROLES } from '../crm/account/territory/territory-constants';

export const MAILBOX_KINDS = ['SMTP', 'GMAIL', 'MICROSOFT'] as const;
export type MailboxKind = (typeof MAILBOX_KINDS)[number];

/** USER = the sender's own mailbox; TENANT = the admin-managed company mailbox. */
export const MAILBOX_SCOPES = ['USER', 'TENANT'] as const;
export type MailboxScope = (typeof MAILBOX_SCOPES)[number];

export const MAILBOX_STATUSES = ['ACTIVE', 'ERROR', 'DISCONNECTED'] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const SMTP_SECURITY_MODES = ['SSL', 'STARTTLS'] as const;
export type SmtpSecurityMode = (typeof SMTP_SECURITY_MODES)[number];

/** TLS submission ports only: 465 implicit TLS, 587/2525 STARTTLS or TLS. Port 25 is relay. */
export const SMTP_PORTS = [465, 587, 2525] as const;
export type SmtpPort = (typeof SMTP_PORTS)[number];

/** IMAP is used only for reading bounce reports, over implicit TLS. */
export const IMAP_PORT = 993;

export const OAUTH_MAILBOX_PROVIDERS = ['GMAIL', 'MICROSOFT'] as const;
export type OAuthMailboxProvider = (typeof OAUTH_MAILBOX_PROVIDERS)[number];

export const HARD_BOUNCE_ACTIONS = ['SUPPRESS', 'NONE'] as const;
export type HardBounceAction = (typeof HARD_BOUNCE_ACTIONS)[number];

/** COMPLAINT is not listed: bounce reports carry no complaints (ADR-085). */
export const SUPPRESSION_REASONS = ['HARD_BOUNCE', 'SOFT_BOUNCE_LIMIT', 'MANUAL'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const BOUNCE_KINDS = ['HARD', 'SOFT', 'DELAYED'] as const;
export type BounceKind = (typeof BOUNCE_KINDS)[number];

export const SIGNATURE_SCOPES = ['USER', 'ORG'] as const;
export type SignatureScope = (typeof SIGNATURE_SCOPES)[number];

/** Machine codes carried on send refusals so the web can show the right message. */
export const EMAIL_SEND_ERROR_CODES = [
  'NO_MAILBOX',
  'MAILBOX_ERROR',
  'ALL_SUPPRESSED',
  'SEND_FAILED',
] as const;
export type EmailSendErrorCode = (typeof EMAIL_SEND_ERROR_CODES)[number];

/** Coded transport failures; the provider's own text is never kept. */
export const MAILBOX_ERROR_CODES = [
  'AUTH_FAILED',
  'CONNECT_FAILED',
  'TLS_FAILED',
  'TIMEOUT',
  'REJECTED',
  'RATE_LIMITED',
  'TOKEN_REVOKED',
  'ATTACHMENT_UNAVAILABLE',
] as const;
export type MailboxErrorCode = (typeof MAILBOX_ERROR_CODES)[number];

/**
 * Roles allowed to change tenant email settings, the company mailbox, org
 * signatures and the suppression list. Same list as account owner admins, so
 * there is one role source.
 */
export const EMAIL_SETTINGS_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES;

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(EMAIL_SETTINGS_ADMIN_ROLES);

export function isEmailSettingsAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLE_SET.has(role);
}

/** Tenant settings used when no row exists. Tracking and notifications are opt-in. */
export const EMAIL_SETTINGS_DEFAULTS = {
  allowTenantMailboxFallback: false,
  replyToAddress: null,
  trackOpens: false,
  trackClicks: false,
  hardBounceAction: 'SUPPRESS',
  softBounceThreshold: 3,
  notifySenderOnBounce: false,
} as const satisfies {
  allowTenantMailboxFallback: boolean;
  replyToAddress: string | null;
  trackOpens: boolean;
  trackClicks: boolean;
  hardBounceAction: HardBounceAction;
  softBounceThreshold: number;
  notifySenderOnBounce: boolean;
};

export const EMAIL_LIMITS = {
  minSoftBounceThreshold: 1,
  maxSoftBounceThreshold: 10,
  /** Bounce reports older than this (from the record's sentAt) are not matched. */
  bounceMatchWindowDays: 30,
  /** Soft bounces are counted over this rolling window. */
  softBounceWindowDays: 30,
  maxSignaturesPerScope: 20,
  maxSignatureNameLength: 100,
  maxSignatureHtmlLength: 20_000,
  maxFromNameLength: 100,
  maxPasswordLength: 512,
  maxRecipients: 100,
  maxSubjectLength: 998,
  maxHtmlBodyBytes: 2 * 1024 * 1024,
  maxAttachmentFileNameLength: 255,
  maxDiagnosticLength: 200,
  bounceScanMessageLimit: 50,
  bounceScanMaxMessageBytes: 256 * 1024,
  bounceScanMaxSuppressions: 25,
  oauthStateTtlMinutes: 10,
  mailboxHourlySendCap: 100,
} as const;

export interface MailboxPreset {
  smtpHost: string;
  smtpPort: SmtpPort;
  smtpSecurity: SmtpSecurityMode;
  imapHost: string;
  imapPort: typeof IMAP_PORT;
}

/** Ready-made SMTP/IMAP endpoints for the two common providers (app password required). */
export const MAILBOX_PRESETS = {
  gmail: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecurity: 'SSL',
    imapHost: 'imap.gmail.com',
    imapPort: IMAP_PORT,
  },
  outlook: {
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecurity: 'STARTTLS',
    imapHost: 'outlook.office365.com',
    imapPort: IMAP_PORT,
  },
} as const satisfies Record<string, MailboxPreset>;
