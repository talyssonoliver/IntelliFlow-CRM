/**
 * Zoho Mail reader for reply sync (MVP-001): the folder ids, and one round of a folder's new mail.
 *
 * Zoho's list API (`/messages/view`) has no "since" filter, so a round pages newest first and stops
 * at mail older than the stored cursor: the last receivedTime read plus the message ids seen at
 * that very time (two mails can share a millisecond; those ids are skipped, never a stop). The
 * first round reads the last `initialDays`.
 * - Bodies are not read here: each message carries `loadBody()`, called by the sync only for mail
 *   it keeps, so personal mail's content is never fetched.
 * - When a round hits its page cap or time budget before the cursor, it is not complete and the
 *   cursor stays, so no mail is passed over. Each such round reads again from the newest end, so a
 *   backlog deeper than one round (10 pages of 50) is reached only by the catch-up that resumes
 *   where a round stopped (the next change, stacked on this one).
 * - Requests go through `zohoAccountGet`: Zoho's own host, a timeout, dead tokens read from the
 *   body, ids kept exact.
 */
import { MailboxTransportError } from './mailbox-errors';
import { zohoAccountGet, type ZohoAccountRef } from './zoho-mailbox';

const DAY_MS = 24 * 60 * 60 * 1000;

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
}

interface Cursor {
  t: number;
  ids: string[];
}

/** A token without the single quotes around it. */
function trimQuotes(token: string): string {
  let start = 0;
  let end = token.length;
  while (start < end && token[start] === "'") start++;
  while (end > start && token[end - 1] === "'") end--;
  return token.slice(start, end);
}

/** An address-shaped token, lower case; an apostrophe belongs to it (o'neil@…) unless it wraps it. */
function asAddress(token: string): string | null {
  const value = trimQuotes(token.trim()).toLowerCase();
  const at = value.indexOf('@');
  const ok = at > 0 && at === value.lastIndexOf('@') && value.slice(at + 1).includes('.');
  return ok && !/[\s<>"]/.test(value) ? value : null;
}

/** The entries of an address field: split on commas and semicolons outside double quotes. */
function addressEntries(text: string): string[] {
  const entries: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === ',' || char === ';')) {
      entries.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  entries.push(current);
  return entries;
}

/**
 * The addresses of one entry. With an angle-bracket part (`"Name" <a@b>`) only that part counts:
 * an address written in the display name is never taken as the sender or a recipient.
 */
