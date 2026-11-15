/**
 * The person's communications in one firm (IFC-316, extends PG-203): found by their lead and
 * contact ids and by address, counted for the erasure preview and anonymised or deleted inside
 * the erasure transaction.
 *
 * What the erasure leaves is the checklist: deals and tasks (exported and kept, owner ruling
 * Q23) and stored files, whose objects live in storage and are deleted by hand. The rows keep
 * their storage locators so nobody loses track of the objects.
 */
import { Prisma, type PrismaClient } from '@intelliflow/db';
import { ERASED_EMAIL_DOMAIN } from '@intelliflow/domain';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
export type Db = PrismaClient | Tx;

export interface SubjectIds {
  leadIds: string[];
  contactIds: string[];
}

export const ERASED_NOTE = '[erased under a data request]';
export const ERASED_NAME = 'Erased';
/** Replaces the person's address on rows that keep other people's addresses too. */
const ERASED_ADDRESS = `erased@${ERASED_EMAIL_DOMAIN}`;

/** The deals whose contact is the person's: AI output about a deal is about its contact (Q22). */
export async function subjectDealIds(
  db: Db,
  tenantId: string,
  contactIds: string[]
): Promise<string[]> {
  if (contactIds.length === 0) return [];
  const deals = await db.opportunity.findMany({
    where: { tenantId, contactId: { in: contactIds } },
    select: { id: true },
  });
  return deals.map((d) => d.id);
}

/** The person's tasks: linked to their leads or contacts, or to a deal of their contact (Q23). */
export function subjectTaskWhere(tenantId: string, ids: SubjectIds, dealIds: string[]) {
  return {
    tenantId,
    OR: [
      { leadId: { in: ids.leadIds } },
      { contactId: { in: ids.contactIds } },
      { opportunityId: { in: dealIds } },
    ],
  };
}

/** Sent to the person by address, or about them (AI insight and churn alerts to staff). */
export function subjectNotificationWhere(
  tenantId: string,
  notificationIds: string[],
  ids: SubjectIds,
  dealIds: string[]
) {
  return {
    tenantId,
    OR: [
      { id: { in: notificationIds } },
      { sourceId: { in: [...ids.leadIds, ...ids.contactIds, ...dealIds] } },
    ],
  };
}

/** Rows that name the person only by address (no lead/contact link), per table. */
export interface AddressIds {
  emailRecords: string[];
  tickets: string[];
  chats: string[];
  feedback: string[];
  notifications: string[];
  drafts: string[];
}

export async function addressIds(db: Db, tenantId: string, email: string): Promise<AddressIds> {
  const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id);
  // To, CC and BCC are stored as comma-separated lists (PG-207 mailbox sender, inbound mail):
  // each address is compared on its own, so a person among several recipients or only on
  // CC/BCC is found, and an address that merely contains theirs is not (codex).
  const emailRecords = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM email_records WHERE "tenantId" = ${tenantId}
      AND (
        dsar_normalise_email("fromEmail") = ${email}
        OR EXISTS (
          SELECT 1
          FROM unnest(string_to_array(concat_ws(',', "toEmail", "ccEmails", "bccEmails"), ','))
            AS recipient(address)
          WHERE dsar_normalise_email(recipient.address) = ${email}
        )
      )`;
  const tickets = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM tickets
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email("contactEmail") = ${email}`;
  const chats = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM chat_conversations
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email("contactEmail") = ${email}`;
  const feedback = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM feedback_surveys
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email("contactEmail") = ${email}`;
  const notifications = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM notifications
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email("recipientEmail") = ${email}`;
  const drafts = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM auto_response_drafts
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email("recipientEmail") = ${email}`;
  return {
    emailRecords: ids(emailRecords),
    tickets: ids(tickets),
    chats: ids(chats),
    feedback: ids(feedback),
    notifications: ids(notifications),
    drafts: ids(drafts),
  };
}

/** The ids of every communication row about the person, per table. */
interface CommunicationIds {
  emailRecords: string[];
  tickets: string[];
  chats: string[];
  feedback: string[];
  notificationWhere: ReturnType<typeof subjectNotificationWhere>;
  draftWhere: { tenantId: string; OR: Array<Record<string, unknown>> };
  dealIds: string[];
}

