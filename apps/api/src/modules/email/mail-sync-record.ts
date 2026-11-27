/**
 * MVP-001: what a synced mail becomes, and which way it went (split out of the sync engine,
 * outlook-inbox-sync.ts, to keep it within its size limit).
 * - The email record's fields, with the direction and the sender's name in its metadata (the
 *   sender's address is the record's `fromEmail`).
 * - The direction comes from the provider folder the mail was read in: mail in Sent is outbound,
 *   mail in the Inbox is inbound.
 */
import type { MailSyncReader, SyncFolder, SyncedMessage } from './mail-sync-reader';
import type { RichMail } from './mail-sync-rich';

/** Which way a synced mail went. */
export type MailDirection = 'inbound' | 'outbound';

export function directionOf(folder: SyncFolder): MailDirection {
  return folder === 'sentitems' ? 'outbound' : 'inbound';
}

/** The mailbox fields a synced mail's records need. */
export interface RecordMailbox {
  id: string;
  tenantId: string;
  userId: string | null;
  accountAddress: string | null;
  fromAddress: string;
}

export function messageIdHeader(message: SyncedMessage): string | null {
  return message.internetMessageId?.slice(0, 255) ?? null;
}

/** The sender's address: the message's own, else the mailbox's (the owner's, for mail they sent). */
export function senderOf(message: SyncedMessage, mailbox: RecordMailbox): string {
  return message.fromAddress ?? mailbox.accountAddress ?? mailbox.fromAddress;
}

/** The email record a kept synced mail becomes. */
export function recordData(args: {
  mailbox: RecordMailbox;
  message: SyncedMessage;
  folder: SyncFolder;
  provider: MailSyncReader['provider'];
  party: { contactId: string | null; leadId: string | null };
  body: string;
  threadId: string | null;
  /** The sanitised HTML and attachment metadata of a reader that has them. */
  rich?: Pick<RichMail, 'bodyHtml'>;
}): Record<string, unknown> {
  const { mailbox, message, folder, provider, party, body, threadId, rich } = args;
  const direction = directionOf(folder);
  const sent = direction === 'outbound';
  const fromName = message.fromName?.trim();
  return {
    subject: message.subject,
    body,
    ...(rich?.bodyHtml ? { bodyHtml: rich.bodyHtml } : {}),
    fromEmail: senderOf(message, mailbox),
    toEmail: message.to.join(', '),
    ccEmails: message.cc.join(', ') || null,
    status: sent ? 'SENT' : 'DELIVERED',
    // The provider's own date (Graph receivedDateTime, Gmail internalDate, Zoho receivedTime), for
    // received mail too, so a thread can be ordered and dated. An inbound record has no userId, so
    // it stays out of Sent.
    sentAt: message.receivedAt,
    isRead: sent ? true : message.isRead,
    tenantId: mailbox.tenantId,
    mailboxId: mailbox.id,
    // userId is the sender on an email record: the owner for mail they sent, none for mail they
    // received, so received mail stays out of their Sent folder (as the inbound webhook does).
    ...(sent ? { userId: mailbox.userId } : {}),
    contactId: party.contactId,
    messageIdHeader: messageIdHeader(message),
    provider,
    providerMessageId: message.providerMessageId.slice(0, 255),
    createdAt: message.receivedAt,
    metadata: {
      source: 'outlook-sync',
      folder,
      direction,
      ...(fromName ? { fromName } : {}),
      mailboxOwnerId: mailbox.userId,
      conversationId: message.conversationId,
      ...(threadId ? { threadId } : {}),
      ...(party.leadId ? { leadId: party.leadId } : {}),
    },
  };
}
