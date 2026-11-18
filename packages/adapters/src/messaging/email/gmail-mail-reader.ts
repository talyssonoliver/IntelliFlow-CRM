/**
 * Gmail reader for mailbox sync (MVP-011): one round of a label's new mail, INBOX (received) or
 * SENT (sent from Gmail itself), for a Google Workspace mailbox that granted gmail.readonly.
 *
 * Incremental through Gmail's history: the cursor holds a historyId, and a round lists what was
 * added to the label since then (`history.list`, messages added or given the label). The first
 * round has no history to start from: it takes the mailbox's current historyId first, then lists
 * the label's last `initialDays` (`messages.list`), so mail arriving meanwhile is in the history the
 * next round reads (what both return is deduped by the sync).
 * - Bodies are not read here: each message carries `loadBody()`, called by the sync only for mail
 *   it keeps, so personal mail's content is never fetched.
 * - A round that hits its page cap or time budget is not complete: the cursor keeps where it was
 *   and the page to read on from, so no mail is skipped.
 * - A historyId Gmail no longer holds (404) is `expired`: the sync starts the label again.
 * - Requests go only to Gmail's own API host, each with a timeout; failures are reduced to
 *   MailboxTransportError codes, never provider text.
 */
import { MailboxTransportError } from './mailbox-errors';
import { displayName, zohoAddresses as headerAddresses, zohoBodyText } from './zoho-text';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEADERS = ['From', 'To', 'Cc', 'Subject', 'Message-ID'] as const;

export type GmailSyncLabel = 'INBOX' | 'SENT';

export interface GmailSyncedMessage {
  providerMessageId: string;
  internetMessageId: string | null;
  /** Gmail's thread id: replies to a mail share it. */
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
}

export interface GmailReadRound {
  messages: GmailSyncedMessage[];
  cursor: string | null;
  complete: boolean;
  expired: boolean;
}

export interface GmailReadOptions {
  label: GmailSyncLabel;
  initialDays: number;
  pageSize: number;
  maxPages: number;
  maxBodyChars: number;
  now: Date;
  budgetMs?: number;
  clock?: () => number;
  fetchImpl?: typeof fetch;
}

/**
 * Where a label's sync stands: everything up to historyId `h` has been read, unless a listing is
 * under way. `list`: the first round's window (mail after `after`, epoch seconds), read on from
 * `page`. `page` alone: a history listing from `h` that stopped early, read on from that page.
 */
interface Cursor {
  h: string;
  page?: string;
  list?: { after: number; page?: string };
}

/** A Gmail history id: a decimal string (kept as text, it can pass what a JSON number holds). */
function isHistoryId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,30}$/.test(value);
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

function parseCursor(cursor: string | null): Cursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(cursor) as Partial<Cursor>;
    if (!isHistoryId(value.h)) return null;
    const list = value.list;
    if (list && typeof list.after === 'number' && Number.isFinite(list.after)) {
      return {
        h: value.h,
        list: { after: list.after, ...(isToken(list.page) ? { page: list.page } : {}) },
      };
    }
    return { h: value.h, ...(isToken(value.page) ? { page: value.page } : {}) };
  } catch {
    return null;
  }
}

class NotFound extends Error {}

/** A failed Gmail call as a code. Gmail answers per-user throttling with 403 and a rate reason. */
async function apiError(response: Response): Promise<Error> {
  if (response.status === 404) return new NotFound();
  if (response.status === 403) {
    const body = await response.text().catch(() => '');
    if (/rateLimitExceeded/i.test(body)) return new MailboxTransportError('RATE_LIMITED');
    return new MailboxTransportError('AUTH_FAILED');
  }
  if (response.status === 401) return new MailboxTransportError('AUTH_FAILED');
  if (response.status === 429) return new MailboxTransportError('RATE_LIMITED');
  if (response.status >= 500) return new MailboxTransportError('CONNECT_FAILED');
  return new MailboxTransportError('REJECTED');
}

/** One authenticated GET on the mailbox's Gmail API: Gmail's own host only, with a timeout. */
async function gmailGet<T>(fetchImpl: typeof fetch, accessToken: string, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
  if (!response.ok) throw await apiError(response);
  try {
    return (await response.json()) as T;
  } catch {
    throw new MailboxTransportError('REJECTED');
  }
}

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
}

interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
}

function header(message: GmailMessage, name: string): string | null {
  const wanted = name.toLowerCase();
  return message.payload?.headers?.find((h) => h.name?.toLowerCase() === wanted)?.value ?? null;
}

