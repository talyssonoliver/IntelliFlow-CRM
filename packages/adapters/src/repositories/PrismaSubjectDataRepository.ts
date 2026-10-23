/**
 * Prisma implementation of SubjectDataPort (PG-203 DSAR, spec Addendum A + rounds 2-4,
 * owner ruling Q19).
 *
 * One person inside one firm, matched by dsar_normalise_email(email) = the exact normalised address
 * (existing rows are not guaranteed lowercase; no +tag folding). The export is an explicit
 * allowlist per category, capped at DSAR_LIMITS.exportRowCap rows (rows past the cap are
 * counted as EXCESS_ROWS so the request stays open), with free text withheld for firm review. The erasure anonymises the CRM core in ONE transaction, after re-reading
 * the request FOR UPDATE, and leaves communications as a counted manual checklist.
 * PublicFeedback is Aurora's own product feedback (no tenant) and is out of scope.
 */
import { Prisma, type PrismaClient } from '@intelliflow/db';
import { DSAR_LIMITS, ERASED_EMAIL_DOMAIN } from '@intelliflow/domain';
import type {
  ErasureOutcome,
  ErasureResult,
  SubjectDataPort,
  SubjectExport,
} from '@intelliflow/application';

const ERASED_NOTE = '[erased under a data request]';
const ERASED_ACTIVITY = 'Erased activity';
const ERASED_NAME = 'Erased';
const TAKE = DSAR_LIMITS.exportRowCap;

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Db = PrismaClient | Tx;

interface SubjectIds {
  leadIds: string[];
  contactIds: string[];
}

// Every address match uses dsar_normalise_email, the SQL twin of normalizeSubjectEmail (any
// outer whitespace, tabs and newlines included, then lower case), so a stored address with
// stray whitespace is never left out of an export or an erasure (codex).
/**
 * The erasure locks the rows it selects (`lock`), so a concurrent correction of an address
 * cannot move a row away from (or onto) this person between the selection and the anonymising
 * updates (codex). Previews and exports read without locks.
 */
const rowLock = (lock: boolean) => (lock ? Prisma.sql`FOR UPDATE` : Prisma.empty);

async function subjectIds(
  db: Db,
  tenantId: string,
  email: string,
  lock = false
): Promise<SubjectIds> {
  const leads = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM leads
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email(email) = ${email} ${rowLock(lock)}`;
  const contacts = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM contacts
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email(email) = ${email} ${rowLock(lock)}`;
  return { leadIds: leads.map((r) => r.id), contactIds: contacts.map((r) => r.id) };
}

