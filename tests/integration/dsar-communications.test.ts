/**
 * IFC-316 — an approved erasure also erases the person's communications, real-Database test.
 *
 * Seeds one person with mail (as one of several recipients), a ticket with its activity and an
 * attachment, a chat, feedback, a notification, drafts and a calendar event, and another person
 * in the same firm. After the erasure, the person's text, name and address are gone from every
 * row, other people's addresses and rows are untouched, and the checklist lists only deals,
 * tasks and stored files.
 *
 * Skips cleanly (with a visible reason) when DATABASE_URL is not set.
 */

import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaDsarRepository } from '../../packages/adapters/src/repositories/PrismaDsarRepository';
import { PrismaSubjectDataRepository } from '../../packages/adapters/src/repositories/PrismaSubjectDataRepository';
import { ensureMigrationSql } from './dsar-setup';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;
if (!DB_URL) console.log('Skipping DSAR communications test: DATABASE_URL not set');

const RUN = `ifc316_${Date.now()}_${randomBytes(3).toString('hex')}`;
const TENANT = `${RUN}_a`;
const ADMIN = `${RUN}_admin`;
const SUBJECT = `${RUN}-ada@example.invalid`;
const OTHER = `${RUN}-grace@example.invalid`;
const HOUR = 3_600_000;

