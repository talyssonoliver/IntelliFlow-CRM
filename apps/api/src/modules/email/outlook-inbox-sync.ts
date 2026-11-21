/**
 * Mailbox sync (#1177, MVP-001): received mail, and mail sent from the provider itself, logged to
 * the CRM. Provider-neutral: each readable mailbox kind plugs in a reader (mail-sync-reader.ts).
 * Each tick claims due readable mailboxes one at a time (a lease in "syncLockedUntil"), reads the
 * Inbox and Sent Items deltas since their stored cursors and logs new mail, both ways.
 *
 * What is stored, on purpose:
 * - Only mail with an existing lead or contact of the tenant (the sender of received mail, a
 *   recipient of sent mail), plus received mail from a real person who is neither: a new enquiry,
 *   which becomes a lead (MVP-011, mail-sync-enquiry.ts). Personal mail never reaches the CRM; an
 *   erased person (placeholder address) is never matched, so erased data cannot come back.
 * - Nothing from a sender with an active processing restriction.
 * - Nothing twice: the provider's message id, or the Message-ID header, per mailbox.
 * - Mail deleted in the provider stays logged: the CRM record is the user's log, not a mirror.
 * MVP-011: after the folders, a look-back reads 90 days for the leads and contacts created since
 * the last one (mail-sync-lookback.ts). A failure backs the mailbox off and never changes its status.
 */
import {
  getOAuthAccess,
  hasOAuthClient,
  oauthClientEnvNames,
  type MailboxTransports,
  type TransportMailbox,
} from './mailbox-transport';
import { countOutcome, logFailure, logNoClient, logRound, newTally } from './mail-sync-report';
import type { FolderTally } from './mail-sync-report';
import {
  PRODUCTION_READERS,
  type MailSyncReader,
  type SyncFolder,
  type SyncRound,
  type SyncedMessage,
} from './mail-sync-reader';
import { learnThread, logOnLead, threadOf } from './mail-sync-links';
import { alreadyLogged, anyoneRestricted, bodyOf, counterparty } from './mail-sync-match';
import { runLookback, type LookbackState } from './mail-sync-lookback';
import { messageIdHeader, recordData } from './mail-sync-record';
import { queueReplyDraftForSyncedMail } from './mail-sync-reply-draft';
import { queueEnquiryLeadScoring, type QueueLeadAi } from './mail-sync-enquiry-scoring';
import { enqueueLeadAiById } from '../lead/lead-scoring-enqueue';
import {
  MAX_ENQUIRIES_PER_RUN,
  createEnquiryLead,
  erasedSince,
  isEnquirySender,
  type CreateLead,
} from './mail-sync-enquiry';

export const INBOX_SYNC_INTERVAL_MS = 5 * 60_000;
const LEASE_MS = 5 * 60_000;
const MAILBOXES_PER_TICK = 10;
/** A tick stops claiming mailboxes after this, so one tick always ends well inside a lease. */
export const TICK_BUDGET_MS = 2 * 60_000;
/** Time one mailbox's reads (both folders) may take per round; each request also has a timeout. */
const MAILBOX_READ_BUDGET_MS = 60_000;
/** Time one mailbox's round may take in all (reads, bodies, writes): well inside LEASE_MS. */
const MAILBOX_STORE_BUDGET_MS = 3 * 60_000;
/** What the last store and the release may still take after storing stops (bodies time out at 30 s). */
const LEASE_MARGIN_MS = 90_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
/** A mailbox without Mail.Read (connected before the scope, or narrowed) is checked daily. */
const NO_SCOPE_RECHECK_MS = 24 * 60 * 60_000;
/** Prisma codes for a row the database refuses as data (too long, bad value, or an erased lead or contact): skip that mail. */
const DATA_ERROR_CODES = new Set(['P2000', 'P2003', 'P2006', 'P2007', 'P2011']);

export interface InboxSyncDeps {
  prisma: any;
  transports: MailboxTransports;
  /** True when the address has an active processing restriction in the tenant. */
  isRestricted: (tenantId: string, email: string) => Promise<boolean>;
  now: () => Date;
  /** The reader per readable mailbox kind; defaults to PRODUCTION_READERS. */
  readers?: Partial<Record<string, MailSyncReader>>;
  /** MVP-011: the lead use case; without it unknown senders are skipped as before. */
  createLead?: CreateLead;
  /** MVP-012 #34: queue the AI scoring job for a lead made from an enquiry (best-effort). */
  queueLeadAi?: QueueLeadAi;
  /** MVP-011: a look-back stores old mail: no reply drafts are queued for it. */
  backfill?: boolean;
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
  /** MVP-011: new leads made from unknown senders this run, and mails held back by the cap. */
  leadsCreated: number;
  leadsCapped: number;
}

