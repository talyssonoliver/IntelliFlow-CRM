/**
 * Mailbox sync (#1177, MVP-001): received mail, and mail sent from the provider itself, logged to the CRM.
 * Provider-neutral: each readable mailbox kind plugs in a reader (mail-sync-reader.ts).
 *
 * Each tick claims due readable mailboxes one at a time (a lease in "syncLockedUntil", like the
 * bounce scan's), reads the Inbox and Sent Items deltas since their stored cursors, and logs new
 * mail to the CRM: both ways, so mail the user sends from Outlook itself is logged too.
 *
 * What is stored, on purpose:
 * - Only mail with an existing lead or contact of the mailbox's tenant (the sender of received
 *   mail, a recipient of sent mail). Personal mail never
 *   reaches the CRM, and an erased person (whose lead/contact keeps only a placeholder address)
 *   is never matched, so erased data cannot come back through the sync.
 * - Nothing from a sender with an active processing restriction.
 * - Nothing twice: the provider's message id, or the mail's Message-ID header, per mailbox
 *   (the header also matches sent mail the CRM itself sent).
 * - Mail the user deletes in Outlook stays logged: the CRM record is the user's log, not a mirror.
 * A failure backs the mailbox off; it never changes the mailbox's status, so sending is not
 * affected by a sync problem.
 */
import { MailboxTransportError } from '@intelliflow/adapters';
import { getOAuthAccess, type MailboxTransports, type TransportMailbox } from './mailbox-transport';
import {
  PRODUCTION_READERS,
  type MailSyncReader,
  type SyncFolder,
  type SyncRound,
  type SyncedMessage,
} from './mail-sync-reader';
import { learnThread, logOnLead, threadOf, type LoggedRecord } from './mail-sync-links';

export const INBOX_SYNC_INTERVAL_MS = 5 * 60_000;
const LEASE_MS = 5 * 60_000;
const MAILBOXES_PER_TICK = 10;
/** A tick stops claiming mailboxes after this, so one tick always ends well inside a lease. */
export const TICK_BUDGET_MS = 2 * 60_000;
/** Time one mailbox's reads (both folders) may take per round; each request also has a timeout. */
const MAILBOX_READ_BUDGET_MS = 60_000;
/** Time one mailbox's round may take in all (reads, bodies, writes): well inside LEASE_MS. */
const MAILBOX_STORE_BUDGET_MS = 3 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
/** A mailbox without Mail.Read (connected before the scope, or narrowed) is checked daily. */
const NO_SCOPE_RECHECK_MS = 24 * 60 * 60_000;
/**
 * Prisma codes for a row the database refuses as data (too long, bad value, or a lead or contact
 * erased since it was matched): skip that mail.
 */
const DATA_ERROR_CODES = new Set(['P2000', 'P2003', 'P2006', 'P2007', 'P2011']);

export interface InboxSyncDeps {
  prisma: any;
  transports: MailboxTransports;
  /** True when the address has an active processing restriction in the tenant. */
  isRestricted: (tenantId: string, email: string) => Promise<boolean>;
  now: () => Date;
  /** The reader per readable mailbox kind; defaults to PRODUCTION_READERS. */
  readers?: Partial<Record<string, MailSyncReader>>;
}

function readersOf(deps: InboxSyncDeps): Partial<Record<string, MailSyncReader>> {
  return deps.readers ?? PRODUCTION_READERS;
}

export interface InboxSyncReport {
  mailboxesSynced: number;
  stored: number;
  skipped: number;
  failures: number;
  restarts: number;
}

/** The mailbox row as the encrypted client returns it (the token helper reads its credentials). */
interface SyncMailbox extends TransportMailbox {
  userId: string | null;
  status: string;
  accountAddress: string | null;
  fromAddress: string;
  grantedScopes: string[];
  syncCursor: string | null;
  syncSentCursor: string | null;
  syncFailureCount: number;
}

interface Claim {
  id: string;
  leaseUntil: Date;
}

type StoreOutcome = 'stored' | 'duplicate' | 'unmatched' | 'restricted' | 'own' | 'rejected';

function prismaCode(error: unknown): string | undefined {
  return (error as { code?: unknown })?.code as string | undefined;
}

async function claimNext(deps: InboxSyncDeps, now: Date, kinds: string[]): Promise<Claim | null> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const rows: Array<{ id: string; syncLockedUntil: Date }> = await deps.prisma.$queryRaw`
    UPDATE email_mailboxes SET "syncLockedUntil" = ${leaseUntil}
    WHERE id IN (
      SELECT id FROM email_mailboxes
      WHERE status = 'ACTIVE' AND kind = ANY(${kinds})
        AND ("nextSyncAt" IS NULL OR "nextSyncAt" <= ${now})
        AND ("syncLockedUntil" IS NULL OR "syncLockedUntil" < ${now})
      ORDER BY "nextSyncAt" ASC NULLS FIRST
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "syncLockedUntil"`;
  const row = rows[0];
  return row ? { id: row.id, leaseUntil: row.syncLockedUntil } : null;
}

