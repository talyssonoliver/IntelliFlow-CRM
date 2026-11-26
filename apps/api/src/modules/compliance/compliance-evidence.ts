/**
 * Compliance evidence (PG-194).
 *
 * Every figure on the compliance dashboard comes from here, from rows that exist in the product for
 * one tenant. `collectEvidence` reads the rows (each group on its own, so one failing read makes
 * only its own controls "not measured"); `evaluateFrameworks` is pure: evidence in, frameworks out.
 *
 * Rules the evaluation keeps:
 * - A control is `pass`, `attention` or `not_measured`. Nothing is guessed: a control with no
 *   evidence in the product is `not_measured` and says what would be needed to measure it.
 * - A framework's score is the share of its MEASURED controls that pass. With no measured control it
 *   has no score (null), never a number.
 * - The overall score is the mean of the scores that exist, and says how many frameworks it covers.
 * - These are internal readiness checks on what the product can see. They are not a certification
 *   and the page says so.
 */
import { liveMembershipWhere, seatUserWhere, tenantUserWhere } from '@intelliflow/db';
import { PUBLISHED_TERMS_VERSION } from '@intelliflow/validators';

export type ControlState = 'pass' | 'attention' | 'not_measured';
export type FrameworkStatus = 'compliant' | 'attention' | 'critical' | 'not_measured';

export const FRAMEWORK_IDS = [
  'iso-27001',
  'iso-42001',
  'iso-14001',
  'gdpr',
  'adr-registry',
] as const;
export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

/** Score at or above which a framework is "compliant", and below which it is "critical". */
export const COMPLIANT_AT = 90;
export const ATTENTION_AT = 60;

/** Windows the evidence looks back over. */
export const SIGNIN_WINDOW_DAYS = 30;
export const AUDIT_WINDOW_DAYS = 30;
export const DSAR_HISTORY_DAYS = 365;
export const API_KEY_MAX_AGE_DAYS = 365;
export const OPEN_ERASURE_MAX_DAYS = 14;
/** Failed sign-ins only raise attention at this many failures and this share of all attempts. */
export const FAILED_SIGNIN_MIN = 5;
export const FAILED_SIGNIN_SHARE = 0.25;

const DAY_MS = 86_400_000;

export interface Control {
  id: string;
  name: string;
  state: ControlState;
  /** What was counted, in one sentence. Always present. */
  evidence: string;
  /** Where to act (a page in this product). */
  actionHref?: string;
  actionLabel?: string;
  /** Not measured only: what the product would need before it could measure this. */
  needed?: string;
}

export interface FrameworkDetail {
  label: string;
  value: string;
}

export interface Framework {
  id: FrameworkId;
  title: string;
  subtitle: string;
  icon: string;
  /** What the score covers, shown under it so nobody reads it as a certificate. */
  scope: string;
  score: number | null;
  status: FrameworkStatus;
  controls: Control[];
  details: FrameworkDetail[];
  counts: { passing: number; attention: number; notMeasured: number };
}

export interface Overview {
  generatedAt: string;
  frameworks: Framework[];
  overall: {
    score: number | null;
    measuredFrameworks: number;
    totalFrameworks: number;
    actionItems: number;
    notMeasuredControls: number;
  };
}

/** Counts and dates read from the tenant's own rows. A null group could not be read. */
export interface Evidence {
  now: Date;
  users: {
    seats: number;
    withMfa: number;
    admins: number;
    adminsWithMfa: number;
    unverified: number;
  } | null;
  audit: {
    entries30d: number;
    logins30d: number;
    failedLogins30d: number;
    leadsCreated30d: number;
  } | null;
  apiKeys: { active: number; neverExpire: number; older: number } | null;
  dsar: {
    open: number;
    overdue: number;
    completed12m: number;
    breached12m: number;
    openErasure: number;
    staleOpenErasure: number;
    activeRestrictions: number;
  } | null;
  bookings: { publicBookings: number; withoutConsent: number } | null;
  terms: { seats: number; accepted: number; publishedVersion: string } | null;
  retention: {
    documentPolicies: number;
    aiConversationDays: number | null;
    /** A memory policy row exists. With no row the platform default applies; with a null period, conversations are kept indefinitely. */
    memoryPolicyRow: boolean;
  } | null;
  ai: { events30d: number; highSeverity30d: number } | null;
}

