/**
 * Zoho Mail reader for reply sync (MVP-001): the folder ids, and one round of a folder's new mail.
 *
 * Zoho's list API (`/messages/view`) has no "since" filter, so a round pages newest first and stops
 * at mail older than the stored cursor: the last receivedTime read plus the message ids seen at
 * that very time (two mails can share a millisecond; those ids are skipped, never a stop). The
 * first round reads the last `initialDays`.
 * - Bodies are not read here: each message carries `loadBody()`, called by the sync only for mail
 *   it keeps, so personal mail's content is never fetched.
 * - When a round hits its page cap or time budget before the cursor, it is not complete: the cursor
 *   stays and records where to read on, so the next round carries on and no mail is skipped. The
 *   first round's 30-day window is read the same way, over as many rounds as it takes.
 * - Requests go through `zohoAccountGet`: Zoho's own host, a timeout, dead tokens read from the
 *   body, ids kept exact.
 */
import { MailboxTransportError } from './mailbox-errors';
import { zohoAccountGet, type ZohoAccountRef } from './zoho-mailbox';
import { decodeEntities, displayName, zohoAddresses, zohoBodyText } from './zoho-text';
import type { MailContent } from './mail-content';
import { readZohoContent } from './zoho-mail-content';

// The address and body parsing lives in zoho-text.ts; these two stay part of this module's API.
export { zohoAddresses, zohoBodyText } from './zoho-text';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How far below the cursor each round looks again: mail can be listed late with an older time (slow
 * delivery, a scan, a mail moved back into the folder). What is already logged is skipped by the
 * sync's dedupe.
 */
const LOOKBACK_MS = 60 * 60 * 1000;

export type ZohoSyncFolder = 'inbox' | 'sentitems';

export interface ZohoFolderIds {
  inbox: string | null;
  sent: string | null;
}

export interface ZohoSyncedMessage {
  providerMessageId: string;
  internetMessageId: string | null;
  /** Zoho's thread id (its first mail's id): replies to a mail share it. */
  conversationId: string | null;
  subject: string;
  fromAddress: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedAt: Date;
  isRead: boolean;
  /** Empty: the body is read only through `loadBody()`. */
  bodyText: string;
  loadBody: () => Promise<string>;
  /** The text, the provider's HTML and the attachments' metadata (one content read, one info read). */
  loadContent: () => Promise<MailContent>;
}

export interface ZohoReadRound {
  messages: ZohoSyncedMessage[];
  cursor: string | null;
  complete: boolean;
  expired: boolean;
}

export interface ZohoReadOptions {
  folderId: string;
  initialDays: number;
  pageSize: number;
  maxPages: number;
  maxBodyChars: number;
  now: Date;
  budgetMs?: number;
  clock?: () => number;
  fetchImpl?: typeof fetch;
}

interface ZohoListItem {
  messageId?: string;
  threadId?: string;
  fromAddress?: string;
  sender?: string;
  toAddress?: string;
  ccAddress?: string;
  subject?: string;
  receivedTime?: string | number;
  status?: string | number;
  hasAttachment?: string | number | boolean;
}

/**
 * The last mails of the page before, which the next page must still hold (it starts on the first of
 * them), and the receivedTime of that first, newest one.
 */
interface Anchor {
  ids: string[];
  t: number;
}

/** How many mails each page repeats from the page before: up to 5 removals stay covered. */
function overlapOf(pageSize: number): number {
  return Math.min(5, Math.max(0, pageSize - 1));
}

/** A point in the folder: a receivedTime, and the ids read at that very millisecond. */
interface Mark {
  t: number;
  ids: string[];
}

/**
 * Where a folder's sync stands: everything newer than the mark has been read, unless `resume` is
 * set. Then a catch-up stopped early: the next round reads on from list position `start`, and when
 * it reaches the mark the cursor becomes `top`, the newest mail seen when the catch-up began.
 */
interface Cursor extends Mark {
  /** `anchor`: the mail at `start` when it was saved (see anchorState). */
  resume?: { start: number; top: Mark; anchor?: Anchor };
  /**
   * Set once a catch-up completes: the time it started from. The next round (and its own catch-up,
   * if it needs one) reads down to there again, so mail listed late above the catch-up's position
   * with an older time is still found. That sweep does not ask for another one.
   */
  sweep?: number;
}