describeDb('IFC-316 erasure of communications (real DB)', () => {
  let prisma: any;
  let dbReady = false;
  let subjects: PrismaSubjectDataRepository;
  const seeded: Record<string, string> = {};

  beforeEach((ctx) => {
    if (!dbReady) ctx.skip();
  });

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL! }) });
    const skipReason = await ensureMigrationSql(prisma, DB_URL!);
    if (skipReason) {
      console.log(`Skipping DSAR communications test: ${skipReason}`);
      return;
    }
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id LIKE 'ifc316\\_%' AND id < $1`,
      `ifc316_${Date.now() - 86_400_000}`
    );
    await prisma.tenant.create({ data: { id: TENANT, name: 'Smith Law', slug: TENANT } });
    await prisma.user.create({
      data: { id: ADMIN, tenantId: TENANT, email: `${ADMIN}@example.invalid`, role: 'ADMIN' },
    });
    subjects = new PrismaSubjectDataRepository(prisma);
    await seed();
    dbReady = true;
  });

  afterAll(async () => {
    if (!prisma) return;
    // Tenant FKs cascade to every seeded row.
    if (dbReady) await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  async function seed() {
    const t = { tenantId: TENANT };
    const lead = await prisma.lead.create({
      data: { ...t, ownerId: ADMIN, email: SUBJECT, firstName: 'Ada' },
    });
    const contact = await prisma.contact.create({
      data: { ...t, email: SUBJECT, firstName: 'Ada', lastName: 'Lovelace', ownerId: ADMIN },
    });
    const sla = await prisma.sLAPolicy.create({ data: { ...t, name: `${RUN} SLA` } });
    const mail = await prisma.emailRecord.create({
      data: {
        ...t,
        subject: 'Your custody hearing',
        body: 'Ada, about the hearing on Monday',
        fromEmail: OTHER,
        toEmail: `${OTHER}, ${SUBJECT.toUpperCase()}`,
        ccEmails: OTHER,
      },
    });
    await prisma.emailAttachment.create({
      data: {
        ...t,
        emailId: mail.id,
        fileName: 'ada-passport.pdf',
        fileSize: 10,
        fileType: 'application/pdf',
        fileUrl: `${RUN}/mail/1`,
      },
    });
    const otherMail = await prisma.emailRecord.create({
      data: {
        ...t,
        subject: 'Grace only',
        body: 'Not about Ada',
        fromEmail: OTHER,
        toEmail: OTHER,
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        ...t,
        ticketNumber: `T-${RUN}`,
        subject: 'Ada cannot log in',
        description: 'Ada says her divorce papers are missing',
        slaPolicyId: sla.id,
        contactName: 'Ada Lovelace',
        contactEmail: SUBJECT,
      },
    });
    await prisma.ticketActivity.create({
      data: {
        ...t,
        ticketId: ticket.id,
        type: 'CUSTOMER_MESSAGE',
        content: 'Please call me about the divorce',
        authorName: 'Ada Lovelace',
        authorRole: 'Customer',
      },
    });
    await prisma.ticketActivity.create({
      data: {
        ...t,
        ticketId: ticket.id,
        type: 'AGENT_REPLY',
        content: 'Hi Ada, we will call',
        authorName: 'Sam Staff',
        authorRole: 'Support Agent',
      },
    });
    await prisma.ticketAttachment.create({
      data: { ...t, ticketId: ticket.id, name: 'ada-id.png', size: '1 KB', url: `${RUN}/t/1` },
    });
    const chat = await prisma.chatConversation.create({
      data: { ...t, contactName: 'Ada', contactEmail: SUBJECT, subject: 'Ada asks' },
    });
    await prisma.chatMessage.create({
      data: {
        ...t,
        conversationId: chat.id,
        content: 'Ada here',
        senderType: 'contact',
        senderName: 'Ada',
      },
    });
    await prisma.feedbackSurvey.create({
      data: {
        ...t,
        contactId: contact.id,
        contactName: 'Ada',
        contactEmail: SUBJECT,
        comment: 'Ada was unhappy',
      },
    });
    await prisma.notification.create({
      data: {
        ...t,
        recipientId: ADMIN,
        recipientEmail: SUBJECT,
        subject: 'Hello Ada',
        body: 'Ada, your appointment',
      },
    });
    await prisma.autoResponseDraft.create({
      data: {
        ...t,
        leadId: lead.id,
        recipientEmail: SUBJECT,
        subject: 'Re: hello',
        body: 'Dear Ada',
        aiConfidence: 0.9,
        modelVersion: 'm',
        triggerType: 'EMAIL_RECEIVED',
        expiresAt: new Date(Date.now() + HOUR),
      },
    });
    await prisma.contactReplyDraft.create({
      data: {
        ...t,
        contactId: contact.id,
        draftSubject: 'Re',
        draftBody: 'Dear Ada',
        confidence: 0.8,
        modelVersion: 'm',
      },
    });
    await prisma.calendarEvent.create({
      data: {
        ...t,
        contactId: contact.id,
        title: 'Meet Ada',
        description: 'About the custody hearing',
        location: 'Ada home',
        startTime: new Date(),
      },
    });
    Object.assign(seeded, {
      mail: mail.id,
      otherMail: otherMail.id,
      ticket: ticket.id,
      chat: chat.id,
    });
  }

  async function verifiedErasure(): Promise<string> {
    const record = await new PrismaDsarRepository(prisma).createStaff({
      tenantId: TENANT,
      type: 'ERASURE',
      subjectEmail: SUBJECT,
      capEmailHash: '6'.repeat(64),
      details: null,
      objectionScope: null,
      identityMethod: 'IN_PERSON_ID',
      identityNote: 'Passport checked at the front desk',
      receivedAt: new Date(),
      receivedOnReason: null,
      verifiedAt: new Date(),
      slaDeadline: new Date(Date.now() + 30 * 24 * HOUR),
      createdById: ADMIN,
    });
    return record.id;
  }

  it('previews the communications it erases and the stored files it leaves', async () => {
    const preview = await subjects.previewErasure(TENANT, SUBJECT);
    expect(preview.counts).toMatchObject({
      emailRecords: 1,
      tickets: 1,
      chats: 1,
      feedbackSurveys: 1,
      notifications: 1,
      autoResponseDrafts: 1,
      contactReplyDrafts: 1,
      calendarEvents: 1,
    });
    expect(preview.checklist).toMatchObject({
      storedEmailAttachments: 1,
      deals: 0,
      tasks: 0,
    });
  });

  it('erases them in the same transaction and leaves only stored files, deals and tasks', async () => {
    const result = await subjects.erase({
      tenantId: TENANT,
      requestId: await verifiedErasure(),
      subjectEmail: SUBJECT,
      resolvedById: ADMIN,
      note: 'No hold applies',
      now: new Date(),
      clockBreached: false,
    });
    expect(result.outcome).toBe('ERASED');
    if (result.outcome !== 'ERASED') return;
    expect(result.result.counts).toMatchObject({ emailRecords: 1, tickets: 1, chats: 1 });
    const remaining = Object.entries(result.result.checklist).filter(([, n]) => n > 0);
    expect(remaining).toEqual([['storedEmailAttachments', 1]]);
    await expect(
      prisma.ticketAttachment.findFirst({ where: { ticketId: seeded.ticket } })
    ).resolves.toMatchObject({ name: 'erased', url: null });

    const mail = await prisma.emailRecord.findUnique({ where: { id: seeded.mail } });
    expect(mail.subject).toBe('Erased email');
    expect(mail.body).not.toContain('Ada');
    // Only the person's address is replaced; the other recipient stays, in place.
    expect(mail.toEmail).toBe(`${OTHER},erased@erased.invalid`);
    expect(mail.fromEmail).toBe(OTHER);
    expect(mail.ccEmails).toBe(OTHER);
    const file = await prisma.emailAttachment.findFirst({ where: { emailId: seeded.mail } });
    expect(file).toMatchObject({ fileName: 'erased', fileUrl: `${RUN}/mail/1` });
    await expect(
      prisma.emailRecord.findUnique({ where: { id: seeded.otherMail } })
    ).resolves.toMatchObject({ subject: 'Grace only', body: 'Not about Ada' });

    const ticket = await prisma.ticket.findUnique({ where: { id: seeded.ticket } });
    expect(ticket).toMatchObject({ subject: 'Erased ticket', description: null });
    expect(ticket.contactEmail).not.toContain('ada');
    const activity = await prisma.ticketActivity.findMany({ where: { ticketId: seeded.ticket } });
    expect(activity.map((a: any) => a.content)).toEqual([
      '[erased under a data request]',
      '[erased under a data request]',
    ]);
    // The staff member's name stays; the person's goes.
    expect(activity.map((a: any) => a.authorName).sort()).toEqual(['Erased', 'Sam Staff']);

    const messages = await prisma.chatMessage.findMany({ where: { conversationId: seeded.chat } });
    expect(messages[0]).toMatchObject({ senderName: 'Erased' });
    const leftovers = JSON.stringify(
      await Promise.all([
        prisma.chatConversation.findMany({ where: { tenantId: TENANT } }),
        prisma.feedbackSurvey.findMany({ where: { tenantId: TENANT } }),
        prisma.notification.findMany({ where: { tenantId: TENANT } }),
        prisma.calendarEvent.findMany({ where: { tenantId: TENANT } }),
        prisma.chatMessage.findMany({ where: { tenantId: TENANT } }),
      ])
    );
    for (const text of ['Ada', 'custody', SUBJECT]) expect(leftovers).not.toContain(text);
    expect(await prisma.autoResponseDraft.count({ where: { tenantId: TENANT } })).toBe(0);
    expect(await prisma.contactReplyDraft.count({ where: { tenantId: TENANT } })).toBe(0);

    // Previewed again, nothing about the person is left to erase.
    const after = await subjects.previewErasure(TENANT, SUBJECT);
    expect(Object.values(after.counts).every((n) => n === 0)).toBe(true);
  });
});
