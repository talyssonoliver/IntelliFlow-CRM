/**
 * Microsoft Graph inbox reader for Outlook / Microsoft 365 two-way sync (#1177).
 *
 * Reads a mailbox folder through Graph's delta query with the delegated `Mail.Read` scope the
 * mailbox already holds (PG-207, MICROSOFT_MAILBOX_SCOPES). The caller keeps the cursor: the
 * delta link Graph returns at the end of a round, or the next-page link when a round stopped at
 * the page cap, so the next round resumes where this one stopped.
 *
 * - The access token is only ever sent to graph.microsoft.com: a cursor or page link on any
 *   other host is refused (a stored cursor is data, not a trusted URL).
 * - The first round only reads mail received in the last `initialDays`.
 * - Bodies are read as text and cut to `maxBodyChars`; nothing else of the message is kept.
 * - 410 Gone (an expired or invalid delta token) is reported as `expired`, so the caller can
 *   restart from scratch instead of failing the mailbox.
 * - Every other failure is a MailboxTransportError code; provider text never leaves here.
 */
import { MailboxTransportError } from './mailbox-errors';

const GRAPH_HOST = 'graph.microsoft.com';
const GRAPH_ME = `https://${GRAPH_HOST}/v1.0/me`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The message fields read: identity, threading, people, time, read state and the text body. */
const SELECT = [
  'id',
  'internetMessageId',
  'conversationId',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'isRead',
  'body',
].join(',');

export type GraphSyncFolder = 'inbox' | 'sentitems';

export interface GraphSyncedMessage {
  /** Graph's message id: the dedupe key per mailbox. */
  providerMessageId: string;
  internetMessageId: string | null;
  conversationId: string | null;
  subject: string;
  fromAddress: string | null;
  fromName: string | null;
  to: string[];
  cc: string[];
  receivedAt: Date;
  isRead: boolean;
  bodyText: string;
}

export interface GraphDeltaRound {
  /** New or changed messages, in the order Graph returned them. */
  messages: GraphSyncedMessage[];
  /** Graph ids reported as removed from the folder. */
  removedIds: string[];
  /** What to resume from next time; null only when `expired`. */
  cursor: string | null;
  /** True when the round reached Graph's delta link (nothing left to read now). */
  complete: boolean;
  /** True when Graph no longer accepts the cursor: restart with a null cursor. */
  expired: boolean;
}

export interface GraphDeltaOptions {
  folder: GraphSyncFolder;
  /** Pages read per round; the rest is resumed from the returned cursor. */
  maxPages: number;
  pageSize: number;
  /** How far back the first round reads. */
  initialDays: number;
  maxBodyChars: number;
  now: Date;
  /** Longest one Graph request may take before the round fails (a hung read never holds a tick). */
  requestTimeoutMs?: number;
  /** Time a round may spend reading pages; past it the round stops and resumes next time. */
  budgetMs?: number;
  /** Clock for the budget; injectable for tests. */
  clock?: () => number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

interface GraphAddress {
  emailAddress?: { address?: string | null; name?: string | null } | null;
}

interface GraphDeltaMessage {
  id?: string;
  internetMessageId?: string | null;
  conversationId?: string | null;
  subject?: string | null;
  from?: GraphAddress | null;
  toRecipients?: GraphAddress[] | null;
  ccRecipients?: GraphAddress[] | null;
  receivedDateTime?: string | null;
  isRead?: boolean | null;
  body?: { content?: string | null } | null;
  '@removed'?: unknown;
}

interface GraphDeltaPage {
  value?: GraphDeltaMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/** True for an https URL on Graph's own host: the only place the token may go. */
export function isGraphUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === GRAPH_HOST;
  } catch {
    return false;
  }
}

/** The first delta URL for a folder: mail received in the last `initialDays`, newest data only. */
export function initialDeltaUrl(folder: GraphSyncFolder, initialDays: number, now: Date): string {
  const since = new Date(now.getTime() - initialDays * DAY_MS).toISOString();
  const params = new URLSearchParams({
    $select: SELECT,
    $filter: `receivedDateTime ge ${since}`,
  });
  return `${GRAPH_ME}/mailFolders('${folder}')/messages/delta?${params.toString()}`;
}

/**
 * Text as Postgres can store it: a NUL character is refused by text columns, and one stored
 * message must never stop a mailbox's sync at that message.
 */
export function storableText(value: string): string {
  return value.replaceAll('\u0000', '');
}

function address(entry: GraphAddress | null | undefined): string | null {
  const raw = storableText(entry?.emailAddress?.address ?? '')
    .trim()
    .toLowerCase();
  return raw && raw.includes('@') ? raw : null;
}