async function bookedAppointmentIds(
  db: Db,
  tenantId: string,
  email: string,
  lock = false
): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM appointments
    WHERE "tenantId" = ${tenantId} AND dsar_normalise_email("bookerEmail") = ${email}
    ${rowLock(lock)}`;
  return rows.map((r) => r.id);
}

/** Rows that name the person only by address (no lead/contact link), per table. */
interface AddressIds {
  emailRecords: string[];
  tickets: string[];
  chats: string[];
  feedback: string[];
  notifications: string[];
  drafts: string[];
}

async function addressIds(db: Db, tenantId: string, email: string): Promise<AddressIds> {
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

/**
 * At most TAKE rows of a category. The query asks for one more; only when that extra row
 * exists is the category counted, so rows past the cap are reported, never silently dropped.
 */
async function upTo<T>(
  query: Promise<T[]>,
  count: () => Promise<number>
): Promise<{ rows: T[]; total: number }> {
  const rows = await query;
  if (rows.length <= TAKE) return { rows, total: rows.length };
  return { rows: rows.slice(0, TAKE), total: await count() };
}

/** Communications and stored files the erasure does not touch (owner Q19): counts only. */
async function checklist(
  db: Db,
  tenantId: string,
  email: string,
  ids: SubjectIds
): Promise<Record<string, number>> {
  const { leadIds, contactIds } = ids;
  const byAddress = await addressIds(db, tenantId, email);
  const [
    emailRecords,
    tickets,
    chats,
    feedbackSurveys,
    notifications,
    autoResponseDrafts,
    contactReplyDrafts,
    calendarEvents,
    experimentAssignments,
    storedLeadFiles,
  ] = await Promise.all([
    db.emailRecord.count({
      where: {
        tenantId,
        OR: [{ contactId: { in: contactIds } }, { id: { in: byAddress.emailRecords } }],
      },
    }),
    db.ticket.count({
      where: {
        tenantId,
        OR: [{ contactId: { in: contactIds } }, { id: { in: byAddress.tickets } }],
      },
    }),
    db.chatConversation.count({
      where: { tenantId, OR: [{ contactId: { in: contactIds } }, { id: { in: byAddress.chats } }] },
    }),
    db.feedbackSurvey.count({
      where: {
        tenantId,
        OR: [{ contactId: { in: contactIds } }, { id: { in: byAddress.feedback } }],
      },
    }),
    // Sent to the person by address, or about them: AI insight and churn alerts to staff
    // carry the lead or contact id as their source (codex).
    db.notification.count({
      where: {
        tenantId,
        OR: [
          { id: { in: byAddress.notifications } },
          { sourceId: { in: [...leadIds, ...contactIds] } },
        ],
      },
    }),
    db.autoResponseDraft.count({
      where: { tenantId, OR: [{ leadId: { in: leadIds } }, { id: { in: byAddress.drafts } }] },
    }),
    db.contactReplyDraft.count({ where: { tenantId, contactId: { in: contactIds } } }),
    db.calendarEvent.count({ where: { tenantId, contactId: { in: contactIds } } }),
    db.experimentAssignment.count({ where: { leadId: { in: leadIds } } }),
    db.leadFile.count({ where: { tenantId, leadId: { in: leadIds }, url: { not: null } } }),
  ]);
  return {
    emailRecords,
    tickets,
    chats,
    feedbackSurveys,
    notifications,
    autoResponseDrafts,
    contactReplyDrafts,
    calendarEvents,
    experimentAssignments,
    storedLeadFiles,
  };
}

export class PrismaSubjectDataRepository implements SubjectDataPort {
  constructor(private readonly prisma: PrismaClient) {}

  async buildExport(tenantId: string, subjectEmail: string): Promise<SubjectExport> {
    const db = this.prisma;
    const ids = await subjectIds(db, tenantId, subjectEmail);
    const { leadIds, contactIds } = ids;
    const appointmentIds = await bookedAppointmentIds(db, tenantId, subjectEmail);
    const byAddress = await addressIds(db, tenantId, subjectEmail);
    const contactOr = (addressMatched: string[]) => ({
      tenantId,
      OR: [{ contactId: { in: contactIds } }, { id: { in: addressMatched } }],
    });
    const where = {
      lead: { tenantId, id: { in: leadIds } },
      leadOwned: { tenantId, leadId: { in: leadIds } },
      contact: { tenantId, id: { in: contactIds } },
      contactOwned: { tenantId, contactId: { in: contactIds } },
      booking: { tenantId, id: { in: appointmentIds } },
      email: contactOr(byAddress.emailRecords),
      ticket: contactOr(byAddress.tickets),
      chat: contactOr(byAddress.chats),
      feedback: contactOr(byAddress.feedback),
      requests: { tenantId, subjectEmail },
    };
    const LIMIT = TAKE + 1;
    const insightOwned = { tenantId, entityId: { in: [...leadIds, ...contactIds] } };

    const [
      leads,
      leadScores,
      leadActivities,
      contacts,
      contactActivities,
      bookings,
      emailRecords,
      tickets,
      chats,
      feedback,
      dsarRequests,
      leadInsights,
      contactInsights,
      aiInsights,
      leadNotes,
      contactNotes,
      inlineContactNotes,
      leadFiles,
    ] = await Promise.all([
      upTo(
        db.lead.findMany({
          where: where.lead,
          select: {
            email: true,
            firstName: true,
            lastName: true,
            company: true,
            title: true,
            phone: true,
            location: true,
            website: true,
            avatarUrl: true,
            source: true,
            status: true,
            score: true,
            estimatedValue: true,
            tags: true,
            budget: true,
            authority: true,
            need: true,
            timeline: true,
            annualRevenue: true,
            utmSource: true,
            utmMedium: true,
            utmCampaign: true,
            utmContent: true,
            utmTerm: true,
            referrer: true,
            landingPath: true,
            lastContactedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          take: LIMIT,
        }),
        () => db.lead.count({ where: where.lead })
      ),
      upTo(
        db.aIScore.findMany({
          where: where.leadOwned,
          select: {
            score: true,
            confidence: true,
            factors: true,
            modelVersion: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
        }),
        () => db.aIScore.count({ where: where.leadOwned })
      ),
      upTo(
        db.leadActivity.findMany({
          where: where.leadOwned,
          select: { type: true, timestamp: true },
          take: LIMIT,
        }),
        () => db.leadActivity.count({ where: where.leadOwned })
      ),
      upTo(
        db.contact.findMany({
          where: where.contact,
          select: {
            email: true,
            firstName: true,
            lastName: true,
            title: true,
            phone: true,
            company: true,
            department: true,
            streetAddress: true,
            city: true,
            zipCode: true,
            linkedInUrl: true,
            avatarUrl: true,
            status: true,
            contactType: true,
            tags: true,
            lastContactedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          take: LIMIT,
        }),
        () => db.contact.count({ where: where.contact })
      ),
      upTo(
        db.contactActivity.findMany({
          where: where.contactOwned,
          select: { type: true, timestamp: true },
          take: LIMIT,
        }),
        () => db.contactActivity.count({ where: where.contactOwned })
      ),
      upTo(
        db.appointment.findMany({
          where: where.booking,
          select: {
            startTime: true,
            endTime: true,
            timezone: true,
            status: true,
            bookerName: true,
            bookerEmail: true,
            bookingAnswers: true,
            bookingConsentAt: true,
            bookingConsentVersion: true,
          },
          take: LIMIT,
        }),
        () => db.appointment.count({ where: where.booking })
      ),
      upTo(
        db.emailRecord.findMany({
          where: where.email,
          select: { createdAt: true, sentAt: true },
          take: LIMIT,
        }),
        () => db.emailRecord.count({ where: where.email })
      ),
      upTo(
        db.ticket.findMany({
          where: where.ticket,
          select: { ticketNumber: true, createdAt: true, resolvedAt: true, closedAt: true },
          take: LIMIT,
        }),
        () => db.ticket.count({ where: where.ticket })
      ),
      upTo(
        db.chatConversation.findMany({
          where: where.chat,
          select: { createdAt: true, closedAt: true },
          take: LIMIT,
        }),
        () => db.chatConversation.count({ where: where.chat })
      ),
      upTo(
        db.feedbackSurvey.findMany({
          where: where.feedback,
          // The person's own answers.
          select: { sentAt: true, respondedAt: true, score: true, rating: true, comment: true },
          take: LIMIT,
        }),
        () => db.feedbackSurvey.count({ where: where.feedback })
      ),
      upTo(
        db.dsarRequest.findMany({
          where: where.requests,
          select: { type: true, status: true, createdAt: true, completedAt: true },
          take: LIMIT,
        }),
        () => db.dsarRequest.count({ where: where.requests })
      ),
      upTo(
        db.leadAIInsight.findMany({
          where: where.leadOwned,
          select: {
            conversionProbability: true,
            estimatedValue: true,
            churnRisk: true,
            nextBestAction: true,
            sentiment: true,
            sentimentTrend: true,
            engagementScore: true,
            icpMatch: true,
            recommendations: true,
            updatedAt: true,
          },
          take: LIMIT,
        }),
        () => db.leadAIInsight.count({ where: where.leadOwned })
      ),
      upTo(
        db.contactAIInsight.findMany({
          where: where.contactOwned,
          select: {
            conversionProbability: true,
            lifetimeValue: true,
            churnRisk: true,
            nextBestAction: true,
            sentiment: true,
            sentimentTrend: true,
            engagementScore: true,
            recommendations: true,
            modelVersion: true,
            generatedAt: true,
          },
          take: LIMIT,
        }),
        () => db.contactAIInsight.count({ where: where.contactOwned })
      ),
      upTo(
        db.aIInsight.findMany({
          where: insightOwned,
          select: { type: true, category: true, title: true, description: true, createdAt: true },
          take: LIMIT,
        }),
        () => db.aIInsight.count({ where: insightOwned })
      ),
      db.leadNote.count({ where: where.leadOwned }),
      db.contactNote.count({ where: where.contactOwned }),
      // The contact's inline staff note is free text too: withheld and counted.
      db.contact.count({
        where: { ...where.contact, contactNotes: { not: null }, NOT: { contactNotes: '' } },
      }),
      db.leadFile.count({ where: where.leadOwned }),
    ]);

    const lists = [
      leads,
      leadScores,
      leadActivities,
      contacts,
      contactActivities,
      bookings,
      emailRecords,
      tickets,
      chats,
      feedback,
      dsarRequests,
      leadInsights,
      contactInsights,
      aiInsights,
    ];
    return {
      data: {
        leads: leads.rows,
        leadScores: leadScores.rows,
        leadActivities: leadActivities.rows,
        contacts: contacts.rows,
        contactActivities: contactActivities.rows,
        bookings: bookings.rows,
        emailRecords: emailRecords.rows,
        tickets: tickets.rows,
        chats: chats.rows,
        feedback: feedback.rows,
        dataRequests: dsarRequests.rows,
        // Derived data: generated by AI from the person's data (labelled in the export).
        leadInsights: leadInsights.rows,
        contactInsights: contactInsights.rows,
        aiInsights: aiInsights.rows,
      },
      withheld: {
        NOTES: leadNotes + contactNotes + inlineContactNotes,
        ACTIVITY_TEXT: leadActivities.total + contactActivities.total,
        TICKET_SUBJECTS: tickets.total,
        MESSAGE_BODIES: emailRecords.total + chats.total,
        DOCUMENTS: leadFiles,
        EXCESS_ROWS: lists.reduce((sum, list) => sum + list.total - list.rows.length, 0),
      },
    };
  }

  async previewErasure(tenantId: string, subjectEmail: string): Promise<ErasureOutcome> {
    const ids = await subjectIds(this.prisma, tenantId, subjectEmail);
    const appointmentIds = await bookedAppointmentIds(this.prisma, tenantId, subjectEmail);
    return {
      counts: {
        leads: ids.leadIds.length,
        contacts: ids.contactIds.length,
        bookings: appointmentIds.length,
      },
      checklist: await checklist(this.prisma, tenantId, subjectEmail, ids),
    };
  }

  async erase(input: {
    tenantId: string;
    requestId: string;
    subjectEmail: string;
    resolvedById: string;
    note: string;
    now: Date;
    clockBreached: boolean;
  }): Promise<ErasureResult> {
    const { tenantId, subjectEmail } = input;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
        // Re-read under a row lock: a double click or two admins can never erase twice.
        const locked = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT status::text AS status FROM dsar_requests
          WHERE id = ${input.requestId} AND "tenantId" = ${tenantId} FOR UPDATE`;
        if (locked[0]?.status !== 'VERIFIED') return { outcome: 'NOT_PENDING' as const };

        const ids = await subjectIds(tx, tenantId, subjectEmail, true);
        const { leadIds, contactIds } = ids;
        const appointmentIds = await bookedAppointmentIds(tx, tenantId, subjectEmail, true);
        const manual = await checklist(tx, tenantId, subjectEmail, ids);

        // Leads: a per-row placeholder keeps @@unique([email, tenantId]) satisfied.
        const leads = await tx.$executeRaw`
          UPDATE leads SET
            email = 'erased-' || id || ${'@' + ERASED_EMAIL_DOMAIN},
            "firstName" = NULL, "lastName" = NULL, company = NULL, title = NULL, phone = NULL,
            location = NULL, website = NULL, "avatarUrl" = NULL, budget = NULL, authority = NULL,
            need = NULL, timeline = NULL, "annualRevenue" = NULL, "utmSource" = NULL,
            "utmMedium" = NULL, "utmCampaign" = NULL, "utmContent" = NULL, "utmTerm" = NULL,
            "clickId" = NULL, referrer = NULL, "landingPath" = NULL, tags = ARRAY[]::text[],
            embedding = NULL, score = 0, "estimatedValue" = NULL, "updatedAt" = ${input.now}
          WHERE "tenantId" = ${tenantId} AND id = ANY(${leadIds}::text[])`;
        const contacts = await tx.$executeRaw`
          UPDATE contacts SET
            email = 'erased-' || id || ${'@' + ERASED_EMAIL_DOMAIN},
            "firstName" = ${ERASED_NAME}, "lastName" = ${ERASED_NAME}, title = NULL, phone = NULL,
            department = NULL, "streetAddress" = NULL, city = NULL, "zipCode" = NULL,
            company = NULL, "linkedInUrl" = NULL, "contactNotes" = NULL, "avatarUrl" = NULL,
            tags = ARRAY[]::text[], embedding = NULL, "updatedAt" = ${input.now}
          WHERE "tenantId" = ${tenantId} AND id = ANY(${contactIds}::text[])`;
        const leadNotes = await tx.$executeRaw`
          UPDATE lead_notes SET content = ${ERASED_NOTE}, embedding = NULL, search_vector = NULL
          WHERE "tenantId" = ${tenantId} AND "leadId" = ANY(${leadIds}::text[])`;
        const contactNotes = await tx.$executeRaw`
          UPDATE contact_notes SET content = ${ERASED_NOTE}, embedding = NULL, search_vector = NULL
          WHERE "tenantId" = ${tenantId} AND "contactId" = ANY(${contactIds}::text[])`;
        const leadActivities = await tx.$executeRaw`
          UPDATE lead_activities SET title = ${ERASED_ACTIVITY}, description = NULL, metadata = NULL
          WHERE "tenantId" = ${tenantId} AND "leadId" = ANY(${leadIds}::text[])`;
        // contact_activities.description is NOT NULL.
        const contactActivities = await tx.$executeRaw`
          UPDATE contact_activities SET title = ${ERASED_ACTIVITY}, description = ${ERASED_ACTIVITY},
            metadata = NULL
          WHERE "tenantId" = ${tenantId} AND "contactId" = ANY(${contactIds}::text[])`;
        // The file's name goes; its storage locator stays. The stored object itself is deleted
        // by hand (the manual checklist's "Stored files"), and without the url nobody could
        // find it again (codex HIGH).
        const leadFiles = await tx.leadFile.updateMany({
          where: { tenantId, leadId: { in: leadIds } },
          data: { name: 'erased' },
        });
        // Derived data about the person: deleted.
        const aiScores = await tx.aIScore.deleteMany({
          where: { tenantId, leadId: { in: leadIds } },
        });
        const leadInsights = await tx.leadAIInsight.deleteMany({
          where: { tenantId, leadId: { in: leadIds } },
        });
        const contactInsights = await tx.contactAIInsight.deleteMany({
          where: { tenantId, contactId: { in: contactIds } },
        });
        const insights = await tx.aIInsight.deleteMany({
          where: { tenantId, entityId: { in: [...leadIds, ...contactIds] } },
        });
        // The slot itself stays (it is the firm's calendar); who booked it and why does not.
        const bookings = await tx.$executeRaw`
          UPDATE appointments SET title = 'Booked appointment', description = NULL, notes = NULL,
            "cancellationReason" = NULL, "bookerName" = NULL, "bookerEmail" = NULL, "bookingAnswers" = NULL,
            "bookingConsentAt" = NULL, "bookingConsentVersion" = NULL, "updatedAt" = ${input.now}
          WHERE "tenantId" = ${tenantId} AND id = ANY(${appointmentIds}::text[])`;

        await tx.dsarRequest.updateMany({
          where: { id: input.requestId, tenantId, status: 'VERIFIED' },
          data: {
            status: 'COMPLETED',
            resolvedById: input.resolvedById,
            resolutionNote: input.note,
            noHoldConfirmedAt: input.now,
            completedAt: input.now,
            clockBreached: input.clockBreached,
          },
        });

        return {
          outcome: 'ERASED' as const,
          result: {
            counts: {
              leads: Number(leads),
              contacts: Number(contacts),
              leadNotes: Number(leadNotes),
              contactNotes: Number(contactNotes),
              leadActivities: Number(leadActivities),
              contactActivities: Number(contactActivities),
              leadFiles: leadFiles.count,
              aiScores: aiScores.count,
              aiInsights: leadInsights.count + contactInsights.count + insights.count,
              bookings: Number(bookings),
            },
            checklist: manual,
          },
        };
      },
      { timeout: 30_000 }
    );
  }
}