/** A `{t, ids}` mark, or null when the value is not one. */
function asMark(value: unknown): Mark | null {
  const mark = value as Partial<Mark> | null;
  if (!mark || typeof mark.t !== 'number' || !Array.isArray(mark.ids)) return null;
  return { t: mark.t, ids: mark.ids.filter((id): id is string => typeof id === 'string') };
}

function parseCursor(cursor: string | null): Cursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(cursor) as Partial<Cursor>;
    const parsed = asMark(value);
    if (!parsed) return null;
    const mark: Cursor =
      typeof value.sweep === 'number' && Number.isFinite(value.sweep)
        ? { ...parsed, sweep: value.sweep }
        : parsed;
    const top = asMark(value.resume?.top);
    const start = value.resume?.start;
    if (!top || typeof start !== 'number' || !Number.isInteger(start) || start < 1) return mark;
    const anchor = asMark(value.resume?.anchor);
    return {
      ...mark,
      resume: { start, top, ...(anchor ? { anchor: { ids: anchor.ids, t: anchor.t } } : {}) },
    };
  } catch {
    return null;
  }
}

/** The Inbox and Sent folder ids of the account (by Zoho's folder type, not its name). */
export async function readZohoFolderIds(
  accessToken: string,
  ref: ZohoAccountRef,
  fetchImpl: typeof fetch = fetch
): Promise<ZohoFolderIds> {
  const body = (await zohoAccountGet(fetchImpl, accessToken, ref, '/folders')) as {
    data?: Array<{ folderId?: string; folderType?: string }>;
  };
  const of = (type: string) =>
    (body.data ?? []).find((f) => (f.folderType ?? '').toLowerCase() === type)?.folderId ?? null;
  return { inbox: of('inbox'), sent: of('sent') };
}

function toMessage(
  item: ZohoListItem,
  accessToken: string,
  ref: ZohoAccountRef,
  options: ZohoReadOptions,
  fetchImpl: typeof fetch
): ZohoSyncedMessage | null {
  const receivedTime = Number(item.receivedTime);
  if (!item.messageId || !Number.isFinite(receivedTime)) return null;
  const messageId = item.messageId;
  // The list puts the bare address in `fromAddress` and the sender's name in `sender`.
  const sender = decodeEntities(item.sender ?? '').trim();
  const senderName = sender && !sender.includes('@') ? sender : null;
  // One content read serves the text and the HTML; a repeat call reuses it.
  let raw: Promise<string> | undefined;
  const rawContent = (): Promise<string> => {
    raw ??= (async () => {
      const path = `/folders/${encodeURIComponent(options.folderId)}/messages/${encodeURIComponent(messageId)}/content`;
      const body = (await zohoAccountGet(fetchImpl, accessToken, ref, path)) as {
        data?: { content?: string };
      };
      return body.data?.content ?? '';
    })();
    return raw;
  };
  const hasAttachment = !['0', 'false'].includes(String(item.hasAttachment).toLowerCase());
  const content = async (): Promise<MailContent> => {
    const html = await rawContent();
    const rich = await readZohoContent(
      fetchImpl,
      accessToken,
      ref,
      options.folderId,
      messageId,
      html,
      hasAttachment
    );
    return { text: zohoBodyText(html, options.maxBodyChars), ...rich };
  };
  return {
    providerMessageId: messageId,
    internetMessageId: null,
    // A mail with no reply yet has no thread id; Zoho's thread id is its first mail's id, so the
    // mail's own id is the conversation a later reply names.
    conversationId: item.threadId ?? messageId,
    subject: (item.subject ?? '').replaceAll('\u0000', '').trim() || '(No subject)',
    fromAddress: zohoAddresses(item.fromAddress)[0] ?? zohoAddresses(sender)[0] ?? null,
    fromName: displayName(item.fromAddress) ?? senderName,
    to: zohoAddresses(item.toAddress),
    cc: zohoAddresses(item.ccAddress),
    receivedAt: new Date(receivedTime),
    isRead: String(item.status) === '1',
    bodyText: '',
    loadBody: async () => zohoBodyText(await rawContent(), options.maxBodyChars),
    loadContent: content,
  };
}

