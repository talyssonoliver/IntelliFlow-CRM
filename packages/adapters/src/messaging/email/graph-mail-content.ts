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
  capHtml,
  readCapped,
  safeSegment,
  type FetchedAttachment,
  type MailAttachmentMeta,
  type MailContent,
} from './mail-content';

const GRAPH_ME = 'https://graph.microsoft.com/v1.0/me';
const REQUEST_TIMEOUT_MS = 30_000;
const IMMUTABLE = 'IdType="ImmutableId"';

function failure(status: number): MailboxTransportError {
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
  let response: Response;
  try {
    response = await fetchImpl(`${GRAPH_ME}${path}`, {
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

/** The file attachments of a Graph message as metadata (item and reference attachments have no file to fetch). */
export function graphAttachmentMeta(list: GraphAttachment[] | undefined): MailAttachmentMeta[] {
  const out: MailAttachmentMeta[] = [];
  for (const a of list ?? []) {
    if (out.length >= MAX_ATTACHMENTS_PER_MAIL) break;
    if (!a.id || (a['@odata.type'] && !/fileAttachment$/i.test(a['@odata.type']))) continue;
    out.push({
      providerAttachmentId: a.id.slice(0, 512),
      fileName: (a.name?.trim() || `attachment-${out.length + 1}`).slice(0, 255),
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
    if (error instanceof MailboxTransportError && error.code === 'REJECTED') return fallback;
    throw error;
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
  const read = await readGraph(accessToken, messageId, '', fetchImpl);
  return read.found ? { receivedAt: read.receivedAt, content: read.content } : null;
}

async function readGraph(
  accessToken: string,
  messageId: string,
  text: string,
  fetchImpl: typeof fetch
): Promise<{ found: boolean; receivedAt: Date | null; content: MailContent }> {
  const id = encodeURIComponent(messageId);
  type Body = {
    receivedDateTime?: string | null;
    body?: { content?: string | null; contentType?: string } | null;
    hasAttachments?: boolean;
  };
  const message = await orNothing<Body>(async () => {
    const response = await graphGet(
      fetchImpl,
      accessToken,
      `/messages/${id}?$select=receivedDateTime,body,hasAttachments`,
      `${IMMUTABLE}, outlook.body-content-type="html"`
    );
    return (await response.json()) as Body;
  }, {});
  const isHtml = (message.body?.contentType ?? 'html').toLowerCase() === 'html';
  const html = isHtml ? capHtml(message.body?.content) : null;
  const attachments = message.hasAttachments
    ? await orNothing(async () => {
        const list = await graphGet(
          fetchImpl,
          accessToken,
          `/messages/${id}/attachments?$select=id,name,contentType,size,isInline,contentId&$top=${String(MAX_ATTACHMENTS_PER_MAIL)}`,
          IMMUTABLE
        );
        const body = (await list.json()) as { value?: GraphAttachment[] };
        return graphAttachmentMeta(body.value);
      }, [] as MailAttachmentMeta[])
    : [];
  const received = message.receivedDateTime ? new Date(message.receivedDateTime) : null;
  return {
    found: message.receivedDateTime !== undefined || message.body !== undefined,
    receivedAt: received && !Number.isNaN(received.getTime()) ? received : null,
    content: { text, html, attachments },
  };
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
  const info = (await meta.json()) as { size?: number; contentType?: string };
  if ((info.size ?? 0) > MAX_ATTACHMENT_BYTES) throw new MailboxTransportError('REJECTED');
  const raw = await graphGet(fetchImpl, accessToken, `${path}/$value`, IMMUTABLE);
  const bytes = await readCapped(raw, MAX_ATTACHMENT_BYTES);
  return { bytes, contentType: info.contentType ?? raw.headers.get('content-type') };
}
