/**
 * The on-demand attachment proxy. Attachments and inline images of synced mail are NOT copied into
 * Aurora: only their metadata is stored (email_attachments). When a user opens or downloads one,
 * this reads the file from the mailbox's provider (Gmail, Microsoft Graph or Zoho) at request time
 * and hands it to that user. Nothing is written: not to the database, not to storage.
 *
 * Checks, in order: the attachment and its email belong to the caller's tenant; the caller may read
 * the email (canReadEmailRecord, the same rule the email view uses); the file is small enough; the mailbox it was synced from is still
 * connected. Provider text never reaches the caller: failures are reduced to a fixed message.
 */
import { TRPCError } from '@trpc/server';
import {
  MAX_ATTACHMENT_BYTES,
  MailboxTransportError,
  fetchGmailAttachment,
  fetchGraphAttachment,
  fetchZohoAttachment,
  type FetchedAttachment,
} from '@intelliflow/adapters';
import type { EmailRouterCtx } from './email-access';
import { canReadEmailRecord } from './email-read-access';
import {
  forgetAccessToken,
  getOAuthAccessToken,
  type MailboxTransports,
  type TransportMailbox,
} from './mailbox-transport';

export interface ProxiedAttachment {
  fileName: string;
  contentType: string;
  size: number;
  contentBase64: string;
}

const SAFE_FALLBACK_TYPE = 'application/octet-stream';

/** The extension an attached item's name gets once its content type is known (items are named by subject). */
const ITEM_EXTENSIONS: Record<string, string> = {
  'message/rfc822': '.eml',
  'text/vcard': '.vcf',
  'text/calendar': '.ics',
};

function withExtension(name: string, contentType: string): string {
  const extension = ITEM_EXTENSIONS[contentType];
  return extension && !name.toLowerCase().endsWith(extension) ? `${name}${extension}` : name;
}

function notFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Attachment not found.' });
}

function providerError(error: unknown): TRPCError {
  if (error instanceof MailboxTransportError) {
    if (error.code === 'REJECTED') {
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'The mail provider no longer has this attachment.',
      });
    }
    if (error.code === 'AUTH_FAILED' || error.code === 'TOKEN_REVOKED') {
      return new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Reconnect the mailbox this email came from to open its attachments.',
      });
    }
  }
  return new TRPCError({
    code: 'SERVICE_UNAVAILABLE',
    message: 'The mail provider could not be reached. Try again.',
  });
}

interface AttachmentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  providerAttachmentId: string | null;
  email: {
    id: string;
    tenantId: string;
    userId: string | null;
    mailboxId: string | null;
    provider: string | null;
    providerMessageId: string | null;
  };
}

/** Most provider reads one user may have running at once (each buffers a file in memory). */
const MAX_CONCURRENT_PER_USER = 4;
const running = new Map<string, number>();

async function withUserSlot<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const count = running.get(userId) ?? 0;
  if (count >= MAX_CONCURRENT_PER_USER) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many attachments are opening at once. Try again in a moment.',
    });
  }
  running.set(userId, count + 1);
  try {
    return await work();
  } finally {
    const left = (running.get(userId) ?? 1) - 1;
    if (left <= 0) running.delete(userId);
    else running.set(userId, left);
  }
}

async function fromProvider(
  kind: string,
  mailbox: TransportMailbox,
  token: string,
  row: AttachmentRow
): Promise<FetchedAttachment> {
  const messageId = row.email.providerMessageId as string;
  const locator = row.providerAttachmentId as string;
  if (kind === 'MICROSOFT')
    return fetchGraphAttachment(token, { messageId, attachmentId: locator });
  if (kind === 'GMAIL') return fetchGmailAttachment(token, { messageId, partId: locator });
  if (kind === 'ZOHO') {
    if (!mailbox.oauthAccountId || !mailbox.oauthApiDomain) throw notFound();
    return fetchZohoAttachment(
      token,
      { accountId: mailbox.oauthAccountId, mailHost: mailbox.oauthApiDomain },
      { messageId, providerAttachmentId: locator }
    );
  }
  throw notFound();
}

export async function fetchEmailAttachment(
  c: EmailRouterCtx,
  transports: MailboxTransports,
  input: { emailId: string; attachmentId: string },
  now: Date = new Date()
): Promise<ProxiedAttachment> {
  const { tenantId, userId } = c.tenant;
  const row: AttachmentRow | null = await c.prismaWithTenant.emailAttachment.findFirst({
    where: { id: input.attachmentId, emailId: input.emailId, tenantId, email: { tenantId } },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      providerAttachmentId: true,
      email: {
        select: {
          id: true,
          tenantId: true,
          userId: true,
          mailboxId: true,
          provider: true,
          providerMessageId: true,
        },
      },
    },
  });
  // Only synced attachments are served here; one with no provider locator is not on demand.
  if (!row?.providerAttachmentId || row.email.tenantId !== tenantId) throw notFound();
  // The same rule as the email view (getEmail): never stricter, never looser.
  // Register #64: the shared visibility predicate, the same one the email view uses.
  if (!(await canReadEmailRecord(c, row.email))) throw notFound();
  if (!row.email.mailboxId || !row.email.providerMessageId) throw notFound();
  if (row.fileSize > MAX_ATTACHMENT_BYTES) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'This attachment is too large to open here. Open it in your mail app.',
    });
  }
  const mailbox: (TransportMailbox & { status: string }) | null =
    await c.prismaWithTenant.emailMailbox.findFirst({
      where: { id: row.email.mailboxId, tenantId },
    });
  if (!mailbox || mailbox.status !== 'ACTIVE' || mailbox.kind !== row.email.provider) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'The mailbox this email came from is not connected.',
    });
  }
  return withUserSlot(userId, () => readFromProvider(c, transports, mailbox, row, now));
}

async function readFromProvider(
  c: EmailRouterCtx,
  transports: MailboxTransports,
  mailbox: TransportMailbox,
  row: AttachmentRow,
  now: Date
): Promise<ProxiedAttachment> {
  try {
    const token = await getOAuthAccessToken(c.prismaWithTenant, mailbox, transports, now);
    let file: FetchedAttachment;
    try {
      file = await fromProvider(mailbox.kind, mailbox, token, row);
    } catch (error) {
      if (error instanceof MailboxTransportError && error.code === 'AUTH_FAILED') {
        forgetAccessToken(mailbox.id);
      }
      throw error;
    }
    const contentType =
      file.contentType?.split(';')[0]?.trim() || row.fileType || SAFE_FALLBACK_TYPE;
    return {
      fileName: withExtension(row.fileName, contentType),
      contentType,
      size: file.bytes.length,
      contentBase64: file.bytes.toString('base64'),
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw providerError(error);
  }
}
