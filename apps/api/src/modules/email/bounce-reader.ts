/**
 * Bounce reader (PG-207, owner ruling Q8; ADR-085).
 *
 * User mail leaves from the user's own mailbox, so bounce reports come back
 * into that mailbox. This scans each connected mailbox for delivery-status
 * reports only (IMAP for SMTP mailboxes, Gmail API / Graph for OAuth ones),
 * matches each report to an email we sent and applies the tenant's rules.
 *
 * Safety:
 * - Mailboxes are claimed with a lease (`UPDATE … RETURNING id`, secrets
 *   never in raw SQL), so replicas never scan the same mailbox twice.
 * - A report counts only if it names our `X-IntelliFlow-Record` AND the
 *   original Message-ID of an email sent from the same mailbox and tenant in
 *   the last 30 days, and the failed recipient was on that email. Anything
 *   else is stored as an UNMATCHED receipt and never suppresses (CA-18).
 * - One receipt per (mailbox, report, recipient): a replay is a no-op.
 * - At most 25 suppressions per mailbox per scan; no mail content is stored.
 * - Failures back off exponentially; 5 in a row mark the mailbox ERROR.
 */
import { MailboxTransportError, parseDsn, type RawDsnMessage } from '@intelliflow/adapters';
import {
  EMAIL_LIMITS,
  classifyDsnStatus,
  evaluateBounce,
  normalizeEmail,
  type BounceKind,
  type MailboxErrorCode,
  type OAuthMailboxProvider,
} from '@intelliflow/domain';
import { canReadBounces, settingsValues, type EmailSettingsValues } from './email-dto';
import { prismaErrorCode } from './email-access';
import { getOAuthAccessToken, type MailboxTransports } from './mailbox-transport';

const DAY_MS = 86_400_000;
const SCAN_INTERVAL_MS = 10 * 60_000;
const LEASE_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 3600_000;
const OAUTH_OVERLAP_MS = 3600_000;
const RECEIPT_RETENTION_DAYS = 90;
const MAX_FAILURES = 5;
const MAILBOXES_PER_TICK = 20;

export interface BounceNotification {
  tenantId: string;
  userId: string;
  emailRecordId: string;
  recipient: string;
}

export interface BounceReaderDeps {
  /** The field-encryption Prisma client (each write is scoped by the mailbox's tenant). */
  prisma: any;
  transports: MailboxTransports;
  /** Creates the in-app notification through `db` (the receipt's transaction). */
  notify(notification: BounceNotification, db: unknown): Promise<void>;
  now(): Date;
}

export interface BounceScanReport {
  mailboxesScanned: number;
  receipts: number;
  suppressions: number;
  failures: number;
}

interface ScanMailbox {
  id: string;
  tenantId: string;
  kind: string;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  imapPassword: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: string | null;
  smtpUsername: string | null;
  smtpPassword: string | null;
  refreshToken: string | null;
  tokenVersion: number;
  imapUidValidity: bigint | null;
  /** BigInt in the database (Prisma returns a bigint). */
  imapLastUid: bigint | number | null;
  scanCursorAt: Date | null;
  createdAt: Date;
  failureCount: number;
}

interface MatchedRecord {
  id: string;
  userId: string | null;
  toEmail: string;
  ccEmails: string | null;
  bccEmails: string | null;
  metadata: Record<string, unknown> | null;
}

function recipientsOf(record: MatchedRecord): string[] {
  return [record.toEmail, record.ccEmails ?? '', record.bccEmails ?? '']
    .flatMap((list) => list.split(','))
    .map((a) => normalizeEmail(a))
    .filter(Boolean);
}

/** A mailbox this worker holds: its lease end doubles as the fence for writes. */
interface MailboxClaim {
  id: string;
  leaseUntil: Date;
}

/**
 * Claims the next due mailbox, just before it is scanned (a lease taken for a
 * whole batch could expire while earlier mailboxes are still being scanned).
 */
async function claimNextMailbox(deps: BounceReaderDeps, now: Date): Promise<MailboxClaim | null> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const rows: Array<{ id: string; lockedUntil: Date }> = await deps.prisma.$queryRaw`
    UPDATE email_mailboxes SET "lockedUntil" = ${leaseUntil}
    WHERE id IN (
      SELECT id FROM email_mailboxes
      WHERE status = 'ACTIVE' AND "nextScanAt" <= ${now}
        AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now})
      ORDER BY "nextScanAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "lockedUntil"`;
  const row = rows[0];
  return row ? { id: row.id, leaseUntil: row.lockedUntil } : null;
}