async function communicationIds(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds
): Promise<CommunicationIds> {
  const byAddress = await addressIds(db, tenantId, email);
  const dealIds = await subjectDealIds(db, tenantId, ids.contactIds);
  const linked = async (
    table: 'emailRecord' | 'ticket' | 'chatConversation' | 'feedbackSurvey',
    extra: string[]
  ): Promise<string[]> => {
    const rows: Array<{ id: string }> = await (db[table] as any).findMany({
      where: { tenantId, OR: [{ contactId: { in: ids.contactIds } }, { id: { in: extra } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  };
  return {
    emailRecords: await linked('emailRecord', byAddress.emailRecords),
    tickets: await linked('ticket', byAddress.tickets),
    chats: await linked('chatConversation', byAddress.chats),
    feedback: await linked('feedbackSurvey', byAddress.feedback),
    // AI insight and churn alerts to staff carry the lead, contact or (for their deals)
    // opportunity id as their source (codex).
    notificationWhere: subjectNotificationWhere(tenantId, byAddress.notifications, ids, dealIds),
    draftWhere: {
      tenantId,
      OR: [{ leadId: { in: ids.leadIds } }, { id: { in: byAddress.drafts } }],
    },
    dealIds,
  };
}

/** How many communication rows the erasure anonymises or deletes, per category. */
export async function communicationCounts(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds
): Promise<Record<string, number>> {
  const c = await communicationIds(db, tenantId, email, ids);
  const [notifications, autoResponseDrafts, contactReplyDrafts, calendarEvents, experiments] =
    await Promise.all([
      db.notification.count({ where: c.notificationWhere }),
      db.autoResponseDraft.count({ where: c.draftWhere }),
      db.contactReplyDraft.count({ where: { tenantId, contactId: { in: ids.contactIds } } }),
      db.calendarEvent.count({ where: { tenantId, contactId: { in: ids.contactIds } } }),
      db.experimentAssignment.count({ where: { leadId: { in: ids.leadIds } } }),
    ]);
  return {
    emailRecords: c.emailRecords.length,
    tickets: c.tickets.length,
    chats: c.chats.length,
    feedbackSurveys: c.feedback.length,
    notifications,
    autoResponseDrafts,
    contactReplyDrafts,
    calendarEvents,
    experimentAssignments: experiments,
  };
}

/** What the erasure leaves for the admin: deals and tasks (Q23) and stored files. Counts only. */
export async function remainingChecklist(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds
): Promise<Record<string, number>> {
  const c = await communicationIds(db, tenantId, email, ids);
  const [deals, tasks, storedLeadFiles, emailFiles, chatFiles] = await Promise.all([
    db.opportunity.count({ where: { tenantId, contactId: { in: ids.contactIds } } }),
    db.task.count({ where: subjectTaskWhere(tenantId, ids, c.dealIds) }),
    db.leadFile.count({ where: { tenantId, leadId: { in: ids.leadIds }, url: { not: null } } }),
    db.emailAttachment.count({ where: { tenantId, emailId: { in: c.emailRecords } } }),
    db.chatMessage.count({
      where: { tenantId, conversationId: { in: c.chats }, attachments: { not: Prisma.DbNull } },
    }),
  ]);
  return {
    deals,
    tasks,
    storedLeadFiles,
    storedEmailAttachments: emailFiles,
    storedChatAttachments: chatFiles,
  };
}

/** A comma-separated address list with the person's address replaced, order kept. */
function withoutAddress(column: string, email: string): Prisma.Sql {
  const col = Prisma.raw(`"${column}"`);
  return Prisma.sql`CASE WHEN ${col} IS NULL THEN NULL ELSE array_to_string(ARRAY(
      SELECT CASE WHEN dsar_normalise_email(r.address) = ${email} THEN ${ERASED_ADDRESS}
        ELSE r.address END
      FROM unnest(string_to_array(${col}, ',')) WITH ORDINALITY AS r(address, n)
      ORDER BY r.n), ',') END`;
}

async function eraseEmailRecords(tx: Tx, tenantId: string, email: string, ids: string[]) {
  const records = await tx.$executeRaw`
    UPDATE email_records SET subject = 'Erased email', body = ${ERASED_NOTE}, metadata = NULL,
      "fromEmail" = ${withoutAddress('fromEmail', email)},
      "toEmail" = ${withoutAddress('toEmail', email)},
      "ccEmails" = ${withoutAddress('ccEmails', email)},
      "bccEmails" = ${withoutAddress('bccEmails', email)}
    WHERE "tenantId" = ${tenantId} AND id = ANY(${ids}::text[])`;
  // The file's name goes; its storage locator stays for the stored-file checklist item.
  await tx.emailAttachment.updateMany({
    where: { tenantId, emailId: { in: ids } },
    data: { fileName: 'erased' },
  });
  return Number(records);
}

async function eraseTickets(tx: Tx, tenantId: string, ids: string[], now: Date) {
  const tickets = await tx.ticket.updateMany({
    where: { tenantId, id: { in: ids } },
    data: {
      subject: 'Erased ticket',
      description: null,
      contactName: ERASED_NAME,
      contactEmail: ERASED_ADDRESS,
      updatedAt: now,
    },
  });
  // Staff replies quote the person too, so every entry's text goes; staff names stay.
  await tx.$executeRaw`
    UPDATE ticket_activities SET content = ${ERASED_NOTE}, "systemEventData" = NULL,
      "authorName" = CASE WHEN "authorRole" = 'Customer' THEN ${ERASED_NAME} ELSE "authorName" END
    WHERE "tenantId" = ${tenantId} AND "ticketId" = ANY(${ids}::text[])`;
  await tx.ticketNextStep.updateMany({
    where: { tenantId, ticketId: { in: ids } },
    data: { title: 'Erased step' },
  });
  // A ticket attachment's url is an inline data: URL holding the start of the file (no stored
  // object exists), so it goes with the name.
  await tx.ticketAttachment.updateMany({
    where: { tenantId, ticketId: { in: ids } },
    data: { name: 'erased', url: null },
  });
  await tx.ticketAIInsight.deleteMany({ where: { tenantId, ticketId: { in: ids } } });
  return tickets.count;
}

async function eraseChats(tx: Tx, tenantId: string, ids: string[], now: Date) {
  const chats = await tx.chatConversation.updateMany({
    where: { tenantId, id: { in: ids } },
    data: {
      contactName: ERASED_NAME,
      contactEmail: null,
      subject: null,
      externalId: null,
      updatedAt: now,
    },
  });
  // Attachments keep their locators for the stored-file checklist item.
  await tx.$executeRaw`
    UPDATE chat_messages SET content = ${ERASED_NOTE}, metadata = NULL,
      "senderName" = CASE WHEN "senderType" = 'contact' THEN ${ERASED_NAME} ELSE "senderName" END
    WHERE "tenantId" = ${tenantId} AND "conversationId" = ANY(${ids}::text[])`;
  return chats.count;
}

async function eraseNotifications(
  tx: Tx,
  tenantId: string,
  email: string,
  where: CommunicationIds['notificationWhere']
) {
  const rows = await tx.notification.findMany({ where, select: { id: true } });
  const ids = rows.map((r) => r.id);
  const erased = await tx.$executeRaw`
    UPDATE notifications SET subject = 'Erased notification', body = ${ERASED_NOTE},
      "htmlBody" = NULL, "templateVariables" = NULL, metadata = NULL,
      "recipientPhone" = CASE WHEN dsar_normalise_email("recipientEmail") = ${email}
        THEN NULL ELSE "recipientPhone" END,
      "recipientEmail" = CASE WHEN dsar_normalise_email("recipientEmail") = ${email}
        THEN NULL ELSE "recipientEmail" END
    WHERE "tenantId" = ${tenantId} AND id = ANY(${ids}::text[])`;
  return Number(erased);
}

/**
 * Anonymises or deletes the person's communications inside the erasure transaction. Message
 * text, subjects and the person's name and address go; staff names, dates and statuses stay.
 * Drafts and experiment assignments are deleted. Counts only, per category.
 */
export async function eraseCommunications(
  tx: Tx,
  input: { tenantId: string; email: string; ids: SubjectIds; now: Date }
): Promise<Record<string, number>> {
  const { tenantId, email, ids, now } = input;
  const c = await communicationIds(tx, tenantId, email, ids);
  const emailRecords = await eraseEmailRecords(tx, tenantId, email, c.emailRecords);
  const tickets = await eraseTickets(tx, tenantId, c.tickets, now);
  const chats = await eraseChats(tx, tenantId, c.chats, now);
  const feedback = await tx.feedbackSurvey.updateMany({
    where: { tenantId, id: { in: c.feedback } },
    data: {
      contactName: ERASED_NAME,
      contactEmail: ERASED_ADDRESS,
      comment: null,
      followUpNote: null,
      tags: Prisma.DbNull,
      updatedAt: now,
    },
  });
  const notifications = await eraseNotifications(tx, tenantId, email, c.notificationWhere);
  const autoResponseDrafts = await tx.autoResponseDraft.deleteMany({ where: c.draftWhere });
  const contactReplyDrafts = await tx.contactReplyDraft.deleteMany({
    where: { tenantId, contactId: { in: ids.contactIds } },
  });
  const calendarEvents = await tx.calendarEvent.updateMany({
    where: { tenantId, contactId: { in: ids.contactIds } },
    data: {
      title: 'Erased event',
      description: null,
      location: null,
      attendees: Prisma.DbNull,
      updatedAt: now,
    },
  });
  const experiments = await tx.experimentAssignment.deleteMany({
    where: { leadId: { in: ids.leadIds } },
  });
  return {
    emailRecords,
    tickets,
    chats,
    feedbackSurveys: feedback.count,
    notifications,
    autoResponseDrafts: autoResponseDrafts.count,
    contactReplyDrafts: contactReplyDrafts.count,
    calendarEvents: calendarEvents.count,
    experimentAssignments: experiments.count,
  };
}
