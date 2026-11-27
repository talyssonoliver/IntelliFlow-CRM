/**
 * Gmail content for the mailbox sync (rich bodies and attachment metadata), split out of
 * gmail-mail-reader.ts. See mail-content.ts: attachments are recorded as metadata only and fetched
 * from Gmail on demand. Gmail's attachmentId is not stable between reads of a message, so the
 * stored locator is the part id; the download reads the message again to find its current id.
 */
import { MailboxTransportError } from './mailbox-errors';
import {
  MAX_ATTACHMENTS_PER_MAIL,
  MAX_ATTACHMENT_BYTES,
  bareContentId,
  capHtml,
  readJsonBody,
  safeSegment,
  type FetchedAttachment,
  type MailAttachmentMeta,
} from './mail-content';
import type { GmailApiMessage, GmailApiPart } from './gmail-mail-reader';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 30_000;
/** Gmail's 403 reasons that mean a quota, not a dead token (reconnecting cannot fix them). */
const GMAIL_THROTTLED = /rateLimitExceeded|dailyLimitExceeded|userRateLimitExceeded/i;
const ATTACHMENT_DISPOSITION = /^\s*attachment/i;

function partHeader(part: GmailApiPart, name: string): string | null {
  const wanted = name.toLowerCase();
  return part.headers?.find((h) => h.name?.toLowerCase() === wanted)?.value ?? null;
}

/** The attachment parts of a message (files and inline images), depth first; metadata only. */
export function gmailAttachmentMeta(payload: GmailApiPart | undefined): MailAttachmentMeta[] {
  const found: MailAttachmentMeta[] = [];
  const walk = (part: GmailApiPart): void => {
    if (found.length >= MAX_ATTACHMENTS_PER_MAIL) return;
    const mimeType = (part.mimeType ?? 'application/octet-stream').toLowerCase();
    const contentId = bareContentId(partHeader(part, 'Content-ID'));
    const asAttachment = ATTACHMENT_DISPOSITION.test(partHeader(part, 'Content-Disposition') ?? '');
    // The mail's own text and HTML parts are not files, even with a Content-ID; any other part
    // with content is one, named or not (a filename, a disposition and a Content-ID are all optional).
    const bodyText = mimeType === 'text/plain' || mimeType === 'text/html';
    const isFile = Boolean(part.filename?.trim()) || asAttachment || !bodyText;
    const hasBytes = Boolean(part.body?.attachmentId || part.body?.data);
    if (isFile && part.partId && hasBytes && !mimeType.startsWith('multipart/')) {
      found.push({
        providerAttachmentId: part.partId,
        fileName: (part.filename?.trim() || `attachment-${found.length + 1}`).slice(0, 255),
        fileType: mimeType.slice(0, 127),
        fileSize: Math.max(0, Math.trunc(part.body?.size ?? 0)),
        contentId,
        isInline: contentId !== null && mimeType.startsWith('image/') && !asAttachment,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  if (payload) walk(payload);
  return found;
}

/** The HTML part's markup: inline, or read through the part's attachment id. */
export async function gmailHtml(
  part: GmailApiPart | null,
  readPart: (attachmentId: string) => Promise<string | undefined>
): Promise<string | null> {
  if (!part) return null;
  let data = part.body?.data;
  if (!data && part.body?.attachmentId) data = await readPart(part.body.attachmentId);
  return capHtml(data ? Buffer.from(data, 'base64url').toString('utf8') : null);
}

async function get(fetchImpl: typeof fetch, accessToken: string, path: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
  if (response.ok) return response;
  if (response.status === 403) {
    const body = await response.text().catch(() => '');
    throw new MailboxTransportError(GMAIL_THROTTLED.test(body) ? 'RATE_LIMITED' : 'AUTH_FAILED');
  }
  if (response.status === 401) throw new MailboxTransportError('AUTH_FAILED');
  if (response.status === 429) throw new MailboxTransportError('RATE_LIMITED');
  if (response.status >= 500) throw new MailboxTransportError('CONNECT_FAILED');
  throw new MailboxTransportError('REJECTED');
}

function findPart(part: GmailApiPart | undefined, partId: string): GmailApiPart | null {
  if (!part) return null;
  if (part.partId === partId) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, partId);
    if (found) return found;
  }
  return null;
}

/** One attachment's bytes, read from Gmail now and never stored. */
export async function fetchGmailAttachment(
  accessToken: string,
  ref: { messageId: string; partId: string },
  fetchImpl: typeof fetch = fetch
): Promise<FetchedAttachment> {
  const path = `/messages/${encodeURIComponent(safeSegment(ref.messageId))}`;
  const message = await get(fetchImpl, accessToken, `${path}?format=full`);
  const full = await readJsonBody<GmailApiMessage>(message);
  const part = findPart(full.payload, ref.partId);
  const attachmentId = part?.body?.attachmentId;
  if (!part || !(attachmentId || part.body?.data)) throw new MailboxTransportError('REJECTED');
  if ((part.body?.size ?? 0) > MAX_ATTACHMENT_BYTES) throw new MailboxTransportError('REJECTED');
  let data = part.body?.data;
  if (attachmentId) {
    const file = await get(
      fetchImpl,
      accessToken,
      `${path}/attachments/${encodeURIComponent(attachmentId)}`
    );
    data = (await readJsonBody<{ data?: string }>(file)).data;
  }
  const bytes = Buffer.from(data ?? '', 'base64url');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new MailboxTransportError('REJECTED');
  return { bytes, contentType: part.mimeType ?? null };
}
