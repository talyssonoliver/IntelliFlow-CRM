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

/** A file as fetched on demand from the provider. Never persisted. */
export interface FetchedAttachment {
  bytes: Buffer;
  contentType: string | null;
}