/** One page of the folder, newest first. */
async function readPage(
  accessToken: string,
  ref: ZohoAccountRef,
  options: ZohoReadOptions,
  fetchImpl: typeof fetch,
  start: number
): Promise<ZohoListItem[]> {
  // Every page after the first repeats the last few mails of the page before (overlapOf): when mail
  // already read is removed meanwhile, the list moves up and that overlap still returns the mail
  // that moved onto the earlier page (the duplicates it otherwise brings are dropped by id).
  const query = new URLSearchParams({
    folderId: options.folderId,
    start: String(start),
    limit: String(options.pageSize),
    sortBy: 'date',
    sortorder: 'false',
    includeto: 'true',
  }).toString();
  const body = (await zohoAccountGet(fetchImpl, accessToken, ref, `/messages/view?${query}`)) as {
    data?: ZohoListItem[];
  };
  return body.data ?? [];
}

/** True for mail older than the cursor (or the first round's window): the newest-first list ends. */
function pastFloor(message: ZohoSyncedMessage, floor: number): boolean {
  return message.receivedAt.getTime() < floor;
}

/**
 * True for mail already read: at the cursor's very millisecond with an id it holds. Zoho orders
 * mail sharing a time arbitrarily, so these are filtered out, never a reason to stop.
 */
function seenAtCursor(message: ZohoSyncedMessage, from: Cursor | null): boolean {
  return message.receivedAt.getTime() === from?.t && from.ids.includes(message.providerMessageId);
}

/** The mail of a page not read before: neither at the cursor nor already taken this round. */
function keepNew(
  messages: ZohoSyncedMessage[],
  from: Cursor | null,
  taken: Set<string>
): ZohoSyncedMessage[] {
  return messages.filter((message) => {
    if (seenAtCursor(message, from) || taken.has(message.providerMessageId)) return false;
    taken.add(message.providerMessageId);
    return true;
  });
}

/** Where the next round starts: the newest mail read (with the ids at that very time). */
function nextCursor(fresh: ZohoSyncedMessage[], from: Cursor | null, floor: number): Cursor {
  const newest = fresh.at(-1)?.receivedAt.getTime();
  // Nothing new, or only mail found again below the cursor: the cursor never moves back.
  if (newest === undefined || (from && newest < from.t)) return from ?? { t: floor, ids: [] };
  const atNewest = fresh
    .filter((m) => m.receivedAt.getTime() === newest)
    .map((m) => m.providerMessageId);
  // Mail at the cursor's own millisecond keeps the ids already seen there too.
  return { t: newest, ids: newest === from?.t ? [...from.ids, ...atNewest] : atNewest };
}

/** What one round's page reads found: new mail newest first, and whether the cursor was reached. */
interface PageRun {
  fresh: ZohoSyncedMessage[];
  reachedCursor: boolean;
  /** Where the next unread page starts (1-based), and the mail it must start on. */
  nextStart: number;
  anchor: Anchor | null;
  /** The list moved up since the last page (mail removed): mail may have slipped past. */
  shifted: boolean;
}

/**
 * Where a page stands against the anchor, the last mails of the page before (it starts on them):
 * - `held`: the page holds one of them. Then at most as many mails were removed above as the page
 *   repeats, so the first unread mail is on this page: read on (new mail only pushes them down);
 * - `pushed`: every mail on the page is newer, so new mail pushed them below the page: these were
 *   read already, step on to find them;
 * - `pulled`: the page holds older mail and none of them, so more mail was removed above than the
 *   overlap covers and unread mail may sit before this page, unseen.
 */
function anchorState(items: ZohoListItem[], anchor: Anchor | null): 'held' | 'pushed' | 'pulled' {
  if (anchor === null || anchor.ids.length === 0) return 'held';
  if (items.some((item) => anchor.ids.includes(String(item.messageId)))) return 'held';
  const newer = (item: ZohoListItem) => Number(item.receivedTime) > anchor.t;
  return items.length > 0 && items.every(newer) ? 'pushed' : 'pulled';
}

/** The last `overlap` mails of a page: the anchor the next page must hold. */
function lastOf(items: ZohoListItem[], overlap: number): Anchor | null {
  const tail = overlap > 0 ? items.slice(-overlap) : [];
  const t = Number(tail[0]?.receivedTime);
  if (tail.length === 0 || !Number.isFinite(t)) return null;
  return { ids: tail.map((item) => String(item.messageId)), t };
}