function addresses(list: GraphAddress[] | null | undefined): string[] {
  return (list ?? []).map(address).filter((a): a is string => a !== null);
}

/** One delta entry as a synced message, or null when Graph sent too little to use it. */
export function toSyncedMessage(
  entry: GraphDeltaMessage,
  maxBodyChars: number
): GraphSyncedMessage | null {
  if (!entry.id || !entry.receivedDateTime) return null;
  const receivedAt = new Date(entry.receivedDateTime);
  if (Number.isNaN(receivedAt.getTime())) return null;
  return {
    providerMessageId: entry.id,
    internetMessageId: storableText(entry.internetMessageId ?? '').trim() || null,
    conversationId: entry.conversationId ?? null,
    subject: storableText(entry.subject ?? '').trim() || '(No subject)',
    fromAddress: address(entry.from),
    fromName: storableText(entry.from?.emailAddress?.name ?? '').trim() || null,
    to: addresses(entry.toRecipients),
    cc: addresses(entry.ccRecipients),
    receivedAt,
    isRead: entry.isRead === true,
    bodyText: storableText(entry.body?.content ?? '').slice(0, maxBodyChars),
  };
}

function httpError(status: number): MailboxTransportError {
  if (status === 401 || status === 403) return new MailboxTransportError('AUTH_FAILED');
  if (status === 429) return new MailboxTransportError('RATE_LIMITED');
  if (status >= 500) return new MailboxTransportError('CONNECT_FAILED');
  return new MailboxTransportError('REJECTED');
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

async function readPage(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; page: GraphDeltaPage | null }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
  if (response.status === 410) return { status: 410, page: null };
  if (!response.ok) throw httpError(response.status);
  try {
    return { status: response.status, page: (await response.json()) as GraphDeltaPage };
  } catch {
    throw new MailboxTransportError('REJECTED');
  }
}

const EXPIRED: Readonly<GraphDeltaRound> = {
  messages: [],
  removedIds: [],
  cursor: null,
  complete: false,
  expired: true,
};

/** Adds one page's entries to the round: removals by id, usable messages in full. */
function collectEntries(page: GraphDeltaPage, round: GraphDeltaRound, maxBodyChars: number): void {
  for (const entry of page.value ?? []) {
    if (entry['@removed'] === undefined) {
      const message = toSyncedMessage(entry, maxBodyChars);
      if (message) round.messages.push(message);
    } else if (entry.id) {
      round.removedIds.push(entry.id);
    }
  }
}

/**
 * Where a round goes after a page: done at Graph's delta link, on to the next page link, or
 * stopped (no usable continuation) with the cursor left on the page just read.
 */
function nextStep(
  page: GraphDeltaPage,
  url: string
): { done: true; cursor: string; complete: boolean } | { done: false; next: string } {
  const delta = page['@odata.deltaLink'];
  if (delta && isGraphUrl(delta)) return { done: true, cursor: delta, complete: true };
  const next = page['@odata.nextLink'];
  if (next && isGraphUrl(next)) return { done: false, next };
  return { done: true, cursor: url, complete: false };
}

/**
 * One delta round from `cursor` (null starts the folder from scratch). Stops at the page cap,
 * when the time budget is spent, at the delta link, or at a continuation link off Graph's host (then the cursor stays at the
 * last page read, so nothing is skipped).
 */
export async function readGraphMailDelta(
  accessToken: string,
  cursor: string | null,
  options: GraphDeltaOptions
): Promise<GraphDeltaRound> {
  // A stored cursor that is not a Graph URL is never followed: start over instead.
  if (cursor !== null && !isGraphUrl(cursor)) return { ...EXPIRED };
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    // Immutable ids: a message keeps its id when it moves between folders, so it is never
    // taken for a new message (Graph's default id changes on a move).
    Prefer: `IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=${String(options.pageSize)}`,
  };
  const round: GraphDeltaRound = {
    messages: [],
    removedIds: [],
    cursor,
    complete: false,
    expired: false,
  };
  let url: string = cursor ?? initialDeltaUrl(options.folder, options.initialDays, options.now);
  const clock = options.clock ?? Date.now;
  const stopAt = options.budgetMs === undefined ? Infinity : clock() + options.budgetMs;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  for (let pages = 0; pages < options.maxPages; pages++) {
    // Out of time after at least one page: stop here, the cursor resumes at the next page.
    if (pages > 0 && clock() >= stopAt) break;
    const { status, page } = await readPage(fetchImpl, url, headers, timeoutMs);
    if (status === 410 || !page) return { ...EXPIRED };
    collectEntries(page, round, options.maxBodyChars);
    const step = nextStep(page, url);
    if (step.done) return { ...round, cursor: step.cursor, complete: step.complete };
    url = step.next;
    round.cursor = step.next;
  }
  return round;
}
