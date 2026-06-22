/**
 * Contact Router Audit Logging Tests (IFC-255)
 *
 * Verifies that an audit-trail entry is fired for every instrumented contact
 * procedure: 14 single-entity mutations/reads and 4 bulk operations.
 *
 * Audit calls are fire-and-forget (`getAuditLogger(ctx.prisma).logAction(...)`
 * / `.logBulkOperation(...)` with `.catch(logContactAuditFailure)`), so each
 * test flushes the microtask queue with `setImmediate` before asserting the
 * mock was called with the expected action, `'contact'` resourceType,
 * resourceId(s), tenantId and actorId. A resilience block proves a rejected
 * audit write never changes a procedure's return value (AC-4).
 *
 * The collection/query/AI-infra procedures (getByEmail, list, stats, search,
 * filterOptions, getTimeline, suggestTags, generateInsight, draftReply,
 * listReplyDrafts) are excluded by design — mirror of IFC-240.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_UUIDS, createTestContext, prismaMock, mockContact } from '../../../test/setup';

// ─── Audit logger mock ─────────────────────────────────────────────────────
// setup.ts runs vi.clearAllMocks() in its (earlier-registered) beforeEach, so
// the spies are re-wired in this file's beforeEach via the factory return.
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));

// ─── Reassign helpers mock (for reassign / bulkReassign tests) ─────────────
vi.mock('../contact-reassign', () => ({
  performContactReassign: vi.fn(),
  emitContactReassignSideEffects: vi.fn(),
  logContactReassignPermissionDenied: vi.fn(),
}));

import { contactRouter } from '../contact.router';
import { getAuditLogger } from '../../../security/audit-logger';
import { performContactReassign, emitContactReassignSideEffects } from '../contact-reassign';

const flush = () => new Promise((r) => setImmediate(r));

const success = <T>(value: T) => ({ isSuccess: true, isFailure: false, value });

const makeDomainContact = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.contact1 },
  email: 'audit@example.com',
  firstName: 'Audit',
  lastName: 'Contact',
  company: 'AuditCo',
  title: null,
  phone: undefined,
  status: 'ACTIVE',
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  accountId: null,
  leadId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('Contact Router — Audit Logging (IFC-255)', () => {
  let mockLogAction: ReturnType<typeof vi.fn>;
  let mockLogBulkOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogAction = vi.fn().mockResolvedValue('audit-id');
    mockLogBulkOperation = vi.fn().mockResolvedValue('audit-id');
    vi.mocked(getAuditLogger).mockReturnValue({
      logAction: mockLogAction,
      logBulkOperation: mockLogBulkOperation,
      logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
    } as any);
  });

  // ── Single-entity mutations ───────────────────────────────────────────────

  it('create logs a CREATE action', async () => {
    const ctx = createTestContext();
    ctx.services!.contact!.createContact = vi.fn().mockResolvedValue(success(makeDomainContact()));

    // loadContactAutomation + loadRequiredContactFields stubs
    prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);

    await contactRouter.createCaller(ctx).create({
      email: 'audit@example.com',
      firstName: 'Audit',
      lastName: 'Contact',
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'CREATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        dataClassification: 'CONFIDENTIAL',
      })
    );
  });

  it('getById logs a READ access action', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findFirst.mockResolvedValue({
      ...mockContact,
      id: TEST_UUIDS.contact1,
      tenantId: TEST_UUIDS.tenant,
      aiInsight: { id: 'ai-1' },
      activities: [],
      notes: [],
      opportunities: [],
      tasks: [],
      calendarEvents: [],
      lead: null,
      owner: null,
      account: null,
    } as any);
    prismaMock.caseDocument.findMany.mockResolvedValue([]);
    prismaMock.caseDocument.count.mockResolvedValue(0);

    await contactRouter.createCaller(ctx).getById({ id: TEST_UUIDS.contact1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'READ',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactRead',
        dataClassification: 'CONFIDENTIAL',
      })
    );
  });

  it('update logs an UPDATE action with a before/after diff over the changed fields', async () => {
    const ctx = createTestContext();
    // Pre-read snapshot drives beforeState
    prismaMock.contact.findFirst.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      firstName: 'Old',
      lastName: 'Name',
    } as any);
    prismaMock.contact.findUnique.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      firstName: 'Old',
      lastName: 'Name',
    } as any);
    prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);
    ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue(success(undefined));
    ctx.services!.contact!.getContactById = vi
      .fn()
      .mockResolvedValue(success(makeDomainContact({ firstName: 'Edited' })));

    await contactRouter.createCaller(ctx).update({
      id: TEST_UUIDS.contact1,
      firstName: 'Edited',
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        dataClassification: 'CONFIDENTIAL',
        beforeState: expect.objectContaining({ firstName: 'Old' }),
        afterState: expect.objectContaining({ firstName: 'Edited' }),
      })
    );
  });

  it('updateEmail logs a ContactEmailUpdated action (standard path)', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findFirst.mockResolvedValue({ id: TEST_UUIDS.contact1 } as any);
    prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);
    ctx.services!.contact!.updateContactEmail = vi
      .fn()
      .mockResolvedValue(success(makeDomainContact({ email: 'new@example.com' })));

    await contactRouter.createCaller(ctx).updateEmail({
      id: TEST_UUIDS.contact1,
      email: 'new@example.com',
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactEmailUpdated',
        dataClassification: 'CONFIDENTIAL',
        afterState: expect.objectContaining({ email: 'new@example.com' }),
      })
    );
  });

  it('delete logs a DELETE action with a before snapshot (GDPR erasure)', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findUnique.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      email: 'erased@example.com',
      status: 'ACTIVE',
      company: 'GoneCo',
      ownerId: TEST_UUIDS.user1,
      _count: { opportunities: 0 },
    } as any);
    prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);
    ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue(success(undefined));

    await contactRouter.createCaller(ctx).delete({ id: TEST_UUIDS.contact1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'DELETE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        dataClassification: 'CONFIDENTIAL',
        beforeState: expect.objectContaining({
          email: 'erased@example.com',
          company: 'GoneCo',
        }),
      })
    );
  });

  it('linkToAccount logs a ContactLinkedToAccount action', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findFirst.mockResolvedValue({ id: TEST_UUIDS.contact1 } as any);
    ctx.services!.contact!.associateWithAccount = vi
      .fn()
      .mockResolvedValue(success(makeDomainContact({ accountId: TEST_UUIDS.account1 })));

    await contactRouter.createCaller(ctx).linkToAccount({
      contactId: TEST_UUIDS.contact1,
      accountId: TEST_UUIDS.account1,
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactLinkedToAccount',
        dataClassification: 'CONFIDENTIAL',
        afterState: expect.objectContaining({ accountId: TEST_UUIDS.account1 }),
      })
    );
  });

  it('unlinkFromAccount logs a ContactUnlinkedFromAccount action', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findFirst.mockResolvedValue({ id: TEST_UUIDS.contact1 } as any);
    ctx.services!.contact!.disassociateFromAccount = vi
      .fn()
      .mockResolvedValue(success(makeDomainContact({ accountId: null })));

    await contactRouter.createCaller(ctx).unlinkFromAccount({ contactId: TEST_UUIDS.contact1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactUnlinkedFromAccount',
        dataClassification: 'CONFIDENTIAL',
        afterState: expect.objectContaining({ accountId: null }),
      })
    );
  });

  it('linkToLead logs a ContactLinkedToLead action', async () => {
    const ctx = createTestContext();
    ctx.services!.contact!.linkToLead = vi
      .fn()
      .mockResolvedValue(success(makeDomainContact({ leadId: TEST_UUIDS.lead1 })));

    await contactRouter.createCaller(ctx).linkToLead({
      contactId: TEST_UUIDS.contact1,
      leadId: TEST_UUIDS.lead1,
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactLinkedToLead',
        dataClassification: 'CONFIDENTIAL',
        afterState: expect.objectContaining({ leadId: TEST_UUIDS.lead1 }),
      })
    );
  });

  it('unlinkFromLead logs a ContactUnlinkedFromLead action', async () => {
    const ctx = createTestContext();
    ctx.services!.contact!.unlinkFromLead = vi
      .fn()
      .mockResolvedValue(success(makeDomainContact({ leadId: null })));

    await contactRouter.createCaller(ctx).unlinkFromLead({ contactId: TEST_UUIDS.contact1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactUnlinkedFromLead',
        dataClassification: 'CONFIDENTIAL',
        afterState: expect.objectContaining({ leadId: null }),
      })
    );
  });

  it('logActivity logs a ContactActivityLogged action', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findUnique.mockResolvedValue({ id: TEST_UUIDS.contact1 } as any);
    (prismaMock as any).$transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          contactActivity: { create: vi.fn().mockResolvedValue({}) },
          contact: { update: vi.fn().mockResolvedValue(mockContact) },
        })
      );
    ctx.services!.contact!.recordInteraction = vi.fn().mockResolvedValue(undefined);

    await contactRouter.createCaller(ctx).logActivity({
      contactId: TEST_UUIDS.contact1,
      type: 'CALL',
      title: 'Follow-up call',
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactActivityLogged',
        dataClassification: 'CONFIDENTIAL',
        metadata: expect.objectContaining({ activityType: 'CALL' }),
      })
    );
  });

  it('addNote logs a ContactNoteAdded action', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findUnique.mockResolvedValue({ id: TEST_UUIDS.contact1 } as any);
    prismaMock.contactNote.create.mockResolvedValue({ id: 'note-1' } as any);

    await contactRouter.createCaller(ctx).addNote({
      contactId: TEST_UUIDS.contact1,
      content: 'A note about this contact',
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactNoteAdded',
        dataClassification: 'CONFIDENTIAL',
        metadata: expect.objectContaining({ operation: 'add_note' }),
      })
    );
  });

  it('scoreWithAI logs an AI_SCORE diff over the prior ContactAIInsight engagementScore (INTERNAL)', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findUnique.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      lastContactedAt: null,
      createdAt: new Date(),
      title: 'CTO',
      department: 'Engineering',
      status: 'ACTIVE',
      lead: { score: 50 },
      opportunities: [],
    } as any);
    // Prior insight drives beforeState (the field scoreWithAI overwrites).
    prismaMock.contactAIInsight.findUnique.mockResolvedValue({ engagementScore: 42 } as any);
    prismaMock.contactAIInsight.upsert.mockResolvedValue({ id: 'insight-1' } as any);

    await contactRouter.createCaller(ctx).scoreWithAI({ contactId: TEST_UUIDS.contact1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'AI_SCORE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactScored',
        dataClassification: 'INTERNAL',
        beforeState: expect.objectContaining({ engagementScore: 42 }),
        afterState: expect.objectContaining({ engagementScore: expect.anything() }),
      })
    );
  });

  it('reassign delegates owner-change auditing to the side-effects helper (no duplicate)', async () => {
    const ctx = createTestContext();
    prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);

    // performContactReassign returns a REASSIGNED verdict
    vi.mocked(performContactReassign).mockResolvedValue({
      kind: 'REASSIGNED',
      previousOwnerId: TEST_UUIDS.user1,
      newOwnerId: TEST_UUIDS.user2,
      contactName: 'Audit Contact',
    } as any);
    vi.mocked(emitContactReassignSideEffects).mockResolvedValue({ notified: false } as any);

    await contactRouter.createCaller(ctx).reassign({
      id: TEST_UUIDS.contact1,
      ownerId: TEST_UUIDS.user2,
    });
    await flush();

    // The owner-change audit is owned by emitContactReassignSideEffects (the single
    // audit point for single + bulk reassign); the procedure must delegate to it…
    expect(emitContactReassignSideEffects).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: TEST_UUIDS.contact1,
        previousOwnerId: TEST_UUIDS.user1,
        newOwnerId: TEST_UUIDS.user2,
      })
    );
    // …and must NOT emit its own second audit entry for the same change.
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('addTags logs a ContactTagsAdded action with before/after tags', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findUnique.mockResolvedValue({
      id: TEST_UUIDS.contact1,
      tags: ['existing'],
    } as any);
    prismaMock.contact.update.mockResolvedValue({} as any);

    await contactRouter.createCaller(ctx).addTags({
      contactId: TEST_UUIDS.contact1,
      tags: ['new-tag'],
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'contact',
      TEST_UUIDS.contact1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        eventType: 'ContactTagsAdded',
        dataClassification: 'CONFIDENTIAL',
        beforeState: expect.objectContaining({ tags: ['existing'] }),
        afterState: expect.objectContaining({
          tags: expect.arrayContaining(['existing', 'new-tag']),
        }),
      })
    );
  });

  // ── Bulk mutations ────────────────────────────────────────────────────────

  it('bulkEmail logs a BULK_UPDATE operation', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findMany.mockResolvedValue([
      { id: TEST_UUIDS.contact1, email: 'audit@example.com' },
    ] as any);

    await contactRouter.createCaller(ctx).bulkEmail({ ids: [TEST_UUIDS.contact1] });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_UPDATE',
      'contact',
      [TEST_UUIDS.contact1],
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ operation: 'email' }),
      })
    );
  });

  it('bulkExport logs an EXPORT operation', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findMany.mockResolvedValue([
      { ...mockContact, id: TEST_UUIDS.contact1, account: null },
    ] as any);

    await contactRouter.createCaller(ctx).bulkExport({
      ids: [TEST_UUIDS.contact1],
      format: 'json',
    });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'EXPORT',
      'contact',
      [TEST_UUIDS.contact1],
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ format: 'json' }),
      })
    );
  });

  it('bulkDelete logs a BULK_DELETE operation (GDPR erasure)', async () => {
    const ctx = createTestContext();
    prismaMock.contact.findMany.mockResolvedValue([
      { id: TEST_UUIDS.contact1, _count: { opportunities: 0 } },
    ] as any);
    ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue(success(undefined));

    await contactRouter.createCaller(ctx).bulkDelete({ ids: [TEST_UUIDS.contact1] });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_DELETE',
      'contact',
      [TEST_UUIDS.contact1],
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        dataClassification: 'CONFIDENTIAL',
        successCount: 1,
        metadata: expect.objectContaining({ successfulIds: [TEST_UUIDS.contact1] }),
      })
    );
  });

  it('bulkReassign logs a BULK_UPDATE operation', async () => {
    const ctx = createTestContext();
    prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({ id: TEST_UUIDS.user2 } as any);

    vi.mocked(performContactReassign).mockResolvedValue({
      kind: 'REASSIGNED',
      previousOwnerId: TEST_UUIDS.user1,
      newOwnerId: TEST_UUIDS.user2,
      contactName: 'Bulk Contact',
    } as any);
    vi.mocked(emitContactReassignSideEffects).mockResolvedValue({ notified: false } as any);

    await contactRouter.createCaller(ctx).bulkReassign({
      ids: [TEST_UUIDS.contact1],
      ownerId: TEST_UUIDS.user2,
    });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_UPDATE',
      'contact',
      [TEST_UUIDS.contact1],
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        dataClassification: 'CONFIDENTIAL',
        metadata: expect.objectContaining({ operation: 'reassign' }),
      })
    );
  });

  // ── Fire-and-forget resilience (AC-4) ─────────────────────────────────────

  describe('fire-and-forget resilience', () => {
    it('a rejected logAction does not break delete', async () => {
      mockLogAction.mockRejectedValue(new Error('audit store down'));
      const ctx = createTestContext();
      prismaMock.contact.findUnique.mockResolvedValue({
        id: TEST_UUIDS.contact1,
        email: 'erased@example.com',
        status: 'ACTIVE',
        company: 'GoneCo',
        ownerId: TEST_UUIDS.user1,
        _count: { opportunities: 0 },
      } as any);
      prismaMock.contactAutomationSetting.findUnique.mockResolvedValue(null);
      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue(success(undefined));

      const result = await contactRouter.createCaller(ctx).delete({ id: TEST_UUIDS.contact1 });
      await flush();

      expect(result.success).toBe(true);
      expect(mockLogAction).toHaveBeenCalled();
    });

    it('a rejected logBulkOperation does not break bulkDelete', async () => {
      mockLogBulkOperation.mockRejectedValue(new Error('audit store down'));
      const ctx = createTestContext();
      prismaMock.contact.findMany.mockResolvedValue([
        { id: TEST_UUIDS.contact1, _count: { opportunities: 0 } },
      ] as any);
      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue(success(undefined));

      const result = await contactRouter
        .createCaller(ctx)
        .bulkDelete({ ids: [TEST_UUIDS.contact1] });
      await flush();

      expect(result.successful).toContain(TEST_UUIDS.contact1);
      expect(mockLogBulkOperation).toHaveBeenCalled();
    });
  });
});