/**
 * Writes the round's outcome only while this worker still holds the lease AND the credentials it
 * read are still the mailbox's: after a save or reconnect (tokenVersion moved on) nothing of the
 * old account's round is written back, and the lease simply runs out.
 */
async function release(
  deps: InboxSyncDeps,
  claim: Claim,
  tokenVersion: number,
  data: Record<string, unknown>
) {
  try {
    await deps.prisma.emailMailbox.update({
      where: { id: claim.id, syncLockedUntil: claim.leaseUntil, tokenVersion },
      data: { syncLockedUntil: null, ...data },
    });
  } catch (error) {
    if (prismaCode(error) !== 'P2025') throw error; // P2025: another worker holds it now.
  }
}

/** The lead or contact the sender is, in the mailbox's tenant; null when neither. */
async function matchSender(
  deps: InboxSyncDeps,
  tenantId: string,
  email: string
): Promise<{ contactId: string | null; leadId: string | null } | null> {
  const where = { tenantId, email: { equals: email, mode: 'insensitive' } };
  const contact = await deps.prisma.contact.findFirst({ where, select: { id: true } });
  if (contact) return { contactId: contact.id, leadId: null };
  const lead = await deps.prisma.lead.findFirst({ where, select: { id: true } });
  return lead ? { contactId: null, leadId: lead.id } : null;
}

/**
 * Who the mail is with: the sender of received mail, or the first recipient of sent mail who is
 * a lead or contact. Null when nobody is (then nothing is stored).
 */
async function counterparty(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage,
  folder: SyncFolder
): Promise<{ email: string; contactId: string | null; leadId: string | null } | null> {
  const own = (mailbox.accountAddress ?? mailbox.fromAddress).toLowerCase();
  const candidates = folder === 'inbox' ? [message.fromAddress] : [...message.to, ...message.cc];
  for (const email of candidates) {
    if (!email || email === own) continue;
    const match = await matchSender(deps, mailbox.tenantId, email);
    if (match) return { email, ...match };
  }
  return null;
}

/**
 * True when anyone on the mail but the owner (sender, To, Cc) has a processing restriction:
 * then nothing of it is stored, wherever that person sits among the recipients.
 */
async function anyoneRestricted(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage
): Promise<boolean> {
  const own = (mailbox.accountAddress ?? mailbox.fromAddress).toLowerCase();
  const people = new Set([message.fromAddress, ...message.to, ...message.cc]);
  for (const email of people) {
    if (email && email !== own && (await deps.isRestricted(mailbox.tenantId, email))) return true;
  }
  return false;
}

function messageIdHeader(message: SyncedMessage): string | null {
  return message.internetMessageId?.slice(0, 255) ?? null;
}

/** Mail already in the CRM: the same provider message, or (sent mail) the CRM's own send. */
async function alreadyLogged(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage
): Promise<LoggedRecord | null> {
  // Same provider id, or the same Message-ID header already logged for this mailbox.
  const header = messageIdHeader(message);
  const existing = await deps.prisma.emailRecord.findFirst({
    where: {
      tenantId: mailbox.tenantId,
      mailboxId: mailbox.id,
      OR: [
        { providerMessageId: message.providerMessageId.slice(0, 255) },
        ...(header ? [{ messageIdHeader: header }] : []),
      ],
    },
    select: { id: true, metadata: true },
  });
  return existing;
}

/** The email record a kept synced mail becomes. */
function recordData(args: {
  mailbox: SyncMailbox;
  message: SyncedMessage;
  folder: SyncFolder;
  provider: MailSyncReader['provider'];
  party: { contactId: string | null; leadId: string | null };
  body: string;
  threadId: string | null;
}): Record<string, unknown> {
  const { mailbox, message, folder, provider, party, body, threadId } = args;
  const sent = folder === 'sentitems';
  return {
    subject: message.subject,
    body,
    fromEmail: message.fromAddress ?? mailbox.accountAddress ?? mailbox.fromAddress,
    toEmail: message.to.join(', '),
    ccEmails: message.cc.join(', ') || null,
    status: sent ? 'SENT' : 'DELIVERED',
    ...(sent ? { sentAt: message.receivedAt } : {}),
    isRead: sent ? true : message.isRead,
    tenantId: mailbox.tenantId,
    mailboxId: mailbox.id,
    // userId is the sender on an email record: the owner for mail they sent, none for mail they
    // received, so received mail stays out of their Sent folder (as the inbound webhook does).
    ...(sent ? { userId: mailbox.userId } : {}),
    contactId: party.contactId,
    messageIdHeader: messageIdHeader(message),
    provider,
    providerMessageId: message.providerMessageId.slice(0, 255),
    createdAt: message.receivedAt,
    metadata: {
      source: 'outlook-sync',
      folder,
      mailboxOwnerId: mailbox.userId,
      conversationId: message.conversationId,
      ...(threadId ? { threadId } : {}),
      ...(party.leadId ? { leadId: party.leadId } : {}),
    },
  };
}

