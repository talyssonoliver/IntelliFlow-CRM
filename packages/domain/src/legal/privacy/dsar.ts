/**
 * PG-203 — data subject requests (spec Addendum A; owner rulings Q13/Q14/Q16-Q19).
 *
 * Canonical constants and pure rules shared by the validators, the application service,
 * the adapters and the DB CHECKs in migration 20261022120000_dsar_requests. The firm
 * (tenant) is the controller; a request is about one person, identified by the exact
 * normalised email within that firm.
 */

export const DSAR_REQUEST_TYPES = [
  'ACCESS',
  'RECTIFICATION',
  'ERASURE',
  'RESTRICTION',
  'PORTABILITY',
  'OBJECTION',
] as const;
export type DsarRequestType = (typeof DSAR_REQUEST_TYPES)[number];

export const DSAR_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED', 'COMPLETED', 'REJECTED'] as const;
export type DsarStatus = (typeof DSAR_STATUSES)[number];

export const DSAR_SOURCES = ['PUBLIC_FORM', 'STAFF'] as const;
export type DsarSource = (typeof DSAR_SOURCES)[number];

/** How staff checked the identity of a person who asked in person, by phone or by post. */
export const DSAR_IDENTITY_METHODS = [
  'IN_PERSON_ID',
  'KNOWN_CLIENT_CALLBACK',
  'SIGNED_LETTER',
  'OTHER',
] as const;
export type DsarIdentityMethod = (typeof DSAR_IDENTITY_METHODS)[number];

/** Art 21: an objection to direct marketing is absolute; any other objection is weighed. */
export const DSAR_OBJECTION_SCOPES = ['MARKETING', 'OTHER'] as const;
export type DsarObjectionScope = (typeof DSAR_OBJECTION_SCOPES)[number];

export const RESTRICTION_KINDS = ['RESTRICTION', 'OBJECTION'] as const;
export type RestrictionKind = (typeof RESTRICTION_KINDS)[number];

/**
 * What the automatic export withholds until the firm has reviewed it: free text (legal
 * privilege, third parties; only types, dates, statuses and counts are exported) and any
 * rows past the per-category cap, which are counted rather than silently dropped.
 */
export const DSAR_WITHHELD_CATEGORIES = [
  'NOTES',
  'ACTIVITY_TEXT',
  'TICKET_SUBJECTS',
  'MESSAGE_BODIES',
  'DOCUMENTS',
  'EXCESS_ROWS',
] as const;
export type DsarWithheldCategory = (typeof DSAR_WITHHELD_CATEGORIES)[number];

export const DSAR_LIMITS = {
  verificationHours: 24,
  exportHours: 72,
  maxExportDownloads: 5,
  capPerTenantEmailPerDay: 3,
  capPerIpPerHour: 10,
  capGlobalEmailPerDay: 3,
  resendCooldownMinutes: 60,
  singleAdminErasureDelayHours: 24,
  overdueRepeatDays: 3,
  slaWarnDays: 7,
  maxBackdateDays: 30,
  detailsMax: 2000,
  noteMax: 2000,
  identityNoteMin: 20,
  identityNoteMax: 500,
  marketingStopMethodMin: 10,
  exportRowCap: 500,
  maxExtensionMonths: 2,
} as const;

const MS_PER_HOUR = 3_600_000;

/** The marker domain of anonymised emails (`erased-<row id>@erased.invalid`). */
export const ERASED_EMAIL_DOMAIN = 'erased.invalid';

/** Trim and lowercase. No `+tag` folding: the subject is the exact address they verified. */
/**
 * The resolution note stored when an access request completes: the admin's note plus
 * one line listing what was withheld and why. It must fit `DSAR_LIMITS.noteMax`
 * (dsar_requests_resolutionNote_check), so the validator and the service both
 * measure this exact string (codex).
 */
export function accessResolutionNote(
  note: string,
  withheld: ReadonlyArray<{ category: string; count: number; reason: string }>
): string {
  if (withheld.length === 0) return note;
  const summary = withheld.map((w) => `${w.category}: ${w.count} (${w.reason})`).join('; ');
  return `${note}\nWithheld: ${summary}`;
}

export function normalizeSubjectEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isErasedEmail(email: string): boolean {
  return normalizeSubjectEmail(email).endsWith(`@${ERASED_EMAIL_DOMAIN}`);
}

/**
 * Add calendar months (Art 12(3) "one month"), keeping the time of day. When the target
 * month is shorter, the result is its last day (31 Jan + 1 month = 28/29 Feb).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTarget);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

interface DeadlineFields {
  slaDeadline: Date | null;
  extendedUntil: Date | null;
}

export function effectiveDeadline(request: DeadlineFields): Date | null {
  return request.extendedUntil ?? request.slaDeadline;
}

export function isTerminalDsarStatus(status: DsarStatus): boolean {
  return status === 'COMPLETED' || status === 'REJECTED';
}

/** One extension of 1-2 months, only while VERIFIED and before the original deadline. */
export function canExtend(
  request: DeadlineFields & { status: DsarStatus },
  months: number,
  now: Date
): boolean {
  return (
    request.status === 'VERIFIED' &&
    request.extendedUntil === null &&
    request.slaDeadline !== null &&
    now < request.slaDeadline &&
    Number.isInteger(months) &&
    months >= 1 &&
    months <= DSAR_LIMITS.maxExtensionMonths
  );
}

/** A rejection after the effective deadline is still allowed, but the clock was breached. */
export function rejectionIsLate(request: DeadlineFields, now: Date): boolean {
  const deadline = effectiveDeadline(request);
  return deadline !== null && now > deadline;
}

/** An access request closes at verification only when nothing at all was withheld. */
export function accessCompletesAtVerify(
  withheldCounts: Partial<Record<DsarWithheldCategory, number>>
): boolean {
  return Object.values(withheldCounts).every((count) => !count);
}

export type StaffErasureDecision =
  | { allowed: true }
  | { allowed: false; reason: 'SECOND_ADMIN_REQUIRED' | 'WAIT_24H' };

/**
 * A staff-logged erasure skips email verification, so it needs a second admin or, where the
 * firm has a single admin, a 24-hour cancellable pause. A deleted creator (NULL) counts as
 * another person only when two or more admins exist, so the check can never be skipped.
 */
export function staffErasureMayRun(input: {
  adminCount: number;
  createdById: string | null;
  resolvedById: string;
  createdAt: Date;
  now: Date;
}): StaffErasureDecision {
  if (input.adminCount >= 2) {
    return input.createdById === input.resolvedById
      ? { allowed: false, reason: 'SECOND_ADMIN_REQUIRED' }
      : { allowed: true };
  }
  const readyAt =
    input.createdAt.getTime() + DSAR_LIMITS.singleAdminErasureDelayHours * MS_PER_HOUR;
  return input.now.getTime() >= readyAt
    ? { allowed: true }
    : { allowed: false, reason: 'WAIT_24H' };
}