function entryAddresses(entry: string): string[] {
  const open = entry.lastIndexOf('<');
  const close = open === -1 ? -1 : entry.indexOf('>', open);
  if (close > open) {
    const address = asAddress(entry.slice(open + 1, close));
    return address ? [address] : [];
  }
  return entry
    .split(/[\s"]+/)
    .map(asAddress)
    .filter((a): a is string => a !== null);
}

/** Every address in a Zoho address field (plain, comma-separated, or "Name" <a@b>, HTML-escaped). */
export function zohoAddresses(field: string | null | undefined): string[] {
  const text = (field ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"');
  return [...new Set(addressEntries(text).flatMap(entryAddresses))];
}

/** The display name in `"Name" <a@b>`, if any. */
function displayName(field: string | null | undefined): string | null {
  const text = (field ?? '').replaceAll('&lt;', '<').replaceAll('&quot;', '"');
  const at = text.indexOf('<');
  const name = (at > 0 ? text.slice(0, at) : '').replaceAll('"', '').trim();
  return name || null;
}

/** Tags that end a line: a break, or the end of a block. */
const LINE_TAGS = new Set(['br', '/p', '/div', '/li', '/tr']);
const SKIP_TAGS = new Set(['script', 'style']);

/** The tag name at `html[start]` (just after '<'), lower case, with a leading '/' kept. */
function tagName(html: string, start: number): string {
  let end = start;
  while (end < html.length && /[\w/]/.test(html[end]!)) end++;
  return html.slice(start, end).toLowerCase();
}

/** Tags out in one linear pass: line-break tags become new lines, script and style are skipped. */
function stripTags(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<', i);
    if (open === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, open);
    const close = html.indexOf('>', open + 1);
    if (close === -1) break; // an unclosed tag: the rest is markup
    const name = tagName(html, open + 1);
    if (LINE_TAGS.has(name.replace(/\/$/, ''))) out += '\n';
    i = close + 1;
    if (SKIP_TAGS.has(name)) {
      const endTag = html.toLowerCase().indexOf(`</${name}`, i);
      const after = endTag === -1 ? -1 : html.indexOf('>', endTag);
      i = after === -1 ? html.length : after + 1;
    }
  }
  return out;
}

/** Text from Zoho's HTML body: tags out, entities for the common characters, NUL removed. */
export function zohoBodyText(html: string, maxChars: number): string {
  const text = stripTags(html)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('\u0000', '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, maxChars);
}

function parseCursor(cursor: string | null): Cursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(cursor) as Partial<Cursor>;
    if (typeof value.t !== 'number' || !Array.isArray(value.ids)) return null;
    return { t: value.t, ids: value.ids.filter((id): id is string => typeof id === 'string') };
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
  const sender = (item.sender ?? '').trim();
  const senderName = sender && !sender.includes('@') ? sender : null;
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
    loadBody: async () => {
      const path = `/folders/${encodeURIComponent(options.folderId)}/messages/${encodeURIComponent(messageId)}/content`;
      const body = (await zohoAccountGet(fetchImpl, accessToken, ref, path)) as {
        data?: { content?: string };
      };
      return zohoBodyText(body.data?.content ?? '', options.maxBodyChars);
    },
  };
}

/** One page of the folder, newest first. */
async function readPage(
  accessToken: string,
  ref: ZohoAccountRef,
  options: ZohoReadOptions,
  fetchImpl: typeof fetch,
  page: number
): Promise<ZohoListItem[]> {
  // Every page after the first starts on the last item of the page before: when a mail already read
  // is removed meanwhile,
  // the list moves up one place and that overlap still returns the mail that moved onto the
  // earlier page (the duplicate it otherwise brings is dropped by id).
  const query = new URLSearchParams({
    folderId: options.folderId,
    start: String(1 + page * Math.max(1, options.pageSize - 1)),
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
  if (newest === undefined) return from ?? { t: floor, ids: [] };
  const atNewest = fresh
    .filter((m) => m.receivedAt.getTime() === newest)
    .map((m) => m.providerMessageId);
  // Mail at the cursor's own millisecond keeps the ids already seen there too.
  return { t: newest, ids: newest === from?.t ? [...from.ids, ...atNewest] : atNewest };
}

/** One round of a folder's mail newer than `cursor` (null: the last `initialDays`), oldest first. */
export async function readZohoFolder(
  accessToken: string,
  ref: ZohoAccountRef,
  cursor: string | null,
  options: ZohoReadOptions
): Promise<ZohoReadRound> {
  if (!options.folderId) throw new MailboxTransportError('REJECTED');
  const fetchImpl = options.fetchImpl ?? fetch;
  const clock = options.clock ?? Date.now;
  const stopAt = options.budgetMs === undefined ? Infinity : clock() + options.budgetMs;
  const from = parseCursor(cursor);
  const floor = from?.t ?? options.now.getTime() - options.initialDays * DAY_MS;
  const fresh: ZohoSyncedMessage[] = [];
  // Offset pages shift when mail arrives between two reads: the same mail can come back twice.
  const taken = new Set<string>();
  let reachedCursor = false;
  for (let page = 0; page < options.maxPages && !reachedCursor; page++) {
    if (page > 0 && clock() >= stopAt) break;
    const items = await readPage(accessToken, ref, options, fetchImpl, page);
    const messages = items
      .map((item) => toMessage(item, accessToken, ref, options, fetchImpl))
      .filter((m): m is ZohoSyncedMessage => m !== null);
    const stop = messages.findIndex((m) => pastFloor(m, floor));
    fresh.push(...keepNew(stop === -1 ? messages : messages.slice(0, stop), from, taken));
    reachedCursor = stop !== -1 || items.length < options.pageSize;
  }
  fresh.reverse(); // oldest first, as the sync stores them
  if (!reachedCursor) {
    // Stopped by the page cap or the time budget before the cursor: the cursor stays (the window's
    // start on a first round), so the older mail is not passed over; the next round, due at once,
    // reads again from the newest end, and what is already logged is skipped by the sync's dedupe.
    const held: Cursor = from ?? { t: floor, ids: [] };
    return { messages: fresh, cursor: JSON.stringify(held), complete: false, expired: false };
  }
  const next = nextCursor(fresh, from, floor);
  return { messages: fresh, cursor: JSON.stringify(next), complete: true, expired: false };
}
