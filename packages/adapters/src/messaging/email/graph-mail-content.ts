/**
 * Microsoft Graph content for the mailbox sync (rich bodies and attachment metadata), split out
 * of graph-mail-delta.ts. See mail-content.ts: attachments are recorded as metadata only (the
 * attachments list is read with a $select that leaves contentBytes out) and the file is fetched
 * from Graph on demand.
 */
import { MailboxTransportError } from './mailbox-errors';
import {
  MAX_ATTACHMENTS_PER_MAIL,
  MAX_ATTACHMENT_BYTES,
  bareContentId,
  asTransportError,
  capHtml,
  readJsonBody,
  readCapped,
  safeSegment,
  type FetchedAttachment,
  type MailAttachmentMeta,
  type MailContent,
} from './mail-content';

const GRAPH_HOST = 'graph.microsoft.com';
const GRAPH_ME = `https://${GRAPH_HOST}/v1.0/me`;
/** Pages of the attachments list followed at most. */
const MAX_LIST_PAGES = 5;

/** True for an https URL on Graph's own host: the only place the token may go. */
function isGraphUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === GRAPH_HOST;
  } catch {
    return false;
  }
}
const REQUEST_TIMEOUT_MS = 30_000;
const IMMUTABLE = 'IdType="ImmutableId"';

/** Graph answered 404: the message or attachment is gone (a REJECTED that says so). */
class GraphNotFound extends MailboxTransportError {
  constructor() {
    super('REJECTED');
  }
}

function failure(status: number): MailboxTransportError {
  if (status === 404) return new GraphNotFound();
  if (status === 401 || status === 403) return new MailboxTransportError('AUTH_FAILED');
  if (status === 429) return new MailboxTransportError('RATE_LIMITED');
  if (status >= 500) return new MailboxTransportError('CONNECT_FAILED');
  return new MailboxTransportError('REJECTED');
}

async function graphGet(
  fetchImpl: typeof fetch,
  accessToken: string,
  path: string,
  prefer: string
): Promise<Response> {
  return graphGetUrl(fetchImpl, accessToken, `${GRAPH_ME}${path}`, prefer);
}

async function graphGetUrl(
  fetchImpl: typeof fetch,
  accessToken: string,
  url: string,
  prefer: string
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Prefer: prefer },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
  if (!response.ok) throw failure(response.status);
  return response;
}

interface GraphAttachment {
  id?: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
  contentId?: string | null;
  '@odata.type'?: string;
}

/**
 * The attachments of a Graph message as metadata: files, and attached messages or items (their raw
 * content is what Graph's /$value returns). A reference attachment is a link, with nothing to fetch.
 */
export function graphAttachmentMeta(list: GraphAttachment[] | undefined): MailAttachmentMeta[] {
  const out: MailAttachmentMeta[] = [];
  for (const a of list ?? []) {
    if (out.length >= MAX_ATTACHMENTS_PER_MAIL) break;
    const type = a['@odata.type'] ?? '';
    if (!a.id || /referenceAttachment$/i.test(type)) continue;
    const name = a.name?.trim() || `attachment-${out.length + 1}`;
    out.push({
      providerAttachmentId: a.id.slice(0, 512),
      fileName: name.slice(0, 255),
      // An attached message, contact or event has no content type until its content is read.
      fileType: (a.contentType?.trim() || 'application/octet-stream').slice(0, 127),
      fileSize: Math.max(0, Math.trunc(a.size ?? 0)),
      contentId: bareContentId(a.contentId),
      isInline: a.isInline === true,
    });
  }
  return out;
}

/** Runs a Graph read whose refusal (REJECTED) only means this extra is not available for this mail. */
async function orNothing<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const failure = asTransportError(error);
    if (failure.code === 'REJECTED') return fallback;
    throw failure;
  }
}

/** `contentId` exists only on fileAttachment, so it is selected through the cast; contentBytes is never selected. */
const LIST_SELECT = 'id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId';
const LIST_SELECT_BASIC = 'id,name,contentType,size,isInline';

/** The attachments list as metadata; without the cast select if Graph refuses it (then no cid mapping, but the files are still listed). */
async function readAttachmentList(
  fetchImpl: typeof fetch,
  accessToken: string,
  id: string
): Promise<MailAttachmentMeta[]> {
  const read = async (select: string): Promise<MailAttachmentMeta[]> => {
    let url = `${GRAPH_ME}/messages/${id}/attachments?$select=${select}&$top=${String(MAX_ATTACHMENTS_PER_MAIL)}`;
    const found: MailAttachmentMeta[] = [];
    // Graph may split the list across pages: follow its own next links (and only those) until
    // enough usable attachments are collected or the list ends.
    for (let page = 0; page < MAX_LIST_PAGES && found.length < MAX_ATTACHMENTS_PER_MAIL; page++) {
      const list = await graphGetUrl(fetchImpl, accessToken, url, IMMUTABLE);
      const body = await readJsonBody<{ value?: GraphAttachment[]; '@odata.nextLink'?: string }>(
        list
      );
      found.push(...graphAttachmentMeta(body.value));
      const next = body['@odata.nextLink'];
      if (!next || !isGraphUrl(next)) break;
      url = next;
    }
    return found.slice(0, MAX_ATTACHMENTS_PER_MAIL);
  };
  try {
    return await read(LIST_SELECT);
  } catch (error) {
    if (asTransportError(error).code !== 'REJECTED') throw asTransportError(error);
    return read(LIST_SELECT_BASIC);
  }
}

