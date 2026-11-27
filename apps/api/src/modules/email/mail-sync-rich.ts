/**
 * What a kept synced mail stores beyond its text: the provider's HTML, sanitised at write time
 * (email-html-sanitizer.ts), and the METADATA of its attachments. The files themselves are never
 * copied into Aurora: they are fetched from the provider on demand (email-attachment-proxy.ts).
 */
import type { MailAttachmentMeta, MailContent } from '@intelliflow/adapters';
import { sanitizeEmailHtml } from './email-html-sanitizer';

export interface RichMail {
  /** Sanitised HTML, null when the mail has none (the text body is then used). */
  bodyHtml: string | null;
  attachments: MailAttachmentMeta[];
}

export function richOf(content: Pick<MailContent, 'html' | 'attachments'>): RichMail {
  return { bodyHtml: sanitizeEmailHtml(content.html), attachments: content.attachments };
}

/** The attachment rows of one email record: metadata only (`fileUrl` is '': nothing is stored). */
export function attachmentRows(
  emailId: string,
  tenantId: string,
  attachments: readonly MailAttachmentMeta[]
): Array<Record<string, unknown>> {
  return attachments.map((a) => ({
    emailId,
    tenantId,
    fileName: a.fileName,
    fileSize: a.fileSize,
    fileType: a.fileType,
    fileUrl: '',
    providerAttachmentId: a.providerAttachmentId,
    contentId: a.contentId,
    isInline: a.isInline,
  }));
}
