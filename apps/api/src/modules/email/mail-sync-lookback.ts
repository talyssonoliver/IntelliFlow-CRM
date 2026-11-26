/**
 * MVP-011: history look-back. The mailbox sync reads only what arrives after a mailbox is
 * connected, and it logs mail only for a lead or contact that exists when it reads it. So mail from
 * before the connection, and mail with a lead or contact created later (the UI, an import, an
 * enquiry, the COA sync), never reached the CRM. A real CRM imports that history; this does.
 *
 * Each readable mailbox remembers a watermark: leads and contacts created up to it have been looked
 * for in the mailbox's last 90 days. A pass covers the next batch of leads and contacts created
 * after it (up to `PASS_ADDRESSES` at a time), reads the Sent Items and the Inbox for those 90 days
 * and logs the mail that is with those addresses. Nothing here is a new write path: the engine's
 * own store function does it, so the rules are the same (restrictions, erasure, dedupe by the
 * provider's message id and the Message-ID header), except that a look-back creates no enquiry
 * leads and queues no reply drafts for old mail.
 *
 * It runs inside the mailbox's claim, after the normal folders, on what is left of the tick's
 * budgets, and resumes across ticks from the cursors it stores (a folder that finished stores
 * `DONE`). It never fails the sync: an error keeps the cursors and the pass is tried again.
 * "Created" is the row's createdAt, so every creation path is covered without a hook in each one.
 */
import { MailboxTransportError } from '@intelliflow/adapters';
import type { MailSyncReader, SyncFolder, SyncRound, SyncedMessage } from './mail-sync-reader';

/** How far back a look-back reads. */
export const LOOKBACK_DAYS = 90;
/**
 * Leads and contacts one pass looks for (more are worked off pass by pass). A pass reads the whole
 * 90-day window of both folders and keeps the mail that is with its addresses, so what costs the
 * provider is the number of passes, not the number of addresses: batches much below this would
 * read the same mailbox over and over. A 163-lead import therefore takes two passes, and the load
 * is spread by the waits below (and by the backoff when the provider refuses), not by tiny batches.
 */
export const PASS_ADDRESSES = 100;
/** The wait after a finished pass before the next one starts (a pass re-reads the mailbox). */
export const PASS_GAP_MS = 15 * 60_000;
/** The wait between two rounds of one pass: a long read goes on in steps, not in one burst. */
export const ROUND_GAP_MS = 2 * 60_000;
/** The first wait after the provider refused (RATE_LIMITED); it doubles on each refusal in a row. */
export const BACKOFF_BASE_MS = 15 * 60_000;
export const BACKOFF_MAX_MS = 6 * 3_600_000;
/** A mailbox with a backlog and no look-back progress for this long is reported to the owner. */
export const STALL_ALERT_MS = 6 * 3_600_000;
/** A folder that finished its pass stores this as its cursor. */
export const FOLDER_DONE = 'DONE';

/** The look-back columns of an email mailbox (migration 20261120120000_email_mailbox_lookback). */
export interface LookbackState {
  id: string;
  tenantId: string;
  lookbackWatermark: Date | null;
  lookbackUntil: Date | null;
  lookbackCursor: string | null;
  lookbackSentCursor: string | null;
  /** Pacing and progress (migration 20261126100000_email_mailbox_lookback_pacing). */
  lookbackNextAt?: Date | null;
  lookbackBackoffCount?: number | null;
  lookbackProgressAt?: Date | null;
  lookbackImportTotal?: number | null;
  lookbackImportDone?: number | null;
}

/** The wait after the `count`-th refusal in a row: 15 min, 30 min, 1 h ... up to 6 h. */
export function backoffDelayMs(count: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, count - 1), BACKOFF_MAX_MS);
}

/**
 * What the settings page shows: real stored counts, or null when nothing is importing. `paused` is
 * true while the provider's limits are holding the import back (it resumes by itself).
 */