/** Reads pages from `start` down to the cursor, within the page cap and the time budget. */
async function readPages(
  accessToken: string,
  ref: ZohoAccountRef,
  options: ZohoReadOptions,
  from: Cursor | null,
  floor: number,
  place: { start: number; anchor: Anchor | null }
): Promise<PageRun> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? Date.now;
  const stopAt = options.budgetMs === undefined ? Infinity : clock() + options.budgetMs;
  // Where this round stops reading: an hour below the cursor (LOOKBACK_MS), or the first round's window.
  const readTo = from ? Math.min(from.t, from.sweep ?? from.t) - LOOKBACK_MS : floor;
  // Every page after the first repeats the last mails of the page before (see readPage).
  const overlap = overlapOf(options.pageSize);
  const step = Math.max(1, options.pageSize - overlap);
  const fresh: ZohoSyncedMessage[] = [];
  // Offset pages shift when mail arrives between two reads: the same mail can come back twice.
  const taken = new Set<string>();
  const run = {
    reachedCursor: false,
    shifted: false,
    nextStart: place.start,
    anchor: place.anchor,
  };
  for (let page = 0; page < options.maxPages && !run.reachedCursor; page++) {
    if (page > 0 && clock() >= stopAt) break;
    const items = await readPage(accessToken, ref, options, fetchImpl, run.nextStart);
    const state = anchorState(items, run.anchor);
    if (state === 'pulled') {
      run.shifted = true;
      break;
    }
    run.nextStart += step;
    if (state === 'pushed') continue;
    run.anchor = lastOf(items, overlap) ?? run.anchor;
    const messages = items
      .map((item) => toMessage(item, accessToken, ref, options, fetchImpl))
      .filter((m): m is ZohoSyncedMessage => m !== null);
    const stop = messages.findIndex((m) => pastFloor(m, readTo));
    fresh.push(...keepNew(stop === -1 ? messages : messages.slice(0, stop), from, taken));
    run.reachedCursor = stop !== -1 || items.length < options.pageSize;
  }
  return { fresh, ...run };
}

/**
 * One round of a folder's mail newer than `cursor` (null: the last `initialDays`), oldest first.
 * A round that stops before the cursor (page cap or time budget) keeps the cursor, says where to
 * carry on and is not complete: the next round reads on from there, so no mail is skipped. Once it
 * reaches the cursor, the cursor moves to the newest mail seen when the catch-up began (mail that
 * arrived meanwhile is newer still, so the round after reads it), and that round also sweeps down
 * to where the catch-up started, for mail listed late above the catch-up's position.
 */
export async function readZohoFolder(
  accessToken: string,
  ref: ZohoAccountRef,
  cursor: string | null,
  options: ZohoReadOptions
): Promise<ZohoReadRound> {
  if (!options.folderId) throw new MailboxTransportError('REJECTED');
  const from = parseCursor(cursor);
  const floor = from?.t ?? options.now.getTime() - options.initialDays * DAY_MS;
  const place = { start: from?.resume?.start ?? 1, anchor: from?.resume?.anchor ?? null };
  const run = await readPages(accessToken, ref, options, from, floor, place);
  const fresh = run.fresh.reverse(); // oldest first, as the sync stores them
  const top = from?.resume?.top ?? nextCursor(fresh, from, floor);
  if (run.reachedCursor) {
    const done: Cursor = { t: top.t, ids: top.ids };
    // A catch-up that took several rounds is swept once more, down to where it started (see sweep).
    const next = from?.resume && from.sweep === undefined ? { ...done, sweep: from.t } : done;
    return { messages: fresh, cursor: JSON.stringify(next), complete: true, expired: false };
  }
  // Stopped early: carry on from the next page, or from the top when the list moved up under us
  // (the floor stays, so mail read again is only deduped by the sync, never skipped).
  const resume = run.shifted
    ? { start: 1, top }
    : { start: run.nextStart, top, ...(run.anchor === null ? {} : { anchor: run.anchor }) };
  const sweep = from?.sweep === undefined ? {} : { sweep: from.sweep };
  const held: Cursor = { t: from?.t ?? floor, ids: from?.ids ?? [], resume, ...sweep };
  return { messages: fresh, cursor: JSON.stringify(held), complete: false, expired: false };
}
