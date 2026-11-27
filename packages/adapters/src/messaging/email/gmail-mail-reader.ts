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
import { readAutomationSignals, type MailAutomationSignals } from './mail-automation-signals';
import { MailboxTransportError } from './mailbox-errors';
import { displayName, zohoAddresses as headerAddresses, zohoBodyText } from './zoho-text';
import { safeSegment, type MailContent } from './mail-content';
import { gmailAttachmentMeta, gmailHtml, gmailHtmlPart } from './gmail-mail-content';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEADERS = [
  'From',
  'To',
  'Cc',
  'Subject',
  'Message-ID',
  'List-Unsubscribe',
  'Precedence',
  'Auto-Submitted',
  'List-Id',
  'Content-Type',
  'In-Reply-To',
  'References',
] as const;

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
  /** MVP-011: bulk mail (List-Unsubscribe or Precedence: bulk/list/junk). */
  bulk?: boolean;
  /** MVP-011: the headers that tell automated mail from a person's (see mail-automation-signals.ts). */
  signals?: MailAutomationSignals;
  isRead: boolean;
  /** Empty: the body is read only through `loadBody()`. */
  bodyText: string;
  loadBody: () => Promise<string>;
  /** The text, the provider's HTML and the attachments' metadata, in one read of the message. */
  loadContent: () => Promise<MailContent>;
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
    if (/rateLimitExceeded|dailyLimitExceeded|userRateLimitExceeded/i.test(body)) {
      return new MailboxTransportError('RATE_LIMITED');
    }
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

export interface GmailApiPart {
  mimeType?: string;
  filename?: string;
  partId?: string;
  /** Inline `data`, or an `attachmentId` to read through messages.attachments.get. */
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailApiPart[];
  headers?: GmailHeader[];
}

export interface GmailApiMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailApiPart;
}

function header(message: GmailApiMessage, name: string): string | null {
  const wanted = name.toLowerCase();
  return message.payload?.headers?.find((h) => h.name?.toLowerCase() === wanted)?.value ?? null;
}

/** An attached file (named, or marked as an attachment): never the mail's own text. */
function isAttachment(part: GmailApiPart): boolean {
  if (part.filename?.trim()) return true;
  const disposition = part.headers?.find((h) => h.name?.toLowerCase() === 'content-disposition');
  return /^\s*attachment/i.test(disposition?.value ?? '');
}

/**
 * The first body part of a type in the MIME tree, depth first (the order the mail shows them).
 * Attachments and everything inside them are skipped; a part counts with its text inline or behind
 * an attachment id (Gmail stores large parts that way).
 */