/**
 * Writes a scan's outcome only while this worker still holds the lease: if it
 * expired and another worker claimed the mailbox, that worker's state stands.
 * False when the lease was lost.
 */
async function releaseMailbox(
  deps: BounceReaderDeps,
  claim: MailboxClaim,
  data: Record<string, unknown>
): Promise<boolean> {
  try {
    await deps.prisma.emailMailbox.update({
      where: { id: claim.id, lockedUntil: claim.leaseUntil },
      data: { lockedUntil: null, ...data },
    });
    return true;
  } catch (error) {
    if (prismaErrorCode(error) === 'P2025') return false;
    throw error;
  }
}

/**
 * The cursor after an OAuth listing. A complete listing moves it to now (the
 * next scan re-reads the last hour, OAUTH_OVERLAP_MS, for late-indexed mail).
 * A truncated one stops at the last message read, offset by the overlap so the
 * next scan starts exactly there: a busy mailbox keeps making progress instead
 * of re-reading the same hour, and nothing unread is skipped (receipts dedupe
 * what is read twice).
 */
function oauthCursorAfter(listing: { resumeFrom: Date | null }, now: Date): Date {
  if (!listing.resumeFrom) return now;
  return new Date(Math.min(now.getTime(), listing.resumeFrom.getTime() + OAUTH_OVERLAP_MS));
}

/** Lists new report candidates and the cursor to store after processing them. */
async function listReports(
  deps: BounceReaderDeps,
  mailbox: ScanMailbox,
  now: Date
): Promise<{ messages: RawDsnMessage[]; cursor: Record<string, unknown> }> {
  if (mailbox.kind === 'SMTP') {
    const result = await deps.transports.imap.read(
      {
        host: mailbox.imapHost ?? '',
        port: mailbox.imapPort ?? 0,
        username: mailbox.imapUsername ?? '',
        password: mailbox.imapPassword ?? '',
      },
      {
        uidValidity: mailbox.imapUidValidity,
        // IMAP UIDs are 32-bit, so the stored BigInt converts exactly.
        lastUid: mailbox.imapLastUid === null ? null : Number(mailbox.imapLastUid),
        since: mailbox.scanCursorAt ?? mailbox.createdAt,
      },
      {
        limit: EMAIL_LIMITS.bounceScanMessageLimit,
        maxBytes: EMAIL_LIMITS.bounceScanMaxMessageBytes,
      }
    );
    return {
      messages: result.messages,
      cursor: {
        scanCursorAt: now,
        imapUidValidity: result.cursor.uidValidity,
        imapLastUid: result.cursor.lastUid,
      },
    };
  }
  const client = deps.transports.oauth(mailbox.kind as OAuthMailboxProvider);
  if (!client) throw new MailboxTransportError('CONNECT_FAILED');
  const token = await getOAuthAccessToken(deps.prisma, mailbox, deps.transports, now);
  const since = new Date((mailbox.scanCursorAt ?? mailbox.createdAt).getTime() - OAUTH_OVERLAP_MS);
  const listing = await client.listDsnSince(token, since, EMAIL_LIMITS.bounceScanMessageLimit);
  return { messages: listing.messages, cursor: { scanCursorAt: oauthCursorAfter(listing, now) } };
}

interface ScanState {
  /** The lease this scan holds; every receipt transaction re-asserts it. */
  claim: MailboxClaim;
  settings: EmailSettingsValues;
  suppressions: number;
  receipts: number;
  /** UNMATCHED receipts stored this scan (capped: forged reports can name many addresses). */
  unmatched: number;
}

const MAX_UNMATCHED_RECEIPTS_PER_SCAN = 100;

type DsnReport = NonNullable<ReturnType<typeof parseDsn>>;

/** The record a DSN refers to: same tenant + mailbox, header and Message-ID match, recent. */
async function findMatchedRecord(
  deps: BounceReaderDeps,
  mailbox: ScanMailbox,
  report: DsnReport,
  now: Date
): Promise<MatchedRecord | null> {
  if (!report.recordId || !report.originalMessageId) return null;
  return deps.prisma.emailRecord.findFirst({
    where: {
      id: report.recordId,
      tenantId: mailbox.tenantId,
      mailboxId: mailbox.id,
      messageIdHeader: report.originalMessageId,
      sentAt: { gte: new Date(now.getTime() - EMAIL_LIMITS.bounceMatchWindowDays * DAY_MS) },
    },
  });
}

interface MatchedBounce {
  mailbox: ScanMailbox;
  record: MatchedRecord;
  recordRecipients: string[];
  recipient: string;
  kind: Exclude<BounceKind, 'DELAYED'>;
  state: ScanState;
  now: Date;
}

