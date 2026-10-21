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
  notify(notification: BounceNotification): Promise<void>;
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
  imapLastUid: number | null;
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

async function claimDueMailboxes(deps: BounceReaderDeps, now: Date): Promise<string[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const rows: Array<{ id: string }> = await deps.prisma.$queryRaw`
    UPDATE email_mailboxes SET "lockedUntil" = ${leaseUntil}
    WHERE id IN (
      SELECT id FROM email_mailboxes
      WHERE status = 'ACTIVE' AND "nextScanAt" <= ${now}
        AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now})
      ORDER BY "nextScanAt" ASC
      LIMIT ${MAILBOXES_PER_TICK}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
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
        lastUid: mailbox.imapLastUid,
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
  const messages = await client.listDsnSince(token, since, EMAIL_LIMITS.bounceScanMessageLimit);
  return { messages, cursor: { scanCursorAt: now } };
}

interface ScanState {
  settings: EmailSettingsValues;
  suppressions: number;
  receipts: number;
}

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

/**
 * Inside the receipt transaction: marks the recipient bounced on the record
 * (BOUNCED once every recipient hard-bounced) and suppresses per the tenant's
 * rules. Returns the record's new metadata and whether a suppression was written.
 */
async function applyMatchedBounce(
  tx: any,
  b: MatchedBounce
): Promise<{ metadata: Record<string, unknown>; suppressed: boolean }> {
  const metadata = b.record.metadata ?? {};
  const previous = Array.isArray(metadata.bouncedRecipients)
    ? (metadata.bouncedRecipients as string[])
    : [];
  const bounced = [...new Set([...previous, b.recipient])];
  const allBounced = b.kind === 'HARD' && b.recordRecipients.every((r) => bounced.includes(r));
  const nextMetadata = { ...metadata, bouncedRecipients: bounced };
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
  if (!decision.suppress || b.state.suppressions >= EMAIL_LIMITS.bounceScanMaxSuppressions) {
    return { metadata: nextMetadata, suppressed: false };
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
  try {
    return await deps.prisma.$transaction(async (tx: any) => {
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
      return applyMatchedBounce(tx, {
        mailbox,
        record: matched,
        recordRecipients: r.recordRecipients,
        recipient: entry.recipient,
        kind,
        state: r.state,
        now: r.now,
      });
    });
  } catch (error) {
    // Already processed (unique receipt): idempotent no-op.
    if ((error as { code?: string })?.code === 'P2002') return null;
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

    if (shouldNotifySender(matched, kind, state.settings)) {
      await deps.notify({
        tenantId: mailbox.tenantId,
        userId: matched.userId,
        emailRecordId: matched.id,
        recipient: entry.recipient,
      });
    }
  }
}

async function scanMailbox(
  deps: BounceReaderDeps,
  id: string,
  now: Date,
  report: BounceScanReport
): Promise<void> {
  const mailbox: ScanMailbox | null = await deps.prisma.emailMailbox.findFirst({ where: { id } });
  if (!mailbox) return;
  if (!canReadBounces(mailbox)) {
    await deps.prisma.emailMailbox.update({
      where: { id },
      data: { lockedUntil: null, nextScanAt: new Date(now.getTime() + SCAN_INTERVAL_MS) },
    });
    return;
  }

  try {
    const settings = settingsValues(
      await deps.prisma.tenantEmailSettings.findUnique({ where: { tenantId: mailbox.tenantId } })
    );
    const { messages, cursor } = await listReports(deps, mailbox, now);
    const state: ScanState = { settings, suppressions: 0, receipts: 0 };
    for (const message of messages) {
      await processReport(deps, mailbox, message, state, now);
    }
    report.receipts += state.receipts;
    report.suppressions += state.suppressions;
    report.mailboxesScanned += 1;
    await deps.prisma.emailMailbox.update({
      where: { id },
      data: {
        lockedUntil: null,
        nextScanAt: new Date(now.getTime() + SCAN_INTERVAL_MS),
        failureCount: 0,
        ...cursor,
      },
    });
  } catch (error) {
    report.failures += 1;
    const code: MailboxErrorCode =
      error instanceof MailboxTransportError ? error.code : 'CONNECT_FAILED';
    const failureCount = mailbox.failureCount + 1;
    const backoff = Math.min(SCAN_INTERVAL_MS * 2 ** failureCount, MAX_BACKOFF_MS);
    await deps.prisma.emailMailbox.update({
      where: { id },
      data: {
        lockedUntil: null,
        failureCount,
        nextScanAt: new Date(now.getTime() + backoff),
        ...(failureCount >= MAX_FAILURES ? { status: 'ERROR', lastErrorCode: code } : {}),
      },
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

  for (const id of await claimDueMailboxes(deps, now)) {
    await scanMailbox(deps, id, now, report);
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
    notify: (n) =>
      notifyEmailBounced(n, { notifySenderOnBounce: true }, (params) =>
        createNotification(prisma as never, params as never).then(() => undefined)
      ),
  };
}