/** The mailbox row as the encrypted client returns it (the token helper reads its credentials). */
interface SyncMailbox extends TransportMailbox, LookbackState {
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

type Party = { email: string; contactId: string | null; leadId: string | null };

type StoreOutcome =
  | 'stored'
  | 'duplicate'
  | 'unmatched'
  | 'restricted'
  | 'own'
  | 'rejected'
  | 'capped';

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

/** The lead or contact the mail is with; else, for an eligible stranger, a new enquiry (MVP-011). */
async function partyOf(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage,
  folder: SyncFolder
): Promise<{ party: Party; enquiry: boolean } | null> {
  const known = await counterparty(deps, mailbox, message, folder);
  if (known) {
    // A lead made from a later mail must not let mail from before the sender's erasure back in.
    const old = deps.createLead && folder === 'inbox' && message.fromAddress;
    if (old && (await erasedSince(deps, mailbox, message.fromAddress!, message.receivedAt))) {
      return null;
    }
    return { party: known, enquiry: false };
  }
  if (!(await isEnquirySender(deps, mailbox, message, folder))) return null;
  const email = message.fromAddress!.toLowerCase();
  return { party: { email, contactId: null, leadId: null }, enquiry: true };
}

export async function storeSyncedMessage(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage,
  folder: SyncFolder = 'inbox',
  provider: MailSyncReader['provider'] = 'MICROSOFT',
  /** The run's counters: the cap on new enquiry leads is per run. */
  enquiries?: Pick<InboxSyncReport, 'leadsCreated'>
): Promise<StoreOutcome> {
  if (folder === 'inbox' && !message.fromAddress) return 'own';
  const found = await partyOf(deps, mailbox, message, folder);
  if (!found) return 'unmatched';
  let party = found.party;
  const enquiry = found.enquiry;
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
  if (enquiry) {
    const created = await openEnquiry(deps, mailbox, message, enquiries);
    if (created === 'capped' || created === null) return created === null ? 'unmatched' : 'capped';
    party = { ...party, leadId: created };
  }
  return writeMail(deps, { mailbox, message, folder, provider, party, body, threadId });
}

/** MVP-011: the new lead for an enquiry; 'capped' when this run's cap is reached; null when refused. */
async function openEnquiry(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  message: SyncedMessage,
  enquiries?: Pick<InboxSyncReport, 'leadsCreated'>
): Promise<string | 'capped' | null> {
  if ((enquiries?.leadsCreated ?? 0) >= MAX_ENQUIRIES_PER_RUN) return 'capped';
  const created = await createEnquiryLead(deps, mailbox, message);
  if (created && enquiries) enquiries.leadsCreated += 1;
  // The lead is committed: queue its AI scoring (detached, best-effort).
  if (created) {
    const { tenantId } = mailbox;
    const { providerMessageId } = message;
    queueEnquiryLeadScoring(deps.queueLeadAi, { leadId: created, tenantId, providerMessageId });
  }
  return created;
}

/** Stores the mail (and, for a lead, its timeline entry in the same transaction). */
async function writeMail(
  deps: InboxSyncDeps,
  args: Parameters<typeof recordData>[0]
): Promise<StoreOutcome> {
  const { mailbox, message, folder, party } = args;
  const leadId = party.leadId;
  const write = async (db: any): Promise<string> => {
    const record: { id: string } = await db.emailRecord.create({
      data: recordData(args),
      select: { id: true },
    });
    if (leadId) await logOnLead({ prisma: db }, mailbox, message, leadId, record.id, folder);
    return record.id;
  };
  try {
    // A lead's mail and its timeline entry land together or not at all: a retry finds no record
    // and writes both again, so the lead never misses the entry.
    const recordId = await (leadId ? deps.prisma.$transaction(write) : write(deps.prisma));
    // MVP-012: Aurora drafts a reply to received mail for the user to check; never sent unasked.
    if (!deps.backfill) {
      await queueReplyDraftForSyncedMail(deps, mailbox, message, folder, party, recordId);
    }
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
  /** What each folder's round read and did with it (logged once the mailbox is done). */
  tallies: Record<SyncFolder, FolderTally>;
}

/** A folder's round, and the cursor it actually started from (null after a restart). */
async function readRound(
  deps: InboxSyncDeps,
  run: MailboxRun,
  folder: SyncFolder,
  cursor: string | null
): Promise<{ round: SyncRound; startedFrom: string | null }> {
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
  if (!round.expired) return { round, startedFrom: cursor };
  // The provider no longer accepts the cursor: start the folder again (dedupe keeps it safe).
  run.report.restarts += 1;
  return { round: await read(null), startedFrom: null };
}

/** Reads one folder's round and logs what belongs in the CRM. */
async function syncFolder(
  deps: InboxSyncDeps,
  mailbox: SyncMailbox,
  run: MailboxRun,
  folder: SyncFolder,
  cursor: string | null
): Promise<SyncRound> {
  const { round, startedFrom } = await readRound(deps, run, folder, cursor);
  const tally = run.tallies[folder];
  countOutcome(tally, 'read', round.messages.length);
  for (const [index, message] of round.messages.entries()) {
    // Out of time for this mailbox: stop well inside the lease, so no other worker takes it over
    // mid-write. The folder keeps the cursor its round started from (never a rejected one, which
    // would repeat the failed read and restart every tick) and stays due; what was stored is
    // deduped next time.
    if (deps.now().getTime() >= run.storeBy) {
      countOutcome(tally, 'left', round.messages.length - index);
      return { ...round, cursor: startedFrom, complete: false };
    }
    const outcome = await storeSyncedMessage(
      deps,
      mailbox,
      message,
      folder,
      run.reader.provider,
      run.report
    );
    if (outcome === 'capped') {
      // The run's cap on new enquiry leads is reached: keep this mail and the rest for the next
      // run (same hold as running out of time), so a backlog is worked off in steps, never lost.
      run.report.leadsCapped += round.messages.length - index;
      countOutcome(tally, 'left', round.messages.length - index);
      return { ...round, cursor: startedFrom, complete: false };
    }
    countOutcome(tally, outcome);
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
  // No OAuth client for this kind in this process (its env lacks it): a setup gap, not a mailbox
  // failure. Checked again next interval, no failure counted, no backoff.
  if (!hasOAuthClient(deps.transports, mailbox.kind)) {
    const nextSyncAt = new Date(now.getTime() + INBOX_SYNC_INTERVAL_MS);
    await release(deps, claim, mailbox.tokenVersion, { nextSyncAt });
    logNoClient(claim.id, mailbox.kind, oauthClientEnvNames(mailbox.kind));
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
    // Counted from the claim's lease too, so a slow token refresh and the last store still fit.
    const storeBy = Math.min(
      startedAt + MAILBOX_STORE_BUDGET_MS,
      claim.leaseUntil.getTime() - LEASE_MARGIN_MS
    );
    const tallies = { sentitems: newTally(), inbox: newTally() };
    const run: MailboxRun = { reader, mailbox, token, now, deadline, storeBy, report, tallies };
    // Sent first: a CRM-sent mail learns its provider conversation there, so a reply read in the
    // same run (or the first run's 30 days) already finds the thread it joins.
    const sent = await syncFolder(deps, mailbox, run, 'sentitems', mailbox.syncSentCursor);
    progress.syncSentCursor = sent.cursor;
    const inbox = await syncFolder(deps, mailbox, run, 'inbox', mailbox.syncCursor);
    const lookback = await runLookback({
      prisma: deps.prisma,
      reader,
      mailbox,
      token,
      now,
      clock: deps.now,
      deadline,
      storeBy,
      store: (message, folder) =>
        storeSyncedMessage(
          { ...deps, createLead: undefined, backfill: true },
          mailbox,
          message,
          folder,
          reader.provider
        ),
    });
    report.stored += lookback.stored;
    report.mailboxesSynced += 1;
    await release(deps, claim, version, {
      syncCursor: inbox.cursor,
      syncSentCursor: sent.cursor,
      syncedAt: now,
      // More to read: due again on the next tick; caught up: wait the interval.
      nextSyncAt:
        inbox.complete && sent.complete && !lookback.more
          ? new Date(now.getTime() + INBOX_SYNC_INTERVAL_MS)
          : now,
      syncFailureCount: 0,
      ...lookback.data,
    });
    logRound(claim.id, mailbox.kind, tallies, inbox.complete && sent.complete);
  } catch (error) {
    report.failures += 1;
    const failures = mailbox.syncFailureCount + 1;
    const backoff = Math.min(INBOX_SYNC_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
    await release(deps, claim, version, {
      ...progress,
      syncFailureCount: failures,
      nextSyncAt: new Date(now.getTime() + backoff),
    });
    logFailure(claim.id, error);
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
    leadsCreated: 0,
    leadsCapped: 0,
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
    // MVP-011: unknown senders become leads through the lead use case.
    createLead: ((props, tx) =>
      (container as any).leadService.createLeadInTransaction(props, tx)) as CreateLead,
    // MVP-012 #34: the same scoring job a manually created lead gets.
    queueLeadAi: (ref) => enqueueLeadAiById(prisma as never, restrictions, ref),
  };
}
