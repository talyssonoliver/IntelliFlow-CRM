/**
 * IFC-316 — an approved erasure also erases the person's communications, real-Database test.
 *
 * Seeds one person with mail (as one of several recipients), a ticket with its activity and an
 * attachment, a chat, feedback, a notification, drafts and a calendar event, and another person
 * in the same firm. After the erasure, the person's text, name and address are gone from every
 * row, other people's addresses and rows are untouched, and the stored files (lead files, email,
 * chat and ticket attachments) are queued in the same transaction, deleted from storage after it
 * commits, with a failure recorded on the request until a retry deletes it.
 *
 * Skips cleanly (with a visible reason) when DATABASE_URL is not set.
 */

import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../packages/db/generated/prisma/client';
import { PrismaDsarRepository } from '../../packages/adapters/src/repositories/PrismaDsarRepository';
import { PrismaSubjectDataRepository } from '../../packages/adapters/src/repositories/PrismaSubjectDataRepository';
import { PrismaStoredObjectRepository } from '../../packages/adapters/src/repositories/PrismaStoredObjectRepository';
import { SupabaseStorageAdapter } from '../../packages/adapters/src/storage/SupabaseStorageAdapter';
import { MANUAL_FILES_PAGE } from '../../packages/domain/src/legal/privacy/stored-object';
import { dsarConfirmManualFilesSchema } from '../../packages/validators/src/dsar';
import { ErasedFilesCleanupService } from '../../packages/application/src/services/ErasedFilesCleanupService';
import type { StoredObjectDeletionPort } from '../../packages/application/src/ports/external/StorageServicePort';
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
/** Where this test's stored files live: a tenant path, or a URL the CRM cannot delete. */
const STORAGE = {
  storageHost: 'abc.supabase.example.invalid',
  emailBucket: 'email-attachments',
  filesBucket: 'crm-files',
};
const FOREIGN = 'https://files.example.invalid/ada-id.pdf';
const SHARED = `${TENANT}/mail/shared-terms.pdf`;