export function lookbackProgress(
  row: Pick<
    LookbackState,
    'lookbackImportTotal' | 'lookbackImportDone' | 'lookbackNextAt' | 'lookbackBackoffCount'
  >,
  now: Date
): { done: number; total: number; paused: boolean } | null {
  const total = row.lookbackImportTotal ?? 0;
  if (total <= 0) return null;
  const done = Math.min(Math.max(row.lookbackImportDone ?? 0, 0), total);
  const waiting = !!row.lookbackNextAt && row.lookbackNextAt.getTime() > now.getTime();
  return { done, total, paused: waiting && (row.lookbackBackoffCount ?? 0) > 0 };
}

export interface LookbackContext {
  prisma: any;
  reader: MailSyncReader;
  mailbox: LookbackState & {
    oauthAccountId?: string | null;
    oauthApiDomain?: string | null;
  };
  token: string;
  now: Date;
  clock: () => Date;
  /** Epoch ms after which no read of this mailbox starts another page. */
  deadline: number;
  /** Epoch ms after which no more mail of this mailbox is stored. */
  storeBy: number;
  /** The engine's store function for one mail (no enquiry leads, no reply drafts). */
  store: (message: SyncedMessage, folder: SyncFolder) => Promise<string>;
}

export interface LookbackResult {
  /** Columns to write on the mailbox with the round's outcome (empty: nothing changed). */
  data: Record<string, unknown>;
  /** True when more is left to do soon: the mailbox is due again on the next tick. */
  more: boolean;
  /** Mail logged by this look-back. */
  stored: number;
}

const nothing = (): LookbackResult => ({ data: {}, more: false, stored: 0 });

/**
 * A pass only covers leads and contacts created at least this long ago. `createdAt` is the time a
 * transaction started, not when it committed, so a row whose transaction is still open when a pass
 * moves the watermark past it would be skipped for good. Waiting this long (far more than any
 * lead or contact write takes) closes that gap; a new lead's history is looked back a little later.
 */
export const COMMIT_GRACE_MS = 10 * 60_000;

/**
 * Leads and contacts of the tenant created in (since, until], by creation time.
 *
 * Creation time is a complete trigger because a lead's or contact's address is fixed when the
 * record is created: `email` is a required column, unique per tenant, and the update inputs omit
 * it (updateLeadSchema, updateContactSchema), so no address is ever assigned or changed later. A
 * test holds that invariant: if address edits are ever allowed, the look-back must follow them.
 */