/**
 * The HTML body and the attachments' metadata of one message; `text` is what the delta already
 * read. A read Graph refuses for this mail leaves that part out (the text is kept); a dead token or
 * an outage still fails.
 */
export async function readGraphContent(
  accessToken: string,
  messageId: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<MailContent> {
  return (await readGraph(accessToken, messageId, text, fetchImpl)).content;
}

/**
 * One message's provider date and content, read now (the backfill). Null when Graph no longer has
 * the message.
 */
export async function readGraphMessage(
  accessToken: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ receivedAt: Date | null; content: MailContent } | null> {
  const read = await readGraph(accessToken, messageId, '', fetchImpl, true);
  return read.found ? { receivedAt: read.receivedAt, content: read.content } : null;
}

async function readGraph(
  accessToken: string,
  messageId: string,
  text: string,
  fetchImpl: typeof fetch,
  /** True (the backfill): only a 404 means "gone"; any other refusal is an error, not a deletion. */
  strict = false
): Promise<{ found: boolean; receivedAt: Date | null; content: MailContent }> {
  const id = encodeURIComponent(safeSegment(messageId));
  type Body = {
    receivedDateTime?: string | null;
    body?: { content?: string | null; contentType?: string } | null;
    hasAttachments?: boolean;
  };
  let message: Body;
  try {
    const response = await graphGet(
      fetchImpl,
      accessToken,
      `/messages/${id}?$select=receivedDateTime,body,hasAttachments`,
      `${IMMUTABLE}, outlook.body-content-type="html"`
    );
    message = await readJsonBody<Body>(response);
  } catch (error) {
    if (error instanceof GraphNotFound) {
      return { found: false, receivedAt: null, content: { text, html: null, attachments: [] } };
    }
    const failed = asTransportError(error);
    // The sync keeps the text when Graph refuses the extra read; the backfill must not call it deleted.
    if (strict || failed.code !== 'REJECTED') throw failed;
    message = {};
  }
  const isHtml = (message.body?.contentType ?? 'html').toLowerCase() === 'html';
  const html = isHtml ? capHtml(message.body?.content) : null;
  // Looked for in the body as Graph sent it, before the storage cap drops a very large one.
  const namesCid = isHtml && /cid:/i.test(message.body?.content ?? '');
  // hasAttachments is false for a mail whose only attachments are inline images, so a body that
  // names a cid: is read too (the Zoho reader does the same).
  const wantsList = message.hasAttachments === true || namesCid;
  // The sync keeps the mail when the list is refused; the backfill must not record "no attachments".
  const readList = () => readAttachmentList(fetchImpl, accessToken, id);
  let attachments: MailAttachmentMeta[] = [];
  if (wantsList) attachments = strict ? await readList() : await orNothing(readList, []);
  const received = message.receivedDateTime ? new Date(message.receivedDateTime) : null;
  return {
    found: true,
    receivedAt: received && !Number.isNaN(received.getTime()) ? received : null,
    content: { text, html, attachments },
  };
}

/**
 * What an attached item's raw content is: Graph returns a message as MIME, a contact as a vCard and
 * an event as iCalendar, and gives such an attachment no content type of its own.
 */
function sniffItemType(bytes: Buffer): string {
  const head = bytes.subarray(0, 64).toString('utf8').trimStart().toUpperCase();
  if (head.startsWith('BEGIN:VCARD')) return 'text/vcard';
  if (head.startsWith('BEGIN:VCALENDAR')) return 'text/calendar';
  return 'message/rfc822';
}

/** One attachment's bytes, read from Graph now and never stored. */
export async function fetchGraphAttachment(
  accessToken: string,
  ref: { messageId: string; attachmentId: string },
  fetchImpl: typeof fetch = fetch
): Promise<FetchedAttachment> {
  const path = `/messages/${encodeURIComponent(safeSegment(ref.messageId))}/attachments/${encodeURIComponent(safeSegment(ref.attachmentId))}`;
  const meta = await graphGet(
    fetchImpl,
    accessToken,
    `${path}?$select=size,contentType`,
    IMMUTABLE
  );
  const info = await readJsonBody<{ size?: number; contentType?: string }>(meta);
  if ((info.size ?? 0) > MAX_ATTACHMENT_BYTES) throw new MailboxTransportError('REJECTED');
  const raw = await graphGet(fetchImpl, accessToken, `${path}/$value`, IMMUTABLE);
  const bytes = await readCapped(raw, MAX_ATTACHMENT_BYTES);
  return { bytes, contentType: info.contentType || sniffItemType(bytes) };
}