/** Thrown (rolling the receipt back) when a scan has used its suppression budget. */
class SuppressionCapReached extends Error {}

/**
 * Serialises soft-bounce receipts per tenant and recipient until the
 * transaction ends. The threshold counts receipts across all the tenant's
 * mailboxes: without this, two scans could each count before the other
 * committed and both miss the threshold.
 */
async function lockSoftBounceCount(tx: any, tenantId: string, recipient: string): Promise<void> {
  const key = `email-soft-bounce:${tenantId}:${recipient}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;
}

/** Thrown (rolling the receipt back) when this scan's lease was taken over. */
class LeaseLost extends Error {}

/**
 * Re-asserts the lease inside a receipt transaction. The UPDATE locks the
 * mailbox row until the transaction ends, so a worker that took the mailbox
 * over waits for it, and a worker whose lease expired writes nothing.
 */
async function assertLeaseHeld(tx: any, claim: MailboxClaim): Promise<void> {
  const { count } = await tx.emailMailbox.updateMany({
    where: { id: claim.id, lockedUntil: claim.leaseUntil },
    data: { lockedUntil: claim.leaseUntil },
  });
  if (count === 0) throw new LeaseLost();
}

function listOf(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function addRecipient(list: unknown, recipient: string): string[] {
  return [...new Set([...listOf(list), recipient])];
}

/**
 * Inside the receipt transaction: marks the recipient bounced on the record
 * (BOUNCED once every recipient hard-bounced) and suppresses per the tenant's
 * rules. Returns the record's new metadata and whether a suppression was written.
 */
async function applyMatchedBounce(
  tx: any,
  b: MatchedBounce
): Promise<{ metadata: Record<string, unknown>; suppressed: boolean }> {
  // As stored now (under the mailbox lock), not as read when the report was matched.
  const current: { metadata: Record<string, unknown> | null } | null =
    await tx.emailRecord.findFirst({ where: { id: b.record.id }, select: { metadata: true } });
  const metadata = current?.metadata ?? b.record.metadata ?? {};
  // Every bounced recipient (shown as "Partly bounced"); BOUNCED needs every
  // recipient to have HARD-bounced, so hard bounces are tracked on their own.
  const bounced = addRecipient(metadata.bouncedRecipients, b.recipient);
  const hard =
    b.kind === 'HARD'
      ? addRecipient(metadata.hardBouncedRecipients, b.recipient)
      : listOf(metadata.hardBouncedRecipients);
  const allBounced = b.kind === 'HARD' && b.recordRecipients.every((r) => hard.includes(r));
  const nextMetadata = { ...metadata, bouncedRecipients: bounced, hardBouncedRecipients: hard };
  await tx.emailRecord.update({
    where: { id: b.record.id },
    data: {
      metadata: nextMetadata,
      ...(allBounced ? { status: 'BOUNCED', bouncedAt: b.now } : {}),
    },
  });

  const softCount =
    b.kind === 'SOFT'
      ? await tx.emailBounceReceipt.count({
          where: {
            tenantId: b.mailbox.tenantId,
            recipient: b.recipient,
            kind: 'SOFT',
            excludedFromCount: false,
            receivedAt: {
              gte: new Date(b.now.getTime() - EMAIL_LIMITS.softBounceWindowDays * DAY_MS),
            },
          },
        })
      : 0;
  const decision = evaluateBounce(b.kind, b.state.settings, softCount);
  if (!decision.suppress) return { metadata: nextMetadata, suppressed: false };
  // Past the per-scan cap the whole receipt rolls back and the scan stops here,
  // so the next scan applies this suppression instead of it being lost.
  if (b.state.suppressions >= EMAIL_LIMITS.bounceScanMaxSuppressions) {
    throw new SuppressionCapReached();
  }
  await tx.emailSuppression.upsert({
    where: { tenantId_email: { tenantId: b.mailbox.tenantId, email: b.recipient } },
    create: {
      tenantId: b.mailbox.tenantId,
      email: b.recipient,
      reason: decision.reason,
      source: 'DSN',
      emailRecordId: b.record.id,
    },
    update: {},
  });
  return { metadata: nextMetadata, suppressed: true };
}

type DsnEntry = DsnReport['recipients'][number];

interface ReceiptInput {
  mailbox: ScanMailbox;
  message: RawDsnMessage;
  entry: DsnEntry;
  kind: BounceKind;
  matched: MatchedRecord | null;
  recordRecipients: string[];
  state: ScanState;
  now: Date;
}

/**
 * Stores one receipt and, for a matched hard/soft bounce, applies it in the
 * same transaction. Null when this DSN recipient was already processed.
 */
async function recordReceiptOnce(
  deps: BounceReaderDeps,
  r: ReceiptInput
): Promise<{ metadata: Record<string, unknown> | null; suppressed: boolean } | null> {
  const { mailbox, message, entry, kind, matched } = r;
  // Unmatched receipts are only an audit trail; past the cap they are not stored.
  if (!matched && r.state.unmatched >= MAX_UNMATCHED_RECEIPTS_PER_SCAN) return null;
  if (!matched) r.state.unmatched += 1;
  try {
    return await deps.prisma.$transaction(async (tx: any) => {
      await assertLeaseHeld(tx, r.state.claim);
      if (matched && kind === 'SOFT')
        await lockSoftBounceCount(tx, mailbox.tenantId, entry.recipient);
      await tx.emailBounceReceipt.create({
        data: {
          tenantId: mailbox.tenantId,
          mailboxId: mailbox.id,
          dsnKey: message.key,
          recipient: entry.recipient,
          emailRecordId: matched ? matched.id : null,
          kind: matched ? kind : 'UNMATCHED',
          statusCode: entry.status || null,
          diagnostic: entry.diagnostic,
          matchConfidence: matched ? 'HIGH' : 'LOW',
          receivedAt: message.receivedAt,
        },
      });
      if (!matched || kind === 'DELAYED') return { metadata: null, suppressed: false };
      const applied = await applyMatchedBounce(tx, {
        mailbox,
        record: matched,
        recordRecipients: r.recordRecipients,
        recipient: entry.recipient,
        kind,
        state: r.state,
        now: r.now,
      });
      // In the same transaction: a failed notification rolls the receipt back,
      // so the next scan retries it instead of skipping it as already processed.
      if (shouldNotifySender(matched, kind, r.state.settings)) {
        await deps.notify(
          {
            tenantId: mailbox.tenantId,
            userId: matched.userId,
            emailRecordId: matched.id,
            recipient: entry.recipient,
          },
          tx
        );
      }
      return applied;
    });
  } catch (error) {
    // Already processed (unique receipt): idempotent no-op.
    if (prismaErrorCode(error) === 'P2002') return null;
    throw error;
  }
}

function shouldNotifySender(
  matched: MatchedRecord | null,
  kind: BounceKind,
  settings: EmailSettingsValues
): matched is MatchedRecord & { userId: string } {
  return Boolean(matched?.userId) && kind !== 'DELAYED' && settings.notifySenderOnBounce;
}

async function processReport(
  deps: BounceReaderDeps,
  mailbox: ScanMailbox,
  message: RawDsnMessage,
  state: ScanState,
  now: Date
): Promise<void> {
  const report = parseDsn(message.raw);
  if (!report) return;

  let record = await findMatchedRecord(deps, mailbox, report, now);
  const recordRecipients = record ? recipientsOf(record) : [];

  for (const entry of report.recipients) {
    const kind = classifyDsnStatus(entry.action, entry.status);
    if (!kind) continue;
    const matched = recordRecipients.includes(entry.recipient) ? record : null;

    const outcome = await recordReceiptOnce(deps, {
      mailbox,
      message,
      entry,
      kind,
      matched,
      recordRecipients,
      state,
      now,
    });
    if (!outcome) continue;
    // Later recipients of the same report build on this one's bounced list.
    if (outcome.metadata) record = { ...matched!, metadata: outcome.metadata };
    state.receipts += 1;
    state.suppressions += outcome.suppressed ? 1 : 0;
  }
}

/**
 * Processes the reports in order. Stops at the first one whose suppression
 * would pass the per-scan cap (its receipt rolled back); `lastDone` is the last
 * report fully applied.
 */
async function processReports(
  deps: BounceReaderDeps,
  mailbox: ScanMailbox,
  messages: RawDsnMessage[],
  state: ScanState,
  now: Date
): Promise<{ stopped: boolean; lastDone: RawDsnMessage | null }> {
  let lastDone: RawDsnMessage | null = null;
  for (const message of messages) {
    try {
      await processReport(deps, mailbox, message, state, now);
    } catch (error) {
      if (error instanceof SuppressionCapReached) return { stopped: true, lastDone };
      throw error;
    }
    lastDone = message;
  }
  return { stopped: false, lastDone };
}

/**
 * The cursor after a scan stopped early: through the last report applied, or
 * unchanged when none was, so the rest is read again next time (receipts
 * dedupe what was already applied).
 */
function cursorThrough(
  mailbox: ScanMailbox,
  lastDone: RawDsnMessage | null,
  now: Date
): Record<string, unknown> {
  if (mailbox.kind !== 'SMTP') {
    return {
      scanCursorAt: lastDone
        ? oauthCursorAfter({ resumeFrom: lastDone.receivedAt }, now)
        : mailbox.scanCursorAt,
    };
  }
  if (!lastDone) {
    return { imapUidValidity: mailbox.imapUidValidity, imapLastUid: mailbox.imapLastUid };
  }
  // IMAP report keys are "<uidValidity>:<uid>".
  const [uidValidity, uid] = lastDone.key.split(':');
  return { imapUidValidity: BigInt(uidValidity), imapLastUid: Number(uid), scanCursorAt: now };
}

async function scanMailbox(
  deps: BounceReaderDeps,
  claim: MailboxClaim,
  now: Date,
  report: BounceScanReport
): Promise<void> {
  const { id } = claim;
  const mailbox: ScanMailbox | null = await deps.prisma.emailMailbox.findFirst({ where: { id } });
  if (!mailbox) return;
  if (!canReadBounces(mailbox)) {
    await releaseMailbox(deps, claim, { nextScanAt: new Date(now.getTime() + SCAN_INTERVAL_MS) });
    return;
  }

  try {
    const settings = settingsValues(
      await deps.prisma.tenantEmailSettings.findUnique({ where: { tenantId: mailbox.tenantId } })
    );
    const { messages, cursor } = await listReports(deps, mailbox, now);
    const state: ScanState = { claim, settings, suppressions: 0, receipts: 0, unmatched: 0 };
    const run = await processReports(deps, mailbox, messages, state, now);
    const nextCursor = run.stopped ? cursorThrough(mailbox, run.lastDone, now) : cursor;
    report.receipts += state.receipts;
    report.suppressions += state.suppressions;
    report.mailboxesScanned += 1;
    await releaseMailbox(deps, claim, {
      nextScanAt: new Date(now.getTime() + SCAN_INTERVAL_MS),
      failureCount: 0,
      ...nextCursor,
    });
  } catch (error) {
    // Another worker owns the mailbox now: its state stands, nothing is written.
    if (error instanceof LeaseLost) return;
    report.failures += 1;
    const code: MailboxErrorCode =
      error instanceof MailboxTransportError ? error.code : 'CONNECT_FAILED';
    const failureCount = mailbox.failureCount + 1;
    const backoff = Math.min(SCAN_INTERVAL_MS * 2 ** failureCount, MAX_BACKOFF_MS);
    await releaseMailbox(deps, claim, {
      failureCount,
      nextScanAt: new Date(now.getTime() + backoff),
      ...(failureCount >= MAX_FAILURES ? { status: 'ERROR', lastErrorCode: code } : {}),
    });
    console.error('[email] bounce scan failed', { mailboxId: id, code });
  }
}

/** One scheduler tick. */
export async function runBounceScan(deps: BounceReaderDeps): Promise<BounceScanReport> {
  const now = deps.now();
  const report: BounceScanReport = {
    mailboxesScanned: 0,
    receipts: 0,
    suppressions: 0,
    failures: 0,
  };

  await deps.prisma.emailOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  await deps.prisma.emailBounceReceipt.deleteMany({
    where: { receivedAt: { lt: new Date(now.getTime() - RECEIPT_RETENTION_DAYS * DAY_MS) } },
  });

  for (let i = 0; i < MAILBOXES_PER_TICK; i++) {
    const claimedAt = deps.now();
    const claim = await claimNextMailbox(deps, claimedAt);
    if (!claim) break;
    await scanMailbox(deps, claim, claimedAt, report);
  }
  return report;
}

/** Production wiring: the shared encrypted Prisma client, container transports, in-app notifications. */
export async function createBounceReaderDeps(): Promise<BounceReaderDeps> {
  const [{ prisma }, { container }, { createNotification }, { notifyEmailBounced }] =
    await Promise.all([
      import('@intelliflow/db'),
      import('../../container.js'),
      import('../notifications/notifications.router.js'),
      import('./email-automation.js'),
    ]);
  const transports = (container.adapters as unknown as { mailboxTransports: MailboxTransports })
    .mailboxTransports;
  return {
    prisma,
    transports,
    now: () => new Date(),
    notify: (n, db) =>
      notifyEmailBounced(n, { notifySenderOnBounce: true }, (params) =>
        createNotification(db as never, params as never).then(() => undefined)
      ),
  };
}
