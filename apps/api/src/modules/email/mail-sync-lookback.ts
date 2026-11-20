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
import type { MailSyncReader, SyncFolder, SyncRound, SyncedMessage } from './mail-sync-reader';

/** How far back a look-back reads. */
export const LOOKBACK_DAYS = 90;
/** Leads and contacts one pass looks for (more are worked off pass by pass). */
export const PASS_ADDRESSES = 300;
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
}

/** One folder's pass round: reads it and logs the mail that is with the pass's addresses. */
async function passFolder(
  ctx: LookbackContext,
  folder: SyncFolder,
  cursor: string | null,
  addresses: ReadonlySet<string>
): Promise<FolderOutcome | null> {
  if (cursor === FOLDER_DONE) return { cursor: FOLDER_DONE, done: true };
  // Out of read time already: leave the folder as it is for the next tick.
  if (ctx.clock().getTime() >= ctx.deadline) return null;
  const { round, startedFrom } = await readFolder(ctx, folder, cursor);
  for (const message of round.messages) {
    // Out of time: stop well inside the lease and keep the cursor the round started from (never a
    // rejected one); what was stored is deduped next time.
    if (ctx.clock().getTime() >= ctx.storeBy) return { cursor: startedFrom ?? '', done: false };
    if (concerns(message, addresses, folder)) await ctx.store(message, folder);
  }
  if (round.complete) return { cursor: FOLDER_DONE, done: true };
  return { cursor: round.cursor ?? '', done: false };
}

/** A stored cursor of '' means "start the folder from the beginning". */
const fromStored = (cursor: string | null): string | null => (cursor ? cursor : null);

/**
 * One tick of the mailbox's look-back: starts a pass when leads or contacts were created since the
 * last one, or continues the pass in progress. Never throws.
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
  try {
    const { mailbox, prisma } = ctx;
    const since = mailbox.lookbackWatermark ?? new Date(0);
    let until = mailbox.lookbackUntil;
    const started: Record<string, unknown> = {};
    if (!until) {
      const cutoff = new Date(ctx.now.getTime() - COMMIT_GRACE_MS);
      const batch = await createdBetween(prisma, mailbox.tenantId, since, cutoff, PASS_ADDRESSES);
      if (batch.length === 0) return nothing();
      until = batch[Math.min(batch.length, PASS_ADDRESSES) - 1]!.createdAt;
      Object.assign(started, {
        lookbackUntil: until,
        lookbackCursor: null,
        lookbackSentCursor: null,
      });
    }
    const addresses = addressSet(await createdBetween(prisma, mailbox.tenantId, since, until));
    const startedFresh = Object.keys(started).length > 0;
    const sentFrom = startedFresh ? null : mailbox.lookbackSentCursor;
    const inboxFrom = startedFresh ? null : mailbox.lookbackCursor;
    // Sent first, as the normal sync does: a CRM-sent mail teaches the thread a reply joins.
    const sent = await passFolder(ctx, 'sentitems', fromStored(sentFrom), addresses);
    const inbox = await passFolder(ctx, 'inbox', fromStored(inboxFrom), addresses);
    if (sent?.done && inbox?.done) {
      // The pass is finished: its leads and contacts are looked for. A further batch may wait.
      return {
        data: {
          lookbackWatermark: until,
          lookbackUntil: null,
          lookbackCursor: null,
          lookbackSentCursor: null,
        },
        more: true,
        stored,
      };
    }
    return {
      data: {
        ...started,
        ...(sent ? { lookbackSentCursor: sent.cursor } : {}),
        ...(inbox ? { lookbackCursor: inbox.cursor } : {}),
      },
      more: true,
      stored,
    };
  } catch (error) {
    // A look-back problem never affects the sync: keep what is stored and try again next time.
    console.warn('[mail-sync] look-back failed', {
      mailboxId: ctx.mailbox.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { ...nothing(), stored };
  }
}
