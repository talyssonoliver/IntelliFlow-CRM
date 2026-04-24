/**
 * IFC-312 — Contact router AI procedure integration tests.
 *
 * Covers: toggle-gating, cross-tenant isolation, and the critical ADR-037
 * "never auto-send" invariant for `draftReply`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { contactRouter } from '../contact.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

// Stub BullMQ — we don't need Redis for these tests.
const queueAddMock = vi.fn().mockResolvedValue({
  id: 'job-1',
  waitUntilFinished: vi.fn().mockResolvedValue({ suggestions: [], draftId: 'draft-new' }),
});
const queueCloseMock = vi.fn().mockResolvedValue(undefined);
const queueEventsCloseMock = vi.fn().mockResolvedValue(undefined);

class MockQueue {
  add = queueAddMock;
  close = queueCloseMock;
}
class MockQueueEvents {
  close = queueEventsCloseMock;
}

vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: MockQueue,
    QueueEvents: MockQueueEvents,
  })),
}));

describe('Contact Router AI Procedures (IFC-312)', () => {
  let caller: ReturnType<typeof contactRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createTestContext();
    caller = contactRouter.createCaller(ctx as any);
  });

  // ─────────────────────────────────────────────────────────────────────
  // suggestTags
  // ─────────────────────────────────────────────────────────────────────
  describe('suggestTags', () => {
    it('returns [] when aiTagSuggestions toggle is off', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiTagSuggestions: false,
      } as any);

      const out = await caller.suggestTags({ contactId: TEST_UUIDS.contact1 });
      expect(out).toEqual([]);
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    it('enqueues to AI_TAG_SUGGESTION queue when toggle on', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiTagSuggestions: true,
      } as any);
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        email: 'x@y.com',
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'VP',
        company: 'Acme',
        contactNotes: null,
      } as any);

      const out = await caller.suggestTags({ contactId: TEST_UUIDS.contact1 });
      expect(out).toEqual([]); // mock returned empty
      expect(queueAddMock).toHaveBeenCalledTimes(1);
      const [, jobData] = queueAddMock.mock.calls[0]!;
      expect(jobData.entityType).toBe('contact');
      expect(jobData.entityId).toBe(TEST_UUIDS.contact1);
      expect(jobData.tenantId).toBe(TEST_UUIDS.tenant);
    });

    it('returns [] (no throw) when BullMQ unavailable', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiTagSuggestions: true,
      } as any);
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        email: 'x@y.com',
        firstName: 'A',
        lastName: 'B',
        title: null,
        company: null,
        contactNotes: null,
      } as any);
      queueAddMock.mockRejectedValueOnce(new Error('Redis down'));

      const out = await caller.suggestTags({ contactId: TEST_UUIDS.contact1 });
      expect(out).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // generateInsight
  // ─────────────────────────────────────────────────────────────────────
  describe('generateInsight', () => {
    it('returns {enqueued: false} when aiInsightGeneration is off', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiInsightGeneration: false,
      } as any);
      const out = await caller.generateInsight({ contactId: TEST_UUIDS.contact1 });
      expect(out).toEqual({ enqueued: false });
      expect(queueAddMock).not.toHaveBeenCalled();
    });

    it('returns {enqueued: true} + enqueues AI_ENTITY_INSIGHT when toggle on', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiInsightGeneration: true,
      } as any);
      const out = await caller.generateInsight({ contactId: TEST_UUIDS.contact1 });
      expect(out).toEqual({ enqueued: true });
      expect(queueAddMock).toHaveBeenCalledTimes(1);
      const [, jobData] = queueAddMock.mock.calls[0]!;
      expect(jobData.entityType).toBe('contact');
      expect(jobData.entityId).toBe(TEST_UUIDS.contact1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // draftReply (ADR-037 compliance)
  // ─────────────────────────────────────────────────────────────────────
  describe('draftReply', () => {
    const fakeThread = [
      {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Re: Quick question',
        body: 'Hi, I wanted to follow up on the proposal we discussed last week.',
        at: '2026-04-24T10:00:00.000Z',
      },
    ];

    it('throws FORBIDDEN when aiAutoReplyDrafting is off', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiAutoReplyDrafting: false,
      } as any);
      await expect(
        caller.draftReply({ contactId: TEST_UUIDS.contact1, emailThread: fakeThread })
      ).rejects.toThrow(TRPCError);
    });

    it('throws PRECONDITION_FAILED when emailThread missing (IFC-312 audit F5)', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiAutoReplyDrafting: true,
      } as any);
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        email: 'x@y.com',
        firstName: 'A',
        lastName: 'B',
      } as any);
      await expect(caller.draftReply({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow(
        TRPCError
      );
      const enqCalls = queueAddMock.mock.calls.filter(([name]) => name === 'draft');
      expect(enqCalls).toHaveLength(0);
    });

    it('enqueues reply-draft job when toggle is on + real thread supplied', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiAutoReplyDrafting: true,
      } as any);
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        email: 'x@y.com',
        firstName: 'A',
        lastName: 'B',
      } as any);
      queueAddMock.mockResolvedValueOnce({
        id: 'job-1',
        waitUntilFinished: vi.fn().mockResolvedValue({ draftId: 'draft-123' }),
      });
      await caller
        .draftReply({ contactId: TEST_UUIDS.contact1, emailThread: fakeThread })
        .catch(() => undefined);
      expect(queueAddMock).toHaveBeenCalled();
      const [, jobData] = queueAddMock.mock.calls[queueAddMock.mock.calls.length - 1]!;
      expect(jobData.contactId).toBe(TEST_UUIDS.contact1);
      expect(jobData.tenantId).toBe(TEST_UUIDS.tenant);
      expect(Array.isArray(jobData.emailThread)).toBe(true);
      expect(jobData.emailThread[0].body).not.toMatch(/placeholder/i);
    });

    it('throws NOT_FOUND when contact absent (cross-tenant safety)', async () => {
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        aiAutoReplyDrafting: true,
      } as any);
      prismaMock.contact.findUnique.mockResolvedValue(null);
      await expect(
        caller.draftReply({ contactId: TEST_UUIDS.contact1, emailThread: fakeThread })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // listReplyDrafts
  // ─────────────────────────────────────────────────────────────────────
  describe('listReplyDrafts', () => {
    it('returns drafts mapped to the output schema', async () => {
      prismaMock.contactReplyDraft.findMany.mockResolvedValue([
        {
          id: 'draft-1',
          contactId: TEST_UUIDS.contact1,
          draftSubject: 'Re: Hi',
          draftBody: 'Body',
          tone: 'friendly',
          status: 'DRAFT',
          confidence: 0.8,
          modelVersion: 'v1',
          createdAt: new Date('2026-04-20'),
        },
      ] as any);
      const out = await caller.listReplyDrafts({ contactId: TEST_UUIDS.contact1, limit: 5 });
      expect(out.drafts).toHaveLength(1);
      expect(out.drafts[0]!.status).toBe('DRAFT');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // IFC-312 audit fix — create/update enqueue AI_ENRICHMENT (F1)
  // ─────────────────────────────────────────────────────────────────────
  describe('create — AI_ENRICHMENT enqueue (IFC-312 audit F1)', () => {
    function makeAuthedCallerWithFlag(aiEnrichment: boolean) {
      const ctx = createTestContext();
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        autoMergeOnExactEmail: false,
        notifyOnDuplicate: false,
        restrictTagCreationToAdmins: false,
        normalizePhoneNumbers: false,
        autoCapitalizeNames: false,
        preventDeleteWithOpenDeals: false,
        notifyOnOwnerChange: false,
        aiDuplicateDetection: false,
        aiEnrichment,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
        aiAutoReplyDrafting: false,
      } as any);
      prismaMock.contactRequiredField.findMany.mockResolvedValue([] as any);
      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          id: { value: TEST_UUIDS.contact1 },
          email: { value: 'a@b.com' },
          firstName: 'A',
          lastName: 'B',
          title: null,
          phone: null,
          department: null,
          status: 'ACTIVE',
          accountId: null,
          leadId: null,
          ownerId: TEST_UUIDS.user1,
          tenantId: TEST_UUIDS.tenant,
          hasAccount: false,
          isConvertedFromLead: false,
          lastContactedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          getDomainEvents: () => [],
          clearDomainEvents: () => {},
        },
      });
      return contactRouter.createCaller(ctx as any);
    }

    it('enqueues AI_ENRICHMENT with entityType=contact when aiEnrichment=true', async () => {
      const localCaller = makeAuthedCallerWithFlag(true);
      await localCaller.create({ email: 'a@b.com', firstName: 'A', lastName: 'B' });
      const enrichCalls = queueAddMock.mock.calls.filter(([name]) => name === 'enrich');
      expect(enrichCalls).toHaveLength(1);
      const [, jobData] = enrichCalls[0]!;
      expect(jobData.entityType).toBe('contact');
      expect(jobData.entityId).toBe(TEST_UUIDS.contact1);
      expect(jobData.tenantId).toBe(TEST_UUIDS.tenant);
    });

    it('does NOT enqueue AI_ENRICHMENT when aiEnrichment=false', async () => {
      const localCaller = makeAuthedCallerWithFlag(false);
      await localCaller.create({ email: 'a@b.com', firstName: 'A', lastName: 'B' });
      const enrichCalls = queueAddMock.mock.calls.filter(([name]) => name === 'enrich');
      expect(enrichCalls).toHaveLength(0);
    });
  });

  describe('update — AI_ENRICHMENT enqueue (IFC-312 audit F1)', () => {
    function makeAuthedCallerWithFlag(aiEnrichment: boolean) {
      const ctx = createTestContext();
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue({
        autoMergeOnExactEmail: false,
        notifyOnDuplicate: false,
        restrictTagCreationToAdmins: false,
        normalizePhoneNumbers: false,
        autoCapitalizeNames: false,
        preventDeleteWithOpenDeals: false,
        notifyOnOwnerChange: false,
        aiDuplicateDetection: false,
        aiEnrichment,
        aiTagSuggestions: false,
        aiInsightGeneration: false,
        aiAutoReplyDrafting: false,
      } as any);
      prismaMock.contactRequiredField.findMany.mockResolvedValue([] as any);
      const fakeDomainContact = {
        id: { value: TEST_UUIDS.contact1 },
        email: { value: 'a@b.com' },
        firstName: 'A',
        lastName: 'B',
        title: null,
        phone: null,
        department: null,
        status: 'ACTIVE',
        accountId: null,
        leadId: null,
        ownerId: TEST_UUIDS.user1,
        tenantId: TEST_UUIDS.tenant,
        hasAccount: false,
        isConvertedFromLead: false,
        lastContactedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        getDomainEvents: () => [],
        clearDomainEvents: () => {},
      };
      ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: fakeDomainContact,
      });
      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: fakeDomainContact,
      });
      return contactRouter.createCaller(ctx as any);
    }

    it('enqueues AI_ENRICHMENT on update when aiEnrichment=true', async () => {
      const localCaller = makeAuthedCallerWithFlag(true);
      await localCaller.update({ id: TEST_UUIDS.contact1, firstName: 'Alice' });
      const enrichCalls = queueAddMock.mock.calls.filter(([name]) => name === 'enrich');
      expect(enrichCalls).toHaveLength(1);
      const [, jobData] = enrichCalls[0]!;
      expect(jobData.entityType).toBe('contact');
      expect(jobData.entityId).toBe(TEST_UUIDS.contact1);
    });

    it('does NOT enqueue AI_ENRICHMENT on update when flag=false', async () => {
      const localCaller = makeAuthedCallerWithFlag(false);
      await localCaller.update({ id: TEST_UUIDS.contact1, firstName: 'Alice' });
      const enrichCalls = queueAddMock.mock.calls.filter(([name]) => name === 'enrich');
      expect(enrichCalls).toHaveLength(0);
    });
  });
});