/** The slice of the Prisma client the collector uses (a real or tenant-scoped client fits). */
export interface EvidenceDb {
  user: { count(args: unknown): Promise<number> };
  auditLogEntry: { count(args: unknown): Promise<number> };
  lead: { count(args: unknown): Promise<number> };
  aPIKey: { count(args: unknown): Promise<number> };
  dsarRequest: { count(args: unknown): Promise<number> };
  processingRestriction: { count(args: unknown): Promise<number> };
  appointment: { count(args: unknown): Promise<number> };
  termsAcceptance: {
    count(args: unknown): Promise<number>;
  };
  documentRetentionPolicy: { count(args: unknown): Promise<number> };
  tenantMemoryPolicy: {
    findUnique(args: unknown): Promise<{ conversationRetentionDays: number | null } | null>;
  };
  aIMonitoringEvent: { count(args: unknown): Promise<number> };
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

async function safely<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** True when every group of evidence could be read; an incomplete day is never stored as a snapshot. */
export function isCompleteEvidence(e: Evidence): boolean {
  return [e.users, e.audit, e.apiKeys, e.dsar, e.bookings, e.terms, e.retention, e.ai].every(
    (group) => group !== null
  );
}

export async function collectEvidence(
  db: EvidenceDb,
  tenantId: string,
  now: Date = new Date()
): Promise<Evidence> {
  // Terms are the firm's own users (people who take a seat). Security evidence (MFA, admins,
  // verified email) covers everyone who can access the tenant, live pinned staff included.
  const seats = seatUserWhere(tenantId, now);
  const people = tenantUserWhere(tenantId, now);
  const adminHere = {
    OR: [
      { tenantId, role: 'ADMIN' },
      {
        memberships: {
          some: { tenantId, role: 'ADMIN', ...liveMembershipWhere(now) },
        },
      },
    ],
  };
  const hasMfa = {
    mfaSettings: {
      is: { OR: [{ totpEnabled: true }, { smsEnabled: true }, { emailEnabled: true }] },
    },
  };
  const since30 = daysAgo(now, SIGNIN_WINDOW_DAYS);
  const since12m = daysAgo(now, DSAR_HISTORY_DAYS);
  const openStatuses = { in: ['PENDING_VERIFICATION', 'VERIFIED'] };

  const users = await safely(async () => {
    const [seatCount, withMfa, admins, adminsWithMfa, unverified] = await Promise.all([
      db.user.count({ where: people }),
      db.user.count({ where: { AND: [people, hasMfa] } }),
      db.user.count({ where: { AND: [people, adminHere] } }),
      db.user.count({ where: { AND: [people, adminHere, hasMfa] } }),
      db.user.count({ where: { AND: [people, { emailVerified: false }] } }),
    ]);
    return { seats: seatCount, withMfa, admins, adminsWithMfa, unverified };
  });

  const audit = await safely(async () => {
    const [entries30d, logins30d, failedLogins30d, leadsCreated30d] = await Promise.all([
      db.auditLogEntry.count({ where: { tenantId, timestamp: { gte: since30 } } }),
      db.auditLogEntry.count({ where: { tenantId, action: 'LOGIN', timestamp: { gte: since30 } } }),
      db.auditLogEntry.count({
        where: { tenantId, action: 'LOGIN_FAILED', timestamp: { gte: since30 } },
      }),
      db.lead.count({ where: { tenantId, createdAt: { gte: since30 } } }),
    ]);
    return { entries30d, logins30d, failedLogins30d, leadsCreated30d };
  });

  const apiKeys = await safely(async () => {
    const live = {
      tenantId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const [active, neverExpire, older] = await Promise.all([
      db.aPIKey.count({ where: live }),
      db.aPIKey.count({ where: { tenantId, isActive: true, expiresAt: null } }),
      db.aPIKey.count({
        where: { ...live, createdAt: { lt: daysAgo(now, API_KEY_MAX_AGE_DAYS) } },
      }),
    ]);
    return { active, neverExpire, older };
  });

  const dsar = await safely(async () => {
    const overdueOpen = {
      tenantId,
      status: 'VERIFIED',
      OR: [{ extendedUntil: { lt: now } }, { extendedUntil: null, slaDeadline: { lt: now } }],
    };
    const [open, overdue, completed12m, breached12m, openErasure, staleOpenErasure, restrictions] =
      await Promise.all([
        db.dsarRequest.count({ where: { tenantId, status: openStatuses } }),
        db.dsarRequest.count({ where: overdueOpen }),
        db.dsarRequest.count({
          where: { tenantId, status: 'COMPLETED', completedAt: { gte: since12m } },
        }),
        db.dsarRequest.count({
          where: { tenantId, clockBreached: true, completedAt: { gte: since12m } },
        }),
        db.dsarRequest.count({ where: { tenantId, type: 'ERASURE', status: openStatuses } }),
        db.dsarRequest.count({
          where: {
            tenantId,
            type: 'ERASURE',
            status: 'VERIFIED',
            receivedAt: { lt: daysAgo(now, OPEN_ERASURE_MAX_DAYS) },
          },
        }),
        db.processingRestriction.count({ where: { tenantId, liftedAt: null } }),
      ]);
    return {
      open,
      overdue,
      completed12m,
      breached12m,
      openErasure,
      staleOpenErasure,
      activeRestrictions: restrictions,
    };
  });

  const bookings = await safely(async () => {
    const publicWhere = { tenantId, bookedVia: 'PUBLIC_LINK' };
    const [publicBookings, withoutConsent] = await Promise.all([
      db.appointment.count({ where: publicWhere }),
      db.appointment.count({ where: { ...publicWhere, bookingConsentAt: null } }),
    ]);
    return { publicBookings, withoutConsent };
  });

  const terms = await safely(async () => {
    // Compared against the PUBLISHED version (server constant), never a version read from a
    // user-supplied acceptance row.
    const publishedVersion = PUBLISHED_TERMS_VERSION;
    const [seatCount, accepted] = await Promise.all([
      db.user.count({ where: seats }),
      db.user.count({
        where: {
          AND: [
            seats,
            { termsAcceptances: { some: { tenantId, termsVersion: publishedVersion } } },
          ],
        },
      }),
    ]);
    return { seats: seatCount, accepted, publishedVersion };
  });

  const retention = await safely(async () => {
    const [documentPolicies, memory] = await Promise.all([
      db.documentRetentionPolicy.count({ where: { tenantId } }),
      db.tenantMemoryPolicy.findUnique({
        where: { tenantId },
        select: { conversationRetentionDays: true },
      }),
    ]);
    return {
      documentPolicies,
      aiConversationDays: memory?.conversationRetentionDays ?? null,
      memoryPolicyRow: memory !== null && memory !== undefined,
    };
  });

  const ai = await safely(async () => {
    const [events30d, highSeverity30d] = await Promise.all([
      db.aIMonitoringEvent.count({ where: { tenantId, recordedAt: { gte: since30 } } }),
      db.aIMonitoringEvent.count({
        where: {
          tenantId,
          recordedAt: { gte: since30 },
          flagged: true,
          severity: { in: ['high', 'critical'] },
        },
      }),
    ]);
    return { events30d, highSeverity30d };
  });

  return { now, users, audit, apiKeys, dsar, bookings, terms, retention, ai };
}

// ---------------------------------------------------------------------------------------------
// Evaluation (pure)
// ---------------------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function unread(id: string, name: string, href?: string, label?: string): Control {
  return {
    id,
    name,
    state: 'not_measured',
    evidence: 'The evidence for this control could not be read just now.',
    needed: 'Reload to try again. If it persists, the evidence tables are not reachable.',
    actionHref: href,
    actionLabel: label,
  };
}

function control(
  id: string,
  name: string,
  state: ControlState,
  evidence: string,
  action?: { href: string; label: string }
): Control {
  return {
    id,
    name,
    state,
    evidence,
    ...(action ? { actionHref: action.href, actionLabel: action.label } : {}),
  };
}

function notMeasured(
  id: string,
  name: string,
  evidence: string,
  needed: string,
  action?: { href: string; label: string }
): Control {
  return {
    id,
    name,
    state: 'not_measured',
    evidence,
    needed,
    ...(action ? { actionHref: action.href, actionLabel: action.label } : {}),
  };
}

const TEAM = { href: '/settings/team', label: 'Open team settings' };
const MFA = { href: '/settings/security/mfa', label: 'Set up MFA' };
const SECURITY = { href: '/settings/security/mfa', label: 'Open security settings' };
const API_KEYS = { href: '/developers/apps', label: 'Review API keys' };
const REQUESTS = { href: '/settings/privacy-requests', label: 'Open data requests' };

type Users = NonNullable<Evidence['users']>;
type Audit = NonNullable<Evidence['audit']>;

function mfaControl(u: Users): Control {
  if (u.seats === 0) {
    return notMeasured('A.9.4-mfa', 'MFA adoption', 'No users in this firm.', 'At least one user.');
  }
  return control(
    'A.9.4-mfa',
    'MFA adoption',
    u.withMfa === u.seats ? 'pass' : 'attention',
    `${u.withMfa} of ${plural(u.seats, 'user')} have a second factor enabled.`,
    MFA
  );
}

function adminMfaControl(u: Users): Control {
  if (u.admins === 0) {
    return notMeasured(
      'A.9.2-admin-mfa',
      'Administrators use MFA',
      'No administrator accounts in this firm.',
      'At least one administrator.'
    );
  }
  return control(
    'A.9.2-admin-mfa',
    'Administrators use MFA',
    u.adminsWithMfa === u.admins ? 'pass' : 'attention',
    `${u.adminsWithMfa} of ${plural(u.admins, 'administrator')} have a second factor enabled.`,
    TEAM
  );
}

function verifiedControl(u: Users): Control {
  if (u.seats === 0) {
    return notMeasured(
      'A.5.17-verified',
      'Verified sign-in email',
      'No users in this firm.',
      'At least one user.'
    );
  }
  const evidence =
    u.unverified === 0
      ? `All ${plural(u.seats, 'user')} have a verified email.`
      : `${u.unverified} of ${plural(u.seats, 'user')} have not verified their email.`;
  return control(
    'A.5.17-verified',
    'Verified sign-in email',
    u.unverified === 0 ? 'pass' : 'attention',
    evidence,
    TEAM
  );
}

function auditControl(a: Audit): Control {
  const id = 'A.8.15-audit';
  const name = 'Audit log is recording';
  if (a.entries30d > 0) {
    return control(
      id,
      name,
      'pass',
      `${plural(a.entries30d, 'audit event')} in the last ${AUDIT_WINDOW_DAYS} days.`,
      SECURITY
    );
  }
  if (a.leadsCreated30d > 0) {
    return control(
      id,
      name,
      'attention',
      `${plural(a.leadsCreated30d, 'lead')} created in the last ${AUDIT_WINDOW_DAYS} days but no audit events recorded.`,
      SECURITY
    );
  }
  return notMeasured(
    id,
    name,
    `No audit events and no activity in the last ${AUDIT_WINDOW_DAYS} days.`,
    'Some activity in the firm, so recording can be compared with it.'
  );
}

// A failed sign-in is logged before the firm is known (the actor is the system), so the audit log
// holds none against this firm. Zero here is not evidence that nobody tried.
function failedLoginControl(a: Audit): Control {
  const id = 'A.8.16-failed-logins';
  const name = 'Failed sign-ins';
  if (a.failedLogins30d === 0) {
    return notMeasured(
      id,
      name,
      'Failed sign-ins are logged before the firm is known, so none can be counted against this firm.',
      'Failed sign-in events recorded against the firm the email belongs to.'
    );
  }
  const attempts = a.logins30d + a.failedLogins30d;
  const noisy =
    a.failedLogins30d >= FAILED_SIGNIN_MIN && a.failedLogins30d / attempts > FAILED_SIGNIN_SHARE;
  return control(
    id,
    name,
    noisy ? 'attention' : 'pass',
    `${a.failedLogins30d} failed of ${plural(attempts, 'sign-in attempt')} in the last ${SIGNIN_WINDOW_DAYS} days.`,
    SECURITY
  );
}

function apiKeyControl(k: NonNullable<Evidence['apiKeys']>): Control {
  const id = 'A.5.18-api-keys';
  const name = 'API key hygiene';
  if (k.active === 0) {
    return control(id, name, 'pass', 'No active API keys, so nothing to rotate.');
  }
  const bad = k.neverExpire + k.older;
  const evidence =
    bad === 0
      ? `${plural(k.active, 'active API key')}, all expiring and under ${API_KEY_MAX_AGE_DAYS} days old.`
      : `${plural(k.active, 'active API key')}: ${k.neverExpire} never expire and ${k.older} are older than ${API_KEY_MAX_AGE_DAYS} days.`;
  return control(id, name, bad === 0 ? 'pass' : 'attention', evidence, API_KEYS);
}

function securityControls(e: Evidence): Control[] {
  const out: Control[] = e.users
    ? [mfaControl(e.users), adminMfaControl(e.users), verifiedControl(e.users)]
    : [
        unread('A.9.4-mfa', 'MFA adoption', MFA.href, MFA.label),
        unread('A.9.2-admin-mfa', 'Administrators use MFA', TEAM.href, TEAM.label),
        unread('A.5.17-verified', 'Verified sign-in email', TEAM.href, TEAM.label),
      ];

  out.push(
    ...(e.audit
      ? [auditControl(e.audit), failedLoginControl(e.audit)]
      : [
          unread('A.8.15-audit', 'Audit log is recording'),
          unread('A.8.16-failed-logins', 'Failed sign-ins'),
        ])
  );
  out.push(
    e.apiKeys
      ? apiKeyControl(e.apiKeys)
      : unread('A.5.18-api-keys', 'API key hygiene', API_KEYS.href, API_KEYS.label)
  );

  out.push(
    notMeasured(
      'A.5.1-policies',
      'Information security policy approved',
      'The product does not store a security policy or its approval.',
      'A policy record with an approver and a review date.'
    ),
    notMeasured(
      'A.8.8-vulns',
      'Vulnerability management',
      'Dependency and vulnerability scans run in the build pipeline, outside the product data.',
      'A feed of scan results per release.'
    )
  );
  return out;
}

type Dsar = NonNullable<Evidence['dsar']>;

function slaControl(d: Dsar): Control {
  return control(
    'art12-sla',
    'Data requests answered on time',
    d.overdue === 0 && d.breached12m === 0 ? 'pass' : 'attention',
    `${d.open} open, ${d.overdue} past their deadline; ${d.breached12m} answered late in the last 12 months.`,
    REQUESTS
  );
}

function erasureControl(d: Dsar): Control {
  const evidence =
    d.staleOpenErasure === 0
      ? `${d.openErasure} erasure requests open, none waiting more than ${OPEN_ERASURE_MAX_DAYS} days.`
      : `${d.staleOpenErasure} verified erasure requests have waited more than ${OPEN_ERASURE_MAX_DAYS} days.`;
  return control(
    'art17-erasure',
    'Erasure requests handled',
    d.staleOpenErasure === 0 ? 'pass' : 'attention',
    evidence,
    REQUESTS
  );
}

function completionControl(d: Dsar): Control {
  const id = 'art15-completion';
  const name = 'Data requests completed';
  if (d.completed12m + d.open === 0) {
    return notMeasured(
      id,
      name,
      'No data subject requests in the last 12 months.',
      'At least one request, so completion can be observed.'
    );
  }
  const evidence = `${d.completed12m} completed in the last 12 months; ${d.open} still open, ${d.overdue} past their deadline.`;
  if (d.overdue > 0) return control(id, name, 'attention', evidence, REQUESTS);
  if (d.completed12m === 0) {
    // Only requests still inside their deadline: nothing late, nothing completed to judge yet.
    return notMeasured(
      id,
      name,
      evidence,
      'A completed request, so completion can be observed.',
      REQUESTS
    );
  }
  return control(id, name, 'pass', evidence, REQUESTS);
}

function consentControl(b: NonNullable<Evidence['bookings']>): Control {
  const id = 'art7-consent';
  const name = 'Consent recorded on public bookings';
  if (b.publicBookings === 0) {
    return notMeasured(
      id,
      name,
      'No bookings were made through a public booking link.',
      'A public booking, which records consent and its wording version.'
    );
  }
  return control(
    id,
    name,
    b.withoutConsent === 0 ? 'pass' : 'attention',
    `${b.publicBookings - b.withoutConsent} of ${plural(b.publicBookings, 'public booking')} carry a consent timestamp.`,
    { href: '/settings/appointments', label: 'Open booking settings' }
  );
}

function termsControl(t: NonNullable<Evidence['terms']>): Control {
  const id = 'terms-acceptance';
  const name = 'Terms accepted by users';
  if (t.seats === 0) {
    return notMeasured(id, name, 'No users in this firm.', 'At least one user.');
  }
  const evidence = `${t.accepted} of ${plural(t.seats, 'user')} accepted the published terms (${t.publishedVersion}).`;
  return control(id, name, t.accepted === t.seats ? 'pass' : 'attention', evidence, {
    href: '/terms',
    label: 'Open the terms',
  });
}

function noAiRetention(r: { memoryPolicyRow: boolean }): string {
  return r.memoryPolicyRow
    ? 'AI conversations are kept indefinitely (no period set)'
    : 'no AI conversation retention period set (platform default applies)';
}

function retentionControl(r: NonNullable<Evidence['retention']>): Control {
  const set = r.documentPolicies > 0 || r.aiConversationDays !== null;
  const ai =
    r.aiConversationDays === null
      ? noAiRetention(r)
      : `AI conversations kept ${r.aiConversationDays} days`;
  return control(
    'art5-retention',
    'Retention rules set',
    set ? 'pass' : 'attention',
    `${plural(r.documentPolicies, 'document retention rule')}; ${ai}.`,
    { href: '/settings/documents', label: 'Open document settings' }
  );
}

function gdprControls(e: Evidence): Control[] {
  const out: Control[] = e.dsar
    ? [slaControl(e.dsar), erasureControl(e.dsar), completionControl(e.dsar)]
    : [
        unread('art12-sla', 'Data requests answered on time', REQUESTS.href, REQUESTS.label),
        unread('art17-erasure', 'Erasure requests handled', REQUESTS.href, REQUESTS.label),
        unread('art15-completion', 'Data requests completed', REQUESTS.href, REQUESTS.label),
      ];

  out.push(
    e.bookings
      ? consentControl(e.bookings)
      : unread('art7-consent', 'Consent recorded on public bookings'),
    e.terms ? termsControl(e.terms) : unread('terms-acceptance', 'Terms accepted by users'),
    e.retention
      ? retentionControl(e.retention)
      : unread(
          'art5-retention',
          'Retention rules set',
          '/settings/documents',
          'Open document settings'
        )
  );

  out.push(
    notMeasured(
      'art28-dpa',
      'Data processing agreement signed',
      'DPA signatures are not stored per firm.',
      'A signature record per firm with the DPA version it signed.'
    ),
    notMeasured(
      'art28-subprocessors',
      'Sub-processor list current',
      'The sub-processor list has no version the product can compare against.',
      'A versioned sub-processor register and an acknowledgement per firm.'
    ),
    notMeasured(
      'art33-breach',
      'Breach register',
      'The product keeps no personal-data breach register.',
      'A breach log with detection and notification dates.'
    ),
    notMeasured(
      'art35-dpia',
      'Impact assessments',
      'The product stores no impact assessments.',
      'An assessment record with a review date.'
    )
  );
  return out;
}

function aiControls(e: Evidence): Control[] {
  const out: Control[] = [];
  if (!e.ai) {
    out.push(
      unread('ai-monitoring', 'AI monitoring is recording'),
      unread('ai-flags', 'Flagged AI events')
    );
  } else {
    out.push(
      e.ai.events30d === 0
        ? notMeasured(
            'ai-monitoring',
            'AI monitoring is recording',
            'No AI monitoring events in the last 30 days.',
            'AI features in use, so monitoring events exist.'
          )
        : control(
            'ai-monitoring',
            'AI monitoring is recording',
            'pass',
            `${plural(e.ai.events30d, 'monitoring event')} in the last 30 days.`,
            { href: '/agent-approvals/drift', label: 'Open AI monitoring' }
          ),
      e.ai.events30d === 0
        ? notMeasured(
            'ai-flags',
            'Flagged AI events',
            'No AI monitoring events in the last 30 days.',
            'AI features in use, so monitoring events exist.'
          )
        : control(
            'ai-flags',
            'Flagged AI events',
            e.ai.highSeverity30d === 0 ? 'pass' : 'attention',
            `${e.ai.highSeverity30d} high or critical flagged events in the last 30 days.`,
            { href: '/agent-approvals/drift', label: 'Open AI monitoring' }
          )
    );
  }
  if (!e.retention) {
    out.push(unread('ai-retention', 'AI conversation retention set'));
  } else {
    out.push(
      control(
        'ai-retention',
        'AI conversation retention set',
        e.retention.aiConversationDays === null ? 'attention' : 'pass',
        e.retention.aiConversationDays === null
          ? `${noAiRetention(e.retention)[0]!.toUpperCase()}${noAiRetention(e.retention).slice(1)}.`
          : `AI conversations are kept ${e.retention.aiConversationDays} days.`,
        { href: '/agent-approvals/drift', label: 'Open AI monitoring' }
      )
    );
  }
  out.push(
    notMeasured(
      'ai-impact',
      'AI impact assessment',
      'The product stores no AI impact assessments.',
      'An assessment record per AI feature with a review date.'
    ),
    notMeasured(
      'ai-oversight',
      'Human oversight of AI decisions',
      'Approvals exist per workflow but are not tied to an oversight policy.',
      'An oversight policy mapped to the approval workflows.'
    )
  );
  return out;
}

function environmentControls(): Control[] {
  return [
    notMeasured(
      'iso14001-ems',
      'Environmental management system',
      'The product holds no environmental data about the firm.',
      'An environmental policy, objectives and an audit register recorded per firm.'
    ),
    notMeasured(
      'iso14001-cert',
      'Certification status',
      'The product holds no certificate or audit dates for this standard.',
      'A certificate record with a certifying body and an expiry date.'
    ),
  ];
}

function decisionLogControls(): Control[] {
  return [
    notMeasured(
      'adr-log',
      'Architecture decision log',
      'Architecture decisions are kept in the platform ADR registry, not in a firm’s data.',
      'A decision register per firm, with status and review dates.',
      { href: '/governance/adr', label: 'Open the ADR registry' }
    ),
  ];
}

function summarise(controls: Control[]) {
  const passing = controls.filter((c) => c.state === 'pass').length;
  const attention = controls.filter((c) => c.state === 'attention').length;
  const notMeasuredCount = controls.length - passing - attention;
  const measured = passing + attention;
  const score = measured === 0 ? null : Math.round((passing / measured) * 100);
  let status: FrameworkStatus = 'not_measured';
  if (score !== null) {
    if (score >= COMPLIANT_AT) status = 'compliant';
    else if (score >= ATTENTION_AT) status = 'attention';
    else status = 'critical';
  }
  return { score, status, counts: { passing, attention, notMeasured: notMeasuredCount } };
}

function measuredDetail(controls: Control[]): FrameworkDetail {
  const c = summarise(controls).counts;
  return { label: 'Controls Passed', value: `${c.passing} of ${c.passing + c.attention} measured` };
}

export function evaluateFrameworks(e: Evidence): Framework[] {
  const sec = securityControls(e);
  const ai = aiControls(e);
  const env = environmentControls();
  const gdpr = gdprControls(e);
  const adr = decisionLogControls();

  const build = (
    base: Omit<Framework, 'score' | 'status' | 'counts' | 'controls' | 'details'>,
    controls: Control[],
    details: FrameworkDetail[]
  ): Framework => ({ ...base, ...summarise(controls), controls, details });

  const notMeasuredDetails = (controls: Control[]): FrameworkDetail[] => [
    { label: 'Status', value: 'Not measured' },
    { label: 'Needs', value: controls[0]?.needed ?? 'Evidence recorded in the product' },
  ];

  return [
    build(
      {
        id: 'iso-27001',
        title: 'ISO 27001',
        subtitle: 'InfoSec',
        icon: 'security',
        scope:
          'Share of the security controls the product can measure that pass. Not a certification.',
      },
      sec,
      [
        measuredDetail(sec),
        {
          label: 'MFA Adoption',
          value: e.users ? `${e.users.withMfa} of ${e.users.seats} users` : 'Not read',
        },
      ]
    ),
    build(
      {
        id: 'iso-42001',
        title: 'ISO 42001',
        subtitle: 'AI Mgmt',
        icon: 'smart_toy',
        scope: 'Share of the AI controls the product can measure that pass. Not a certification.',
      },
      ai,
      [
        measuredDetail(ai),
        {
          label: 'Flagged (30 days)',
          value: e.ai ? `${e.ai.highSeverity30d} high or critical` : 'Not read',
        },
      ]
    ),
    build(
      {
        id: 'iso-14001',
        title: 'ISO 14001',
        subtitle: 'Environment',
        icon: 'eco',
        scope: 'Nothing in the product measures this standard yet.',
      },
      env,
      notMeasuredDetails(env)
    ),
    build(
      {
        id: 'gdpr',
        title: 'GDPR',
        subtitle: 'Data Protection',
        icon: 'gavel',
        scope:
          'Share of the data-protection controls the product can measure that pass. Not legal advice.',
      },
      gdpr,
      [
        {
          label: 'Open Requests',
          value: e.dsar ? `${e.dsar.open} (${e.dsar.overdue} overdue)` : 'Not read',
        },
        {
          label: 'Active Restrictions',
          value: e.dsar ? String(e.dsar.activeRestrictions) : 'Not read',
        },
      ]
    ),
    build(
      {
        id: 'adr-registry',
        title: 'ADR Registry',
        subtitle: 'Architecture',
        icon: 'architecture',
        scope: 'Nothing in a firm’s data measures this yet.',
      },
      adr,
      notMeasuredDetails(adr)
    ),
  ];
}

export function buildOverview(e: Evidence): Overview {
  const frameworks = evaluateFrameworks(e);
  const scored = frameworks.filter((f) => f.score !== null);
  const overall =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, f) => sum + (f.score ?? 0), 0) / scored.length);
  return {
    generatedAt: e.now.toISOString(),
    frameworks,
    overall: {
      score: overall,
      measuredFrameworks: scored.length,
      totalFrameworks: frameworks.length,
      actionItems: frameworks.reduce((n, f) => n + f.counts.attention, 0),
      notMeasuredControls: frameworks.reduce((n, f) => n + f.counts.notMeasured, 0),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Trend (from stored snapshots only)
// ---------------------------------------------------------------------------------------------

export interface SnapshotPoint {
  day: string; // YYYY-MM-DD
  score: number | null;
  passing: number;
  attention: number;
  notMeasured: number;
}

export type Trend =
  | { state: 'available'; delta: number; since: string }
  | { state: 'pending'; reason: string };

/** Change in score between the oldest and the newest stored day. Needs two days with a score. */
export function trendFromSnapshots(points: SnapshotPoint[]): Trend {
  const scored = points.filter((p) => p.score !== null).sort((a, b) => a.day.localeCompare(b.day));
  if (scored.length < 2) {
    return { state: 'pending', reason: 'Trend starts tomorrow' };
  }
  const first = scored[0]!;
  const last = scored[scored.length - 1]!;
  return { state: 'available', delta: (last.score ?? 0) - (first.score ?? 0), since: first.day };
}

export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