async function createdBetween(
  prisma: any,
  tenantId: string,
  since: Date,
  until: Date,
  take?: number
): Promise<Array<{ email: string; createdAt: Date }>> {
  // Rows without an address are left out in the query, before the limit: a run of them must not
  // fill a batch and hide the leads after it (a null address never equals the empty string).
  const where = {
    tenantId,
    email: { not: '' },
    createdAt: { gt: since, lte: until },
  };
  const args = {
    where,
    select: { email: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
    ...(take ? { take } : {}),
  };
  const [leads, contacts]: Array<Array<{ email: string | null; createdAt: Date }>> =
    await Promise.all([prisma.lead.findMany(args), prisma.contact.findMany(args)]);
  return [...leads, ...contacts]
    .filter((row): row is { email: string; createdAt: Date } => !!row.email)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** The addresses of a pass, lower-cased. */
function addressSet(rows: Array<{ email: string }>): Set<string> {
  return new Set(rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean));
}

/**
 * True when the mail is with one of the pass's addresses the way the sync itself judges it: the
 * sender of received mail, a recipient (To or Cc) of sent mail. Mail the sync would not log for a
 * lead or contact (received mail that only Cc's them) is not offered to the store either.
 */
function concerns(
  message: SyncedMessage,
  addresses: ReadonlySet<string>,
  folder: SyncFolder
): boolean {
  const people = folder === 'inbox' ? [message.fromAddress] : [...message.to, ...message.cc];
  return people.some((email) => !!email && addresses.has(email.trim().toLowerCase()));
}

/** One folder's round of the pass; a cursor the provider no longer accepts starts the folder again. */
async function readFolder(
  ctx: LookbackContext,
  folder: SyncFolder,
  cursor: string | null
): Promise<{ round: SyncRound; startedFrom: string | null }> {
  const read = (from: string | null) =>
    ctx.reader.read({
      accessToken: ctx.token,
      mailbox: ctx.mailbox,
      folder,
      cursor: from,
      now: ctx.now,
      budgetMs: Math.max(0, ctx.deadline - ctx.clock().getTime()),
      initialDays: LOOKBACK_DAYS,
    });
  const round = await read(cursor);
  if (!round.expired) return { round, startedFrom: cursor };
  return { round: await read(null), startedFrom: null };
}

interface FolderOutcome {
  /** The cursor to store for the folder. */
  cursor: string;
  done: boolean;
  /** True when this round read the folder through to its stored cursor (the pass moved on). */
  advanced: boolean;
}

/** One folder's pass round: reads it and logs the mail that is with the pass's addresses. */
async function passFolder(
  ctx: LookbackContext,
  folder: SyncFolder,
  cursor: string | null,
  addresses: ReadonlySet<string>
): Promise<FolderOutcome | null> {
  if (cursor === FOLDER_DONE) return { cursor: FOLDER_DONE, done: true, advanced: false };
  // Out of read time already: leave the folder as it is for the next tick.
  if (ctx.clock().getTime() >= ctx.deadline) return null;
  const { round, startedFrom } = await readFolder(ctx, folder, cursor);
  for (const message of round.messages) {
    // Out of time: stop well inside the lease and keep the cursor the round started from (never a
    // rejected one); what was stored is deduped next time.
    if (ctx.clock().getTime() >= ctx.storeBy)
      return { cursor: startedFrom ?? '', done: false, advanced: false };
    if (concerns(message, addresses, folder)) await ctx.store(message, folder);
  }
  if (round.complete) return { cursor: FOLDER_DONE, done: true, advanced: true };
  return { cursor: round.cursor ?? '', done: false, advanced: true };
}

/** A stored cursor of '' means "start the folder from the beginning". */
const fromStored = (cursor: string | null): string | null => (cursor ? cursor : null);

/** Leads and contacts of the tenant created in (since, until]: how many are waiting. */
async function countCreatedBetween(
  prisma: any,
  tenantId: string,
  since: Date,
  until: Date
): Promise<number> {
  const where = { tenantId, email: { not: '' }, createdAt: { gt: since, lte: until } };
  const [leads, contacts] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.contact.count({ where }),
  ]);
  return Number(leads) + Number(contacts);
}

/**
 * The provider refused (RATE_LIMITED) or failed: a handled condition, not a failure of ours. The round waits, with an
 * exponential, stored next-attempt time; the normal inbox sync is not touched. It is logged as a
 * warning (no error, so no error span). Only a mailbox with no look-back progress for STALL_ALERT_MS
 * or more raises an error line, once per attempt, carrying the tenant.
 */
function onProviderPause(
  ctx: LookbackContext,
  carried: Record<string, unknown>,
  stored: number,
  code: string
): LookbackResult {
  const { mailbox } = ctx;
  const at = ctx.clock();
  const attempt = (mailbox.lookbackBackoffCount ?? 0) + 1;
  const delay = backoffDelayMs(attempt);
  // A pass this very tick started the clock again (carried); else the stored time, else now.
  const progressAt = (carried.lookbackProgressAt ?? mailbox.lookbackProgressAt ?? at) as Date;
  const info = {
    mailboxId: mailbox.id,
    tenantId: mailbox.tenantId,
    attempt,
    retryAt: new Date(at.getTime() + delay).toISOString(),
  };
  console.warn(
    code === 'RATE_LIMITED'
      ? '[mail-sync] look-back paused by the provider limits, will retry'
      : '[mail-sync] look-back paused after a provider error, will retry',
    { ...info, code }
  );
  const stalledMs = at.getTime() - progressAt.getTime();
  if (stalledMs >= STALL_ALERT_MS) {
    console.error('[mail-sync] look-back stalled: no progress for 6 h or more', {
      ...info,
      stalledHours: Math.floor(stalledMs / 3_600_000),
    });
  }
  return {
    data: {
      ...carried,
      lookbackBackoffCount: attempt,
      lookbackNextAt: new Date(at.getTime() + delay),
      lookbackProgressAt: progressAt,
    },
    more: false,
    stored,
  };
}