/** A kept mail's body; null when the provider refuses that one message (deleted meanwhile). */
async function bodyOf(message: SyncedMessage): Promise<string | null> {
  if (!message.loadBody) return message.bodyText;
  try {
    return await message.loadBody();
  } catch (error) {
    // One message the provider refuses never fails the round; a dead token or an outage does.
    if (error instanceof MailboxTransportError && error.code === 'REJECTED') return null;
    throw error;
  }
}

export async function storeSyncedMessage(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage,
  folder: SyncFolder = 'inbox',
  provider: MailSyncReader['provider'] = 'MICROSOFT'
): Promise<StoreOutcome> {
  if (folder === 'inbox' && !message.fromAddress) return 'own';
  const party = await counterparty(deps, mailbox, message, folder);
  if (!party) return 'unmatched';
  if (await anyoneRestricted(deps, mailbox, message)) return 'restricted';
  const logged = await alreadyLogged(deps, mailbox, message);
  if (logged) {
    if (folder === 'sentitems') await learnThread(deps, mailbox, logged, message);
    return 'duplicate';
  }
  const threadId = await threadOf(deps, mailbox, message);
  // Only now, for mail that is kept: the body (a reader may load it lazily, so personal mail's
  // content is never fetched).
  const body = await bodyOf(message);
  if (body === null) return 'rejected';
  const leadId = party.leadId;
  const write = async (db: any) => {
    const record: { id: string } = await db.emailRecord.create({
      data: recordData({ mailbox, message, folder, provider, party, body, threadId }),
      select: { id: true },
    });
    if (leadId) await logOnLead({ prisma: db }, mailbox, message, leadId, record.id);
  };
  try {
    // A lead's mail and its timeline entry land together or not at all: a retry finds no record
    // and writes both again, so the lead never misses the entry.
    await (leadId ? deps.prisma.$transaction(write) : write(deps.prisma));
    return 'stored';
  } catch (error) {
    // One mail the database rejects as data never fails the round: skip it and go on.
    if (DATA_ERROR_CODES.has(prismaCode(error) ?? '')) return 'rejected';
    throw error;
  }
}

/** One mailbox's sync: its token, its clock and the deadline every read of it shares. */
interface MailboxRun {
  reader: MailSyncReader;
  mailbox: SyncMailbox;
  token: string;
  now: Date;
  /** Epoch ms after which no read of this mailbox starts another page. */
  deadline: number;
  /** Epoch ms after which no more mail of this mailbox is stored (bodies are read while storing). */
  storeBy: number;
  report: InboxSyncReport;
}

async function readRound(
  deps: InboxSyncDeps,
  run: MailboxRun,
  folder: SyncFolder,
  cursor: string | null
): Promise<SyncRound> {
  // Every read gets what is left of the mailbox's budget, so both folders and a restart
  // together still end well inside the lease.
  const read = (from: string | null) =>
    run.reader.read({
      accessToken: run.token,
      mailbox: run.mailbox,
      folder,
      cursor: from,
      now: run.now,
      budgetMs: Math.max(0, run.deadline - deps.now().getTime()),
    });
  const round = await read(cursor);
  if (!round.expired) return round;
  // The provider no longer accepts the cursor: start the folder again (dedupe keeps it safe).
  run.report.restarts += 1;
  return read(null);
}

/** Reads one folder's round and logs what belongs in the CRM. */
async function syncFolder(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  run: MailboxRun,
  folder: SyncFolder,
  cursor: string | null
): Promise<SyncRound> {
  const round = await readRound(deps, run, folder, cursor);
  for (const message of round.messages) {
    // Out of time for this mailbox: stop well inside the lease, so no other worker takes it over
    // mid-write. The folder keeps its old cursor and stays due; what was stored is deduped next time.
    if (deps.now().getTime() >= run.storeBy) return { ...round, cursor, complete: false };
    const outcome = await storeSyncedMessage(deps, mailbox, message, folder, run.reader.provider);
    if (outcome === 'stored') run.report.stored += 1;
    else run.report.skipped += 1;
  }
  return round;
}

