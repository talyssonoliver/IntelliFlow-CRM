import { MailboxTransportError } from './mailbox-errors';

/**
 * Rich mail content for the mailbox sync, shared by the Gmail, Graph and Zoho readers: the
 * provider's HTML body and the METADATA of the mail's attachments (never the files).
 *
 * Attachments are not copied into Aurora. A reader records only what is needed to ask the
 * provider for a file later (a provider attachment id, name, type, size, content id); the bytes
 * are fetched on demand, at request time, by the `fetch*Attachment` function of each provider,
 * and handed to the user without being stored.
 */

/** What Aurora keeps about one attachment: no bytes. */
export interface MailAttachmentMeta {
  /** What the provider needs to find the file again (Gmail: the part id; Zoho: folder + id). */
  providerAttachmentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  /** The Content-ID an inline image is referenced by in the HTML (`cid:`), without angle brackets. */
  contentId: string | null;
  isInline: boolean;
}

/** A kept mail's content: its text, its HTML (null when it has none or it is too large) and its attachments' metadata. */
export interface MailContent {
  text: string;
  html: string | null;
  attachments: MailAttachmentMeta[];
}

/** An HTML body larger than this is not kept (cutting HTML would break its markup): the text stays. */
export const MAX_HTML_CHARS = 500_000;
/** Most attachments recorded per mail. */
export const MAX_ATTACHMENTS_PER_MAIL = 50;
/** The largest file the on-demand proxy hands out. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export function capHtml(html: string | null | undefined): string | null {
  const value = (html ?? '').replaceAll('\u0000', '').trim();
  return value && value.length <= MAX_HTML_CHARS ? value : null;
}

/** A Content-ID header value as the bare id a `cid:` URL names. */
export function bareContentId(value: string | null | undefined): string | null {
  const id = (value ?? '').trim().replace(/^<|>$/g, '').trim();
  return id ? id.slice(0, 255) : null;
}

/** An id that goes into a provider URL path: never empty, `.` or `..` (encodeURIComponent keeps those). */
export function safeSegment(value: string): string {
  if (!value || value === '.' || value === '..') throw new MailboxTransportError('REJECTED');
  return value;
}

/**
 * Any failure while reading a provider response as a transport error: a body that stops or is cut
 * (timeout, reset) is CONNECT_FAILED, one that is not valid JSON is REJECTED. Provider text never
 * escapes.
 */
export function asTransportError(error: unknown): MailboxTransportError {
  if (error instanceof MailboxTransportError) return error;
  return new MailboxTransportError(error instanceof SyntaxError ? 'REJECTED' : 'CONNECT_FAILED');
}

/** The JSON of a provider response, with read and parse failures as transport errors. */
export async function readJsonBody<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw asTransportError(error);
  }
}

/**
 * A response body read into memory with a running byte cap: it stops as soon as the cap is passed,
 * so a provider that sends more than it declared (or declares nothing) cannot fill memory.
 */
export async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new MailboxTransportError('REJECTED');
  const reader = response.body?.getReader();
  try {
    if (!reader) {
      const whole = Buffer.from(await response.arrayBuffer());
      if (whole.length > maxBytes) throw new MailboxTransportError('REJECTED');
      return whole;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new MailboxTransportError('REJECTED');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    throw asTransportError(error);
  }
}

/** A file as fetched on demand from the provider. Never persisted. */
export interface FetchedAttachment {
  bytes: Buffer;
  contentType: string | null;
}