/** A round the provider answered is progress: the refusal counter and the wait start again. */
const progressed = (ctx: LookbackContext) => ({
  lookbackBackoffCount: 0,
  lookbackNextAt: null,
  lookbackProgressAt: ctx.clock(),
});

/** The pass is finished: its leads and contacts are looked for. The next batch waits a while. */
function finishedPassData(
  ctx: LookbackContext,
  started: Record<string, unknown>,
  until: Date,
  batchSize: number
): Record<string, unknown> {
  const { mailbox } = ctx;
  const done = (started.lookbackImportDone ?? mailbox.lookbackImportDone ?? 0) as number;
  return {
    ...progressed(ctx),
    lookbackWatermark: until,
    lookbackUntil: null,
    lookbackCursor: null,
    lookbackSentCursor: null,
    lookbackImportTotal: started.lookbackImportTotal ?? mailbox.lookbackImportTotal,
    lookbackImportDone: done + batchSize,
    lookbackNextAt: new Date(ctx.clock().getTime() + PASS_GAP_MS),
  };
}

/**
 * The pass goes on: what the folders that were read keep as their cursors. A round that read
 * neither folder (the read time was already used up) is not progress and changes nothing.
 */
function continuingPassData(
  ctx: LookbackContext,
  started: Record<string, unknown>,
  sent: FolderOutcome | null,
  inbox: FolderOutcome | null
): Record<string, unknown> {
  // Only a folder that was really read through counts: one already DONE, one skipped for lack of
  // read time, or one cut short by the store time is not progress (it must not hide a stall).
  if (!sent?.advanced && !inbox?.advanced) return { ...started, ...cursors(sent, inbox) };
  return {
    ...started,
    ...progressed(ctx),
    lookbackNextAt: new Date(ctx.clock().getTime() + ROUND_GAP_MS),
    ...cursors(sent, inbox),
  };
}

/** The cursors the folders that were looked at keep. */
function cursors(sent: FolderOutcome | null, inbox: FolderOutcome | null): Record<string, unknown> {
  return {
    ...(sent ? { lookbackSentCursor: sent.cursor } : {}),
    ...(inbox ? { lookbackCursor: inbox.cursor } : {}),
  };
}

/**
 * Starts a pass: the next batch of leads and contacts created since the watermark, with the counts
 * the settings page shows. When there is none, the look-back is caught up and the import (if one was
 * shown) is over.
 */
async function beginPass(
  ctx: LookbackContext,
  since: Date
): Promise<
  { until: Date; started: Record<string, unknown> } | { result: Omit<LookbackResult, 'stored'> }
> {
  const { mailbox, prisma } = ctx;
  const cutoff = new Date(ctx.now.getTime() - COMMIT_GRACE_MS);
  const batch = await createdBetween(prisma, mailbox.tenantId, since, cutoff, PASS_ADDRESSES);
  if (batch.length === 0) {
    const showing = mailbox.lookbackImportTotal != null || !!mailbox.lookbackBackoffCount;
    if (!showing) return { result: { data: {}, more: false } };
    return {
      result: {
        data: {
          lookbackImportTotal: null,
          lookbackImportDone: 0,
          lookbackBackoffCount: 0,
          lookbackProgressAt: null,
        },
        more: false,
      },
    };
  }
  const until = batch[Math.min(batch.length, PASS_ADDRESSES) - 1]!.createdAt;
  const done = mailbox.lookbackImportTotal == null ? 0 : (mailbox.lookbackImportDone ?? 0);
  // The count only feeds the progress line: a failure of it never stops the import.
  const waiting = await countCreatedBetween(prisma, mailbox.tenantId, since, cutoff).catch(
    () => batch.length
  );
  return {
    until,
    started: {
      lookbackUntil: until,
      lookbackCursor: null,
      lookbackSentCursor: null,
      lookbackImportTotal: done + waiting,
      lookbackImportDone: done,
      // A new pass starts the no-progress clock again (a mailbox idle for days is not stalled).
      lookbackProgressAt: ctx.clock(),
    },
  };
}