export function firstPart(part: GmailApiPart | undefined, mimeType: string): GmailApiPart | null {
  if (!part || isAttachment(part)) return null;
  const hasBody = Boolean(part.body?.data || part.body?.attachmentId);
  if (part.mimeType?.toLowerCase() === mimeType && hasBody) return part;
  for (const child of part.parts ?? []) {
    const found = firstPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** The part that holds the mail's text: plain text first, else HTML. */
export function gmailBodyPart(
  payload: GmailApiPart | undefined
): { part: GmailApiPart; html: boolean } | null {
  const plain = firstPart(payload, 'text/plain');
  if (plain) return { part: plain, html: false };
  const html = firstPart(payload, 'text/html');
  return html ? { part: html, html: true } : null;
}

/** A body part's base64url content as text (HTML made plain); NUL removed, capped. */
function partText(data: string, html: boolean, maxChars: number): string {
  const raw = Buffer.from(data, 'base64url').toString('utf8');
  if (html) return zohoBodyText(raw, maxChars);
  return raw.replaceAll('\u0000', '').replace(/\r\n/g, '\n').trim().slice(0, maxChars);
}

/** The mail's text from inline parts: its plain-text part, else its HTML part as text. */
export function gmailBodyText(payload: GmailApiPart | undefined, maxChars: number): string {
  const pick = gmailBodyPart(payload);
  return pick ? partText(pick.part.body?.data ?? '', pick.html, maxChars) : '';
}

/** The full message's content, reading parts stored behind an attachment id when they are. */
async function loadContent(
  fetchImpl: typeof fetch,
  accessToken: string,
  id: string,
  maxChars: number
): Promise<MailContent> {
  return (await loadFull(fetchImpl, accessToken, id, maxChars)).content;
}

/** The mail's content with its provider date (internalDate), from one read of the full message. */
async function loadFull(
  fetchImpl: typeof fetch,
  accessToken: string,
  id: string,
  maxChars: number
): Promise<{ receivedAt: Date | null; content: MailContent }> {
  const path = `/messages/${encodeURIComponent(safeSegment(id))}`;
  const readPart = async (attachmentId: string): Promise<string | undefined> => {
    const stored = await gmailGet<{ data?: string }>(
      fetchImpl,
      accessToken,
      `${path}/attachments/${encodeURIComponent(attachmentId)}`
    );
    return stored.data;
  };
  const full = await gmailGet<GmailApiMessage>(fetchImpl, accessToken, `${path}?format=full`);
  const pick = gmailBodyPart(full.payload);
  let text = '';
  if (pick) {
    const inline = pick.part.body?.data;
    const attachmentId = pick.part.body?.attachmentId;
    const data = inline || (attachmentId ? await readPart(attachmentId) : undefined);
    text = partText(data ?? '', pick.html, maxChars);
  }
  const html = await gmailHtml(gmailHtmlPart(full.payload), readPart);
  const time = Number(full.internalDate);
  return {
    receivedAt: Number.isFinite(time) ? new Date(time) : null,
    content: { text, html, attachments: gmailAttachmentMeta(full.payload) },
  };
}

/**
 * One message's provider date and content, read now (the backfill of mail synced before HTML and
 * attachment metadata were kept). Null when Gmail no longer has it.
 */
export async function readGmailMessage(
  accessToken: string,
  id: string,
  maxChars: number,
  fetchImpl: typeof fetch = fetch
): Promise<{ receivedAt: Date | null; content: MailContent } | null> {
  try {
    return await loadFull(fetchImpl, accessToken, id, maxChars);
  } catch (error) {
    if (error instanceof NotFound) return null;
    throw error;
  }
}

/** Mail never logged from a label: drafts, spam and chats. */
const SKIPPED_LABELS = ['DRAFT', 'SPAM', 'CHAT'];

/** A List-Unsubscribe header, or Precedence: bulk, list or junk: mail sent to many, not to one person. */
function isBulk(item: GmailApiMessage): boolean {
  return (
    !!header(item, 'List-Unsubscribe') ||
    /^(bulk|list|junk)$/i.test(header(item, 'Precedence')?.trim() ?? '')
  );
}

function toMessage(
  item: GmailApiMessage,
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
  // One read serves the text, the HTML and the attachments (a repeat call reuses it).
  let read: Promise<MailContent> | undefined;
  const content = (): Promise<MailContent> => {
    read ??= loadContent(fetchImpl, accessToken, id, options.maxBodyChars).catch(
      (error: unknown) => {
        // Deleted since it was listed: that one mail is skipped, the round goes on.
        throw error instanceof NotFound ? new MailboxTransportError('REJECTED') : error;
      }
    );
    return read;
  };
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
    ...(isBulk(item) ? { bulk: true } : {}),
    signals: readAutomationSignals((name) =>
      name === 'Content-Type' ? (item.payload?.mimeType ?? header(item, name)) : header(item, name)
    ),
    bodyText: '',
    loadBody: () => content().then((c) => c.text),
    loadContent: content,
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
    const item = await gmailGet<GmailApiMessage>(
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
    // The request is already filtered by label, and Gmail often lists added messages with only
    // their id: one is dropped only when its labels are given and do not hold the label. Drafts,
    // spam and chats are left out from each message's own labels (toMessage).
    for (const added of record.messagesAdded ?? []) {
      const labels = added.message?.labelIds;
      if (added.message?.id && (!labels || labels.includes(options.label))) {
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
