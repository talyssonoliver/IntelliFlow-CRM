/**
 * Who a synced mail is with, and whether it is already logged: split out of the sync engine
 * (outlook-inbox-sync.ts) to keep it within its size limit. No behaviour of its own.
 */
import { MailboxTransportError } from '@intelliflow/adapters';
import type { LoggedRecord } from './mail-sync-links';
import { messageIdHeader } from './mail-sync-record';
import type { SyncFolder, SyncedMessage } from './mail-sync-reader';

/** What the matching reads: the database and the processing-restriction check. */
export interface MatchDeps {
  prisma: any;
  /** True when the address has an active processing restriction in the tenant. */
  isRestricted: (tenantId: string, email: string) => Promise<boolean>;
}

/** The mailbox fields the matching needs. */
export interface MatchMailbox {
  id: string;
  tenantId: string;
  /** The owner of a personal mailbox; null for the company mailbox. */
  userId?: string | null;
  accountAddress: string | null;
  fromAddress: string;
}

/**
 * The lead or contact the sender is, in the mailbox's tenant; null when neither. A personal mailbox
 * (`ownerId` set) matches only the people its owner owns (register #64): mail is linked to a lead or
 * contact, and so becomes visible to whoever can see them, so it must never be linked to a person
 * the owner cannot see (someone could add a lead with a colleague's correspondent's address).
 */
async function matchSender(
  deps: MatchDeps,
  tenantId: string,
  email: string,
  ownerId?: string | null
): Promise<{ contactId: string | null; leadId: string | null } | null> {
  const where = {
    tenantId,
    email: { equals: email, mode: 'insensitive' },
    ...(ownerId ? { ownerId } : {}),
  };
  const contact = await deps.prisma.contact.findFirst({ where, select: { id: true } });
  if (contact) return { contactId: contact.id, leadId: null };
  const lead = await deps.prisma.lead.findFirst({ where, select: { id: true } });
  return lead ? { contactId: null, leadId: lead.id } : null;
}

/**
 * Who the mail is with: the sender of received mail, or the first recipient of sent mail who is
 * a lead or contact. Null when nobody is (then nothing is stored).
 */
export async function counterparty(
  deps: MatchDeps,
  mailbox: MatchMailbox,
  message: SyncedMessage,
  folder: SyncFolder
): Promise<{ email: string; contactId: string | null; leadId: string | null } | null> {
  const own = (mailbox.accountAddress ?? mailbox.fromAddress).toLowerCase();
  const candidates = folder === 'inbox' ? [message.fromAddress] : [...message.to, ...message.cc];
  for (const email of candidates) {
    if (!email || email === own) continue;
    const match = await matchSender(deps, mailbox.tenantId, email, mailbox.userId);
    if (match) return { email, ...match };
  }
  return null;
}

/** True when anyone on the mail but the owner (sender, To, Cc) has a processing restriction: then nothing of it is stored. */
export async function anyoneRestricted(
  deps: MatchDeps,
  mailbox: MatchMailbox,
  message: SyncedMessage
): Promise<boolean> {
  const own = (mailbox.accountAddress ?? mailbox.fromAddress).toLowerCase();
  const people = new Set([message.fromAddress, ...message.to, ...message.cc]);
  for (const email of people) {
    if (email && email !== own && (await deps.isRestricted(mailbox.tenantId, email))) return true;
  }
  return false;
}

/** Mail already in the CRM: the same provider message, or (sent mail) the CRM's own send. */
export async function alreadyLogged(
  deps: MatchDeps,
  mailbox: MatchMailbox,
  message: SyncedMessage
): Promise<LoggedRecord | null> {
  // Same provider id, or the same Message-ID header already logged for this mailbox.
  const header = messageIdHeader(message);
  const existing = await deps.prisma.emailRecord.findFirst({
    where: {
      tenantId: mailbox.tenantId,
      mailboxId: mailbox.id,
      OR: [
        { providerMessageId: message.providerMessageId.slice(0, 255) },
        ...(header ? [{ messageIdHeader: header }] : []),
      ],
    },
    select: { id: true, metadata: true },
  });
  return existing;
}

/** A kept mail's body; null when the provider refuses that one message (deleted meanwhile). */
export async function bodyOf(message: SyncedMessage): Promise<string | null> {
  if (!message.loadBody) return message.bodyText;
  try {
    return await message.loadBody();
  } catch (error) {
    // One message the provider refuses never fails the round; a dead token or an outage does.
    if (error instanceof MailboxTransportError && error.code === 'REJECTED') return null;
    throw error;
  }
}