/**
 * Reads the pass's folders (Sent first, as the normal sync does: a CRM-sent mail teaches the thread
 * a reply joins) and says what to store: the pass is finished, or it goes on from its cursors.
 * A folder that finished before a refusal is kept in `carried`.
 */
async function readPass(
  ctx: LookbackContext,
  since: Date,
  until: Date,
  started: Record<string, unknown>,
  carried: Record<string, unknown>
): Promise<Omit<LookbackResult, 'stored'>> {
  const { mailbox } = ctx;
  const rows = await createdBetween(ctx.prisma, mailbox.tenantId, since, until);
  const addresses = addressSet(rows);
  const fresh = Object.keys(started).length > 0;
  const sentFrom = fresh ? null : mailbox.lookbackSentCursor;
  const inboxFrom = fresh ? null : mailbox.lookbackCursor;
  const sent = await passFolder(ctx, 'sentitems', fromStored(sentFrom), addresses);
  if (sent) carried.lookbackSentCursor = sent.cursor;
  const inbox = await passFolder(ctx, 'inbox', fromStored(inboxFrom), addresses);
  if (sent?.done && inbox?.done) {
    return { data: finishedPassData(ctx, started, until, rows.length), more: false };
  }
  return { data: continuingPassData(ctx, started, sent, inbox), more: true };
}

/**
 * One tick of the mailbox's look-back: starts a pass when leads or contacts were created since the
 * last one, or continues the pass in progress. Never throws. A pass covers at most PASS_ADDRESSES
 * addresses and the next one waits PASS_GAP_MS; a provider refusal waits with exponential backoff.
 */
export async function runLookback(input: LookbackContext): Promise<LookbackResult> {
  // What was stored is counted as it happens, so a later failure still reports it.
  let stored = 0;
  const ctx: LookbackContext = {
    ...input,
    store: async (message, folder) => {
      const outcome = await input.store(message, folder);
      if (outcome === 'stored') stored += 1;
      return outcome;
    },
  };
  // What a refused round still keeps: the pass it started and the folder that finished.
  const carried: Record<string, unknown> = {};
  try {
    const { mailbox } = ctx;
    // Waiting (pacing between batches, or after a refusal): the normal sync is unaffected.
    if (mailbox.lookbackNextAt && mailbox.lookbackNextAt.getTime() > ctx.now.getTime()) {
      return nothing();
    }
    const since = mailbox.lookbackWatermark ?? new Date(0);
    const begun = mailbox.lookbackUntil ? null : await beginPass(ctx, since);
    if (begun && 'result' in begun) return { ...begun.result, stored };
    const until = begun ? begun.until : mailbox.lookbackUntil!;
    const started = begun ? begun.started : {};
    Object.assign(carried, started);
    const pass = await readPass(ctx, since, until, started, carried);
    return { ...pass, stored };
  } catch (error) {
    // A provider answer (a refusal, an error): the round waits and is retried with backoff.
    if (error instanceof MailboxTransportError) {
      return onProviderPause(ctx, carried, stored, error.code);
    }
    // A look-back problem never affects the sync: keep what is stored and try again next time.
    console.warn('[mail-sync] look-back failed', {
      mailboxId: ctx.mailbox.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ...nothing(), stored };
  }
}
