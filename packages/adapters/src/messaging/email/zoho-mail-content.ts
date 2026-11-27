/**
 * Zoho Mail content for the mailbox sync (rich bodies and attachment metadata), split out of
 * zoho-mail-reader.ts. See mail-content.ts: attachments are recorded as metadata only (from the
 * attachment-info call) and the file is fetched from Zoho on demand.
 *
 * The stored locator is `<folderId>:<attachmentId>`: Zoho addresses a message through its folder.
 */
import { MailboxTransportError } from './mailbox-errors';
import {
  MAX_ATTACHMENTS_PER_MAIL,
  MAX_ATTACHMENT_BYTES,
  bareContentId,
  capHtml,
  safeSegment,
  type FetchedAttachment,
  type MailAttachmentMeta,
} from './mail-content';
import { zohoAccountGet, zohoAccountGetBytes, type ZohoAccountRef } from './zoho-mailbox';
import { decodeEntities } from './zoho-text';

interface ZohoAttachmentInfo {
  attachmentId?: string | number;
  attachmentName?: string;
  attachmentSize?: number | string;
  cid?: string;
}

function metaOf(
  folderId: string,
  list: ZohoAttachmentInfo[] | undefined,
  inline: boolean,
  taken: number
): MailAttachmentMeta[] {
  const out: MailAttachmentMeta[] = [];
  for (const a of list ?? []) {
    if (taken + out.length >= MAX_ATTACHMENTS_PER_MAIL) break;
    if (a.attachmentId === undefined || a.attachmentId === null) continue;
    out.push({
      // An inline image is downloaded through its Content-ID (Zoho's /inline endpoint), a file through its id.
      providerAttachmentId: (inline && bareContentId(a.cid)
        ? `${folderId}:inline:${bareContentId(a.cid)}`
        : `${folderId}:${String(a.attachmentId)}`
      ).slice(0, 512),
      fileName:
        decodeEntities(a.attachmentName ?? '')
          .trim()
          .slice(0, 255) || `attachment-${taken + out.length + 1}`,
      fileType: 'application/octet-stream',
      fileSize: Math.max(0, Math.trunc(Number(a.attachmentSize) || 0)),
      contentId: inline ? bareContentId(a.cid) : null,
      isInline: inline,
    });
  }
  return out;
}

/** The mail's HTML (what Zoho returns as its content) and its attachments' metadata. */
export async function readZohoContent(
  fetchImpl: typeof fetch,
  accessToken: string,
  ref: ZohoAccountRef,
  folderId: string,
  messageId: string,
  rawContent: string,
  hasAttachment: boolean,
  /** True (the backfill): a refused attachment-info read is an error, not "no attachments". */
  strict = false
): Promise<{ html: string | null; attachments: MailAttachmentMeta[] }> {
  const html = /<[a-z][\s\S]*>/i.test(rawContent) ? capHtml(rawContent) : null;
  if (!hasAttachment && !/cid:/i.test(rawContent)) return { html, attachments: [] };
  const path = `/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/attachmentinfo?includeInline=true`;
  type Info = { data?: { attachments?: ZohoAttachmentInfo[]; inline?: ZohoAttachmentInfo[] } };
  let body: Info;
  try {
    body = (await zohoAccountGet(fetchImpl, accessToken, ref, path)) as Info;
  } catch (error) {
    // The sync still keeps the HTML when the list is refused for this one mail; the backfill must
    // not record "no attachments" for good.
    if (!strict && error instanceof MailboxTransportError && error.code === 'REJECTED')
      return { html, attachments: [] };
    throw error;
  }
  const files = metaOf(folderId, body.data?.attachments, false, 0);
  const inline = metaOf(folderId, body.data?.inline, true, files.length);
  return { html, attachments: [...files, ...inline] };
}

/**
 * One message's HTML and attachment metadata, read now (the backfill). Zoho's own time for the
 * message is not read here: the caller keeps the date it already stored.
 */
export async function readZohoMessageContent(
  accessToken: string,
  ref: ZohoAccountRef,
  folderId: string,
  messageId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ html: string | null; attachments: MailAttachmentMeta[] }> {
  const path = `/folders/${encodeURIComponent(folderId)}/messages/${encodeURIComponent(messageId)}/content`;
  const body = (await zohoAccountGet(fetchImpl, accessToken, ref, path)) as {
    data?: { content?: string };
  };
  return readZohoContent(
    fetchImpl,
    accessToken,
    ref,
    folderId,
    messageId,
    body.data?.content ?? '',
    true,
    true
  );
}

/** One attachment's bytes, read from Zoho now and never stored. */
export async function fetchZohoAttachment(
  accessToken: string,
  ref: ZohoAccountRef,
  locator: { messageId: string; providerAttachmentId: string },
  fetchImpl: typeof fetch = fetch
): Promise<FetchedAttachment> {
  const split = locator.providerAttachmentId.indexOf(':');
  if (split < 1) throw new MailboxTransportError('REJECTED');
  const folderId = locator.providerAttachmentId.slice(0, split);
  const rest = locator.providerAttachmentId.slice(split + 1);
  const message = `/folders/${encodeURIComponent(safeSegment(folderId))}/messages/${encodeURIComponent(safeSegment(locator.messageId))}`;
  const path = rest.startsWith('inline:')
    ? `${message}/inline?contentId=${encodeURIComponent(safeSegment(rest.slice('inline:'.length)))}`
    : `${message}/attachments/${encodeURIComponent(safeSegment(rest))}`;
  return zohoAccountGetBytes(fetchImpl, accessToken, ref, path, MAX_ATTACHMENT_BYTES);
}