async function syncMailbox(
  deps: InboxSyncDeps,
  claim: Claim,
  now: Date,
  report: InboxSyncReport
): Promise<void> {
  const mailbox: SyncMailbox | null = await deps.prisma.emailMailbox.findFirst({
    where: { id: claim.id },
  });
  if (!mailbox) return;
  const reader = readersOf(deps)[mailbox.kind];
  // Not readable (no reader, or the read permission was not granted): checked again daily.
  if (!reader || !reader.canRead(mailbox.grantedScopes)) {
    await release(deps, claim, mailbox.tokenVersion, {
      nextSyncAt: new Date(now.getTime() + NO_SCOPE_RECHECK_MS),
    });
    return;
  }
  // A folder that finished keeps its cursor even when the other one then fails.
  const progress: Record<string, unknown> = {};
  // The credential version this round runs on (a refresh that rotates the token moves it on).
  let version = mailbox.tokenVersion;
  try {
    const access = await getOAuthAccess(deps.prisma, mailbox, deps.transports, now);
    version = access.tokenVersion;
    const token = access.accessToken;
    const startedAt = deps.now().getTime();
    const deadline = startedAt + MAILBOX_READ_BUDGET_MS;
    const storeBy = startedAt + MAILBOX_STORE_BUDGET_MS;
    const run: MailboxRun = { reader, mailbox, token, now, deadline, storeBy, report };
    // Sent first: a CRM-sent mail learns its provider conversation there, so a reply read in the
    // same run (or the first run's 30 days) already finds the thread it joins.
    const sent = await syncFolder(deps, mailbox, run, 'sentitems', mailbox.syncSentCursor);
    progress.syncSentCursor = sent.cursor;
    const inbox = await syncFolder(deps, mailbox, run, 'inbox', mailbox.syncCursor);
    report.mailboxesSynced += 1;
    await release(deps, claim, version, {
      syncCursor: inbox.cursor,
      syncSentCursor: sent.cursor,
      syncedAt: now,
      // More to read: due again on the next tick; caught up: wait the interval.
      nextSyncAt:
        inbox.complete && sent.complete ? new Date(now.getTime() + INBOX_SYNC_INTERVAL_MS) : now,
      syncFailureCount: 0,
    });
  } catch (error) {
    report.failures += 1;
    const failures = mailbox.syncFailureCount + 1;
    const backoff = Math.min(INBOX_SYNC_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
    await release(deps, claim, version, {
      ...progress,
      syncFailureCount: failures,
      nextSyncAt: new Date(now.getTime() + backoff),
    });
    const code = error instanceof MailboxTransportError ? error.code : 'CONNECT_FAILED';
    console.error('[email] inbox sync failed', { mailboxId: claim.id, code });
  }
}

/** One tick: sync the due readable mailboxes, one claim at a time, within the tick budget. */
export async function runInboxSync(deps: InboxSyncDeps): Promise<InboxSyncReport> {
  const report: InboxSyncReport = {
    mailboxesSynced: 0,
    stored: 0,
    skipped: 0,
    failures: 0,
    restarts: 0,
  };
  const startedAt = deps.now().getTime();
  const kinds = Object.keys(readersOf(deps));
  // No readable kind registered: nothing to claim, no query at all.
  if (kinds.length === 0) return report;
  for (let i = 0; i < MAILBOXES_PER_TICK; i++) {
    const claimedAt = deps.now();
    if (claimedAt.getTime() - startedAt >= TICK_BUDGET_MS) break;
    const claim = await claimNext(deps, claimedAt, kinds);
    if (!claim) break;
    await syncMailbox(deps, claim, claimedAt, report);
  }
  return report;
}

/** EMAIL_INBOX_SYNC=off turns the sync off in this process (the bounce scan keeps running). */
export function inboxSyncEnabled(env: NodeJS.ProcessEnv): boolean {
  return (env.EMAIL_INBOX_SYNC ?? '').trim().toLowerCase() !== 'off';
}

/** Production wiring: the shared encrypted Prisma client, container transports, restrictions. */
export async function createInboxSyncDeps(): Promise<InboxSyncDeps> {
  const [{ prisma }, { container }, { PrismaProcessingRestrictionRepository }] = await Promise.all([
    import('@intelliflow/db'),
    import('../../container.js'),
    import('@intelliflow/adapters'),
  ]);
  const adapters = container.adapters as unknown as { mailboxTransports: MailboxTransports };
  const restrictions = new PrismaProcessingRestrictionRepository(prisma as never);
  return {
    prisma,
    transports: adapters.mailboxTransports,
    isRestricted: async (tenantId, email) =>
      (await restrictions.status(tenantId, email)).restricted,
    now: () => new Date(),
  };
}