/** The first part of a type in the MIME tree, depth first (the order the mail shows them). */
function firstPart(part: GmailPart | undefined, mimeType: string): GmailPart | null {
  if (!part) return null;
  if (part.mimeType?.toLowerCase() === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = firstPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** The mail's text: its plain-text part, else its HTML part as text; NUL removed. */
export function gmailBodyText(payload: GmailPart | undefined, maxChars: number): string {
  const decode = (part: GmailPart) =>
    Buffer.from(part.body?.data ?? '', 'base64url').toString('utf8');
  const plain = firstPart(payload, 'text/plain');
  if (plain) {
    const text = decode(plain).replaceAll('\u0000', '').replace(/\r\n/g, '\n').trim();
    return text.slice(0, maxChars);
  }
  const html = firstPart(payload, 'text/html');
  return html ? zohoBodyText(decode(html), maxChars) : '';
}

/** Mail never logged from a label: drafts, spam and chats. */
const SKIPPED_LABELS = ['DRAFT', 'SPAM', 'CHAT'];

function toMessage(
  item: GmailMessage,
  accessToken: string,
  options: GmailReadOptions,
  fetchImpl: typeof fetch
): GmailSyncedMessage | null {
  const receivedTime = Number(item.internalDate);
  if (!item.id || !Number.isFinite(receivedTime)) return null;
  const labels = item.labelIds ?? [];
  if (labels.some((label) => SKIPPED_LABELS.includes(label))) return null;
  const id = item.id;
  const from = header(item, 'From');
  const messageId = header(item, 'Message-ID')?.trim();
  return {
    providerMessageId: id,
    internetMessageId: messageId || null,
    conversationId: item.threadId ?? id,
    subject: (header(item, 'Subject') ?? '').replaceAll('\u0000', '').trim() || '(No subject)',
    fromAddress: headerAddresses(from)[0] ?? null,
    fromName: displayName(from),
    to: headerAddresses(header(item, 'To')),
    cc: headerAddresses(header(item, 'Cc')),
    receivedAt: new Date(receivedTime),
    isRead: !labels.includes('UNREAD'),
    bodyText: '',
    loadBody: async () => {
      const full = await gmailGet<GmailMessage>(
        fetchImpl,
        accessToken,
        `/messages/${encodeURIComponent(id)}?format=full`
      ).catch((error: unknown) => {
        // Deleted since it was listed: that one mail is skipped, the round goes on.
        throw error instanceof NotFound ? new MailboxTransportError('REJECTED') : error;
      });
      return gmailBodyText(full.payload, options.maxBodyChars);
    },
  };
}

/** A listed message's headers and labels; null when it is gone or never logged (see toMessage). */
async function readMessage(
  id: string,
  accessToken: string,
  options: GmailReadOptions,
  fetchImpl: typeof fetch
): Promise<GmailSyncedMessage | null> {
  const query = new URLSearchParams({ format: 'metadata' });
  for (const name of HEADERS) query.append('metadataHeaders', name);
  try {
    const item = await gmailGet<GmailMessage>(
      fetchImpl,
      accessToken,
      `/messages/${encodeURIComponent(id)}?${query.toString()}`
    );
    return toMessage(item, accessToken, options, fetchImpl);
  } catch (error) {
    if (error instanceof NotFound) return null; // deleted between the listing and this read
    throw error;
  }
}

interface ListPage {
  ids: string[];
  next: string | null;
  /** History listings: the mailbox's historyId when the page was read. */
  historyId: string | null;
}

interface HistoryRecord {
  messagesAdded?: Array<{ message?: { id?: string; labelIds?: string[] } }>;
  labelsAdded?: Array<{ message?: { id?: string }; labelIds?: string[] }>;
}

/** One page of what was added to the label since `h` (new mail, or mail given the label). */
async function historyPage(
  fetchImpl: typeof fetch,
  accessToken: string,
  options: GmailReadOptions,
  h: string,
  page: string | undefined
): Promise<ListPage> {
  const query = new URLSearchParams({
    startHistoryId: h,
    labelId: options.label,
    maxResults: String(options.pageSize),
  });
  query.append('historyTypes', 'messageAdded');
  query.append('historyTypes', 'labelAdded');
  if (page) query.set('pageToken', page);
  const body = await gmailGet<{
    history?: HistoryRecord[];
    nextPageToken?: string;
    historyId?: string;
  }>(fetchImpl, accessToken, `/history?${query.toString()}`);
  const ids: string[] = [];
  for (const record of body.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      if (added.message?.id && (added.message.labelIds ?? []).includes(options.label)) {
        ids.push(added.message.id);
      }
    }
    for (const added of record.labelsAdded ?? []) {
      if (added.message?.id && (added.labelIds ?? []).includes(options.label)) {
        ids.push(added.message.id);
      }
    }
  }
  const historyId = isHistoryId(body.historyId) ? body.historyId : null;
  return { ids, next: body.nextPageToken ?? null, historyId };
}

/** One page of the label's mail received after `after` (the first round's window), newest first. */
async function listPage(
  fetchImpl: typeof fetch,
  accessToken: string,
  options: GmailReadOptions,
  after: number,
  page: string | undefined
): Promise<ListPage> {
  const query = new URLSearchParams({
    labelIds: options.label,
    q: `after:${after}`,
    maxResults: String(options.pageSize),
  });
  if (page) query.set('pageToken', page);
  const body = await gmailGet<{ messages?: Array<{ id?: string }>; nextPageToken?: string }>(
    fetchImpl,
    accessToken,
    `/messages?${query.toString()}`
  );
  const ids = (body.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  return { ids, next: body.nextPageToken ?? null, historyId: null };
}

/** The mailbox's current historyId: where history reading starts once the first window is read. */
async function currentHistoryId(fetchImpl: typeof fetch, accessToken: string): Promise<string> {
  const profile = await gmailGet<{ historyId?: unknown }>(fetchImpl, accessToken, '/profile');
  if (!isHistoryId(profile.historyId)) throw new MailboxTransportError('REJECTED');
  return profile.historyId;
}

/** What a round's pages found, and where the listing stands. */
interface PageRun {
  ids: string[];
  /** The page to read on from, or null when the listing reached its end. */
  next: string | null;
  /** The newest historyId a history page reported. */
  historyId: string | null;
}

/** Reads pages from `page` on, within the page cap and the time budget. */
async function readPages(
  options: GmailReadOptions,
  start: string | undefined,
  readPage: (page: string | undefined) => Promise<ListPage>
): Promise<PageRun> {
  const clock = options.clock ?? Date.now;
  const stopAt = options.budgetMs === undefined ? Infinity : clock() + options.budgetMs;
  const run: PageRun = { ids: [], next: start ?? null, historyId: null };
  for (let page = 0; page < options.maxPages; page++) {
    if (page > 0 && clock() >= stopAt) break;
    const result = await readPage(run.next ?? undefined);
    run.ids.push(...result.ids);
    run.historyId = result.historyId ?? run.historyId;
    run.next = result.next;
    if (!run.next) break;
  }
  return run;
}

/** The listed mail, each read once, oldest first (as the sync stores them). */
async function messagesOf(
  ids: string[],
  accessToken: string,
  options: GmailReadOptions,
  fetchImpl: typeof fetch
): Promise<GmailSyncedMessage[]> {
  const out: GmailSyncedMessage[] = [];
  for (const id of new Set(ids)) {
    const message = await readMessage(id, accessToken, options, fetchImpl);
    if (message) out.push(message);
  }
  return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}

/**
 * One round of a label's mail newer than `cursor` (null: the last `initialDays`), oldest first.
 * A round that stops before the end of its listing keeps its place and is not complete; the next
 * round reads on from there, so no mail is skipped.
 */
export async function readGmailLabel(
  accessToken: string,
  cursor: string | null,
  options: GmailReadOptions
): Promise<GmailReadRound> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let from = parseCursor(cursor);
  if (!from) {
    // The history point first: mail that arrives while the window is read is in the history after it.
    const h = await currentHistoryId(fetchImpl, accessToken);
    const after = Math.floor((options.now.getTime() - options.initialDays * DAY_MS) / 1000);
    from = { h, list: { after } };
  }
  if (from.list) {
    const { after } = from.list;
    const run = await readPages(options, from.list.page, (page) =>
      listPage(fetchImpl, accessToken, options, after, page)
    );
    const messages = await messagesOf(run.ids, accessToken, options, fetchImpl);
    const next: Cursor = run.next ? { h: from.h, list: { after, page: run.next } } : { h: from.h };
    return { messages, cursor: JSON.stringify(next), complete: !run.next, expired: false };
  }
  const h = from.h;
  let run: PageRun;
  try {
    run = await readPages(options, from.page, (page) =>
      historyPage(fetchImpl, accessToken, options, h, page)
    );
  } catch (error) {
    // Gmail keeps history for a limited time: an old historyId is gone, start the label again.
    if (error instanceof NotFound)
      return { messages: [], cursor: null, complete: false, expired: true };
    throw error;
  }
  const messages = await messagesOf(run.ids, accessToken, options, fetchImpl);
  if (run.next) {
    return {
      messages,
      cursor: JSON.stringify({ h, page: run.next }),
      complete: false,
      expired: false,
    };
  }
  const done: Cursor = { h: run.historyId ?? h };
  return { messages, cursor: JSON.stringify(done), complete: true, expired: false };
}