describeDb('IFC-316 erasure of communications (real DB)', () => {
  let prisma: any;
  let dbReady = false;
  let subjects: PrismaSubjectDataRepository;
  let requestId = '';
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
    subjects = new PrismaSubjectDataRepository(prisma, () => STORAGE);
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
        fileUrl: `${TENANT}/mail/1-ada-passport.pdf`,
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
    // One upload attached to both Ada's mail and Grace's: erasing Ada must not delete it.
    await prisma.emailAttachment.createMany({
      data: [
        {
          ...t,
          emailId: mail.id,
          fileName: 'terms.pdf',
          fileSize: 5,
          fileType: 'application/pdf',
          fileUrl: SHARED,
        },
        {
          ...t,
          emailId: otherMail.id,
          fileName: 'terms.pdf',
          fileSize: 5,
          fileType: 'application/pdf',
          fileUrl: SHARED,
        },
      ],
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
        // Any case: the role is free text.
        authorRole: 'customer',
        authorAvatar: 'https://avatars.example.invalid/ada.png',
      },
    });
    // No role, but the ticket's contact by name: still the person's entry.
    await prisma.ticketActivity.create({
      data: {
        ...t,
        ticketId: ticket.id,
        type: 'CUSTOMER_MESSAGE',
        content: 'Ada again',
        authorName: 'Ada Lovelace',
        authorAvatar: 'https://avatars.example.invalid/ada.png',
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
        authorAvatar: 'https://avatars.example.invalid/sam.png',
      },
    });
    // An inline data: URL (what the ticket API stores): no object behind it.
    await prisma.ticketAttachment.create({
      data: {
        ...t,
        ticketId: ticket.id,
        name: 'ada-id.png',
        size: '1 KB',
        url: 'data:image/png;base64,AAAA...',
      },
    });
    await prisma.ticketAttachment.create({
      data: {
        ...t,
        ticketId: ticket.id,
        name: 'ada-scan.pdf',
        size: '1 KB',
        url: `${TENANT}/tickets/ada-scan.pdf`,
      },
    });
    // Lead files: one in the CRM's bucket, one on a host the CRM cannot delete from, one under
    // ANOTHER tenant's prefix (never deleted: it stays for the admin).
    await prisma.leadFile.createMany({
      data: [
        {
          ...t,
          leadId: lead.id,
          name: 'ada-cv.pdf',
          size: '2 KB',
          url: `${TENANT}/leads/ada-cv.pdf`,
        },
        { ...t, leadId: lead.id, name: 'ada-id.pdf', size: '2 KB', url: FOREIGN },
        { ...t, leadId: lead.id, name: 'x.pdf', size: '2 KB', url: `${RUN}_b/leads/other.pdf` },
      ],
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
        attachments: [{ name: 'ada-photo.png', url: `${TENANT}/chat/ada-photo.png` }],
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
    // Aurora also drafts replies to a lead with no contact (MVP-012).
    await prisma.contactReplyDraft.create({
      data: {
        ...t,
        leadId: lead.id,
        draftSubject: 'Re lead',
        draftBody: 'Dear Ada, a lead reply',
        confidence: 0.8,
        modelVersion: 'm',
      },
    });
    // A bounce report names the recipient by address (mail look-back and bounce reader).
    const mailbox = await prisma.emailMailbox.create({
      data: { ...t, scope: 'TENANT', kind: 'SMTP', status: 'DISCONNECTED', fromAddress: OTHER },
    });
    await prisma.emailBounceReceipt.create({
      data: {
        ...t,
        mailboxId: mailbox.id,
        dsnKey: `${RUN}-dsn`,
        recipient: SUBJECT,
        kind: 'HARD',
        statusCode: '5.1.1',
        diagnostic: 'mailbox unavailable',
        matchConfidence: 'HIGH',
        receivedAt: new Date(),
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
      contactReplyDrafts: 2,
      calendarEvents: 1,
    });
    // Deleted from storage after the erasure: the lead file, the email attachment, the ticket
    // attachment and the chat attachment. Only the files the CRM cannot delete stay by hand.
    expect(preview.counts.storedFilesDeleted).toBe(4);
    expect(preview.checklist).toEqual({
      deals: 0,
      tasks: 0,
      storedLeadFiles: 2,
      // The upload another person's mail still uses is the admin's to decide.
      storedEmailAttachments: 1,
      storedChatAttachments: 0,
      storedTicketAttachments: 0,
    });
  });

  it('erases them in the same transaction and queues the stored files', async () => {
    requestId = await verifiedErasure();
    const result = await subjects.erase({
      tenantId: TENANT,
      requestId,
      subjectEmail: SUBJECT,
      resolvedById: ADMIN,
      note: 'No hold applies',
      now: new Date(),
      clockBreached: false,
    });
    expect(result.outcome).toBe('ERASED');
    if (result.outcome !== 'ERASED') return;
    expect(result.result.counts).toMatchObject({ emailRecords: 1, tickets: 1, chats: 1 });
    // Until the cleanup has run every queued object still counts as left, per source.
    expect(result.result.checklist).toEqual({
      deals: 0,
      tasks: 0,
      storedLeadFiles: 3,
      storedEmailAttachments: 2,
      storedChatAttachments: 1,
      storedTicketAttachments: 1,
    });
    // The queue committed with the erasure: the locators moved there from the rows.
    const queued = await prisma.dsarStoredObject.findMany({
      where: { tenantId: TENANT, requestId },
    });
    // Sorted here: the database's collation orders URLs and paths its own way.
    const byKey = (row: unknown[]) => JSON.stringify(row);
    expect(
      queued
        .map((q: any) => [q.source, q.state, q.bucket, q.locator])
        .sort((x: unknown[], y: unknown[]) => byKey(x).localeCompare(byKey(y)))
    ).toEqual(
      [
        ['CHAT_ATTACHMENT', 'PENDING', 'crm-files', `${TENANT}/chat/ada-photo.png`],
        ['EMAIL_ATTACHMENT', 'PENDING', 'email-attachments', `${TENANT}/mail/1-ada-passport.pdf`],
        ['EMAIL_ATTACHMENT', 'MANUAL', null, SHARED],
        ['LEAD_FILE', 'PENDING', 'crm-files', `${TENANT}/leads/ada-cv.pdf`],
        ['LEAD_FILE', 'MANUAL', null, FOREIGN],
        ['LEAD_FILE', 'MANUAL', null, `${RUN}_b/leads/other.pdf`],
        ['TICKET_ATTACHMENT', 'PENDING', 'crm-files', `${TENANT}/tickets/ada-scan.pdf`],
      ].sort((x, y) => byKey(x).localeCompare(byKey(y)))
    );
    const rowsWithLocator = await Promise.all([
      prisma.leadFile.count({ where: { tenantId: TENANT, url: { not: null } } }),
      prisma.emailAttachment.count({
        where: { tenantId: TENANT, emailId: seeded.mail, fileUrl: { not: '' } },
      }),
      prisma.ticketAttachment.count({ where: { tenantId: TENANT, url: { not: null } } }),
      prisma.chatMessage.count({ where: { tenantId: TENANT, attachments: { not: null } } }),
    ]);
    expect(rowsWithLocator).toEqual([0, 0, 0, 0]);
    await expect(
      prisma.ticketAttachment.findMany({ where: { ticketId: seeded.ticket } })
    ).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'erased' })]));

    const mail = await prisma.emailRecord.findUnique({ where: { id: seeded.mail } });
    expect(mail.subject).toBe('Erased email');
    expect(mail.body).not.toContain('Ada');
    // Only the person's address is replaced; the other recipient stays, in place.
    expect(mail.toEmail).toBe(`${OTHER},erased@erased.invalid`);
    expect(mail.fromEmail).toBe(OTHER);
    expect(mail.ccEmails).toBe(OTHER);
    const file = await prisma.emailAttachment.findFirst({ where: { emailId: seeded.mail } });
    expect(file).toMatchObject({ fileName: 'erased', fileUrl: '' });
    await expect(
      prisma.emailRecord.findUnique({ where: { id: seeded.otherMail } })
    ).resolves.toMatchObject({ subject: 'Grace only', body: 'Not about Ada' });

    const ticket = await prisma.ticket.findUnique({ where: { id: seeded.ticket } });
    expect(ticket).toMatchObject({ subject: 'Erased ticket', description: null });
    expect(ticket.contactEmail).not.toContain('ada');
    const activity = await prisma.ticketActivity.findMany({ where: { ticketId: seeded.ticket } });
    expect(new Set(activity.map((a: any) => a.content))).toEqual(
      new Set(['[erased under a data request]'])
    );
    // The staff member's name and photo stay; the person's go, whatever the role says.
    expect(activity.map((a: any) => [a.authorName, a.authorAvatar]).sort()).toEqual([
      ['Erased', null],
      ['Erased', null],
      ['Sam Staff', 'https://avatars.example.invalid/sam.png'],
    ]);

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
    const bounce = await prisma.emailBounceReceipt.findMany({ where: { tenantId: TENANT } });
    expect(bounce).toHaveLength(1);
    expect(bounce[0].diagnostic).toBeNull();
    expect(bounce[0].recipient).not.toContain('ada');

    // Previewed again, nothing about the person is left to erase.
    const after = await subjects.previewErasure(TENANT, SUBJECT);
    expect(Object.values(after.counts).every((n) => n === 0)).toBe(true);
  });

  describe('after the erasure commits: deleting the stored objects', () => {
    const outbox = () => new PrismaStoredObjectRepository(prisma);

    /** Storage that records every path it is asked to delete; `failPath` fails that one. */
    function storage(failPath: () => string | null) {
      const calls: string[][] = [];
      const port: StoredObjectDeletionPort = {
        async deleteStoredObjects(_tenant, objects) {
          calls.push(objects.map((o) => o.path));
          const bad = failPath();
          return {
            failed: objects
              .filter((o) => o.path === bad)
              .map((o) => ({ id: o.id, code: 'STORAGE_ERROR' as const })),
          };
        },
      };
      return { port, calls };
    }

    const states = async () =>
      (
        await prisma.dsarStoredObject.findMany({
          where: { tenantId: TENANT, requestId },
          orderBy: [{ source: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        })
      ).map((q: any) => ({
        source: q.source,
        state: q.state,
        attempts: q.attempts,
        error: q.lastError,
        locator: q.locator,
      }));

    it('records a failed delete on the request and keeps the object queued with its locator', async () => {
      let bad: string | null = `${TENANT}/mail/1-ada-passport.pdf`;
      const { port, calls } = storage(() => bad);
      const cleanup = new ErasedFilesCleanupService(outbox(), port, {
        attempts: 2,
        sleep: async () => undefined,
      });
      const first = await cleanup.purge(TENANT, requestId, new Date());
      // Only this tenant's objects went to storage; the other tenant's path and the foreign URL
      // are manual and were never sent.
      const sent = calls.flat();
      expect(sent.every((path) => path.startsWith(`${TENANT}/`))).toBe(true);
      expect(sent).not.toContain(FOREIGN);
      expect(sent).not.toContain(`${RUN}_b/leads/other.pdf`);
      // The upload another person's mail still uses was never sent to storage either.
      expect(sent).not.toContain(SHARED);
      expect(first.deleted).toBe(3);
      // What remains is exactly what the checklist shows: the failed attachment and the two
      // files only the admin can delete.
      expect(first.remaining).toEqual({ storedEmailAttachments: 2, storedLeadFiles: 2 });
      const failed = (await states()).find(
        (s: any) => s.source === 'EMAIL_ATTACHMENT' && s.state === 'PENDING'
      );
      expect(failed).toMatchObject({
        state: 'PENDING',
        attempts: 2,
        error: 'STORAGE_ERROR',
        locator: `${TENANT}/mail/1-ada-passport.pdf`,
      });

      // The admin's list shows the request with what is left.
      expect(await outbox().leftFor(TENANT, [requestId])).toEqual({
        [requestId]: { queued: 1, manual: 3 },
      });

      // Storage recovers: a retry deletes only what was still queued.
      bad = null;
      calls.length = 0;
      const retried = await cleanup.purge(TENANT, requestId, new Date());
      expect(calls).toEqual([[`${TENANT}/mail/1-ada-passport.pdf`]]);
      expect(retried).toEqual({
        deleted: 1,
        remaining: { storedLeadFiles: 2, storedEmailAttachments: 1 },
      });
      const done = await states();
      expect(
        done.filter((s: any) => s.state === 'DELETED').every((s: any) => s.locator === null)
      ).toBe(true);
      expect(done.filter((s: any) => s.state === 'DELETED')).toHaveLength(4);

      // Running it again is safe: nothing is pending, nothing is sent.
      calls.length = 0;
      expect(await cleanup.purge(TENANT, requestId, new Date())).toEqual({
        deleted: 0,
        remaining: { storedLeadFiles: 2, storedEmailAttachments: 1 },
      });
      expect(calls).toEqual([]);
      // Grace's mail still has its attachment, untouched.
      await expect(
        prisma.emailAttachment.findFirst({ where: { emailId: seeded.otherMail } })
      ).resolves.toMatchObject({ fileUrl: SHARED, fileName: 'terms.pdf' });
    });

    it('never reads or settles another tenant’s queue', async () => {
      expect(await outbox().pending(`${TENANT}_x`, requestId, 10)).toEqual([]);
      expect(await outbox().remaining(`${TENANT}_x`, requestId)).toEqual({});
      await outbox().settle(`${TENANT}_x`, requestId, [{ id: 'nope', deleted: true }], new Date());
      expect(await outbox().leftFor(`${TENANT}_x`, [requestId])).toEqual({});
      expect(await outbox().manual(`${TENANT}_x`, requestId)).toEqual([]);
      expect(await outbox().markHandled(`${TENANT}_x`, requestId, ['nope'], new Date())).toBe(0);
    });

    it('makes no claim for a request that never queued a file', async () => {
      expect(await outbox().leftFor(TENANT, ['a-request-from-before-the-queue'])).toEqual({});
    });

    it('the real storage adapter refuses an object outside the tenant, even if the queue holds one', async () => {
      const remove = vi.fn(async () => ({ data: [], error: null }));
      const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
      (adapter as any).client = { storage: { from: () => ({ remove }) } };
      await prisma.dsarStoredObject.create({
        data: {
          tenantId: TENANT,
          requestId,
          source: 'LEAD_FILE',
          state: 'PENDING',
          bucket: 'crm-files',
          locator: `${RUN}_b/leads/other.pdf`,
        },
      });
      const result = await new ErasedFilesCleanupService(outbox(), adapter, {
        sleep: async () => undefined,
      }).purge(TENANT, requestId, new Date());
      expect(remove).not.toHaveBeenCalled();
      // Still queued (the adapter refused it), next to the manual files.
      expect(result.remaining).toEqual({ storedLeadFiles: 3, storedEmailAttachments: 1 });
    });

    it('lists the files left for the admin and stops counting them once the admin confirms', async () => {
      const manual = await outbox().manual(TENANT, requestId);
      expect(manual.map((m) => [m.source, m.locator]).sort()).toEqual(
        [
          ['EMAIL_ATTACHMENT', SHARED],
          ['LEAD_FILE', FOREIGN],
          ['LEAD_FILE', `${RUN}_b/leads/other.pdf`],
        ].sort()
      );
      expect(await outbox().leftFor(TENANT, [requestId])).toEqual({
        [requestId]: { queued: 1, manual: 3 },
      });
      // Confirming only changes manual files: the queued object stays queued.
      const queuedRow = await prisma.dsarStoredObject.findFirst({
        where: { tenantId: TENANT, requestId, state: 'PENDING' },
      });
      const handled = await outbox().markHandled(
        TENANT,
        requestId,
        [...manual.map((m) => m.id), queuedRow.id],
        new Date()
      );
      expect(handled).toBe(3);
      expect(await outbox().leftFor(TENANT, [requestId])).toEqual({
        [requestId]: { queued: 1, manual: 0 },
      });
      // Confirmed files lose their locator.
      const rows = await prisma.dsarStoredObject.findMany({
        where: { id: { in: manual.map((m) => m.id) } },
      });
      expect(rows.every((r: any) => r.state === 'DELETED' && r.locator === null)).toBe(true);
    });

    it('lists the manual files a page at a time, each page confirmable in one call', async () => {
      await prisma.dsarStoredObject.createMany({
        data: Array.from({ length: 501 }, (_, i) => ({
          tenantId: TENANT,
          requestId,
          source: 'LEAD_FILE',
          state: 'MANUAL',
          locator: `https://files.example.invalid/bulk-${i}.pdf`,
        })),
      });
      const first = await outbox().manual(TENANT, requestId);
      // Never more than a confirmation takes (the schema's own limit).
      expect(first).toHaveLength(MANUAL_FILES_PAGE);
      expect(
        dsarConfirmManualFilesSchema.safeParse({ id: requestId, fileIds: first.map((f) => f.id) })
          .success
      ).toBe(true);
      expect(
        await outbox().markHandled(
          TENANT,
          requestId,
          first.map((f) => f.id),
          new Date()
        )
      ).toBe(MANUAL_FILES_PAGE);
      // The next page follows.
      expect(await outbox().manual(TENANT, requestId)).toHaveLength(1);
      expect((await outbox().leftFor(TENANT, [requestId]))[requestId]).toEqual({
        queued: 1,
        manual: 1,
      });
    });
  });
});
