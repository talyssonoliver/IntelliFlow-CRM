/**
 * Lead Router Audit Logging Tests (IFC-240)
 *
 * Verifies that an audit-trail entry is fired for every instrumented lead
 * procedure: all 15 mutations plus the single-record `getById` read.
 *
 * Audit calls are fire-and-forget (`getAuditLogger(ctx.prisma).logAction(...)`
 * / `.logBulkOperation(...)` with `.catch(logLeadAuditFailure)`), so each test
 * flushes the microtask queue with `setImmediate` before asserting the mock was
 * called with the expected action, `'lead'` resourceType, resourceId(s),
 * tenantId and actorId. A resilience block proves a rejected audit write never
 * changes a procedure's return value (AC-4).
 *
 * The collection/aggregate reads (list, stats, getHotLeads,
 * getReadyForQualification, filterOptions) are excluded by design — see
 * IFC-240-spec.md §3.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_UUIDS, createTestContext, prismaMock, mockLead } from '../../../test/setup';

// ─── Audit logger mock ─────────────────────────────────────────────────────
// setup.ts runs vi.clearAllMocks() in its (earlier-registered) beforeEach, so
// the spies are re-wired in this file's beforeEach via the factory return.
vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));

import { leadRouter } from '../lead.router';
import { getAuditLogger } from '../../../security/audit-logger';

const flush = () => new Promise((r) => setImmediate(r));

const success = <T>(value: T) => ({ isSuccess: true, isFailure: false, value });

const makeDomainLead = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.lead1 },
  email: { value: 'audit@example.com' },
  firstName: 'Audit',
  lastName: 'Lead',
  company: 'AuditCo',
  title: null,
  phone: undefined,
  source: 'WEBSITE',
  status: 'NEW',
  score: { value: 0, confidence: 0, tier: 'cold' as const },
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('Lead Router — Audit Logging (IFC-240)', () => {
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
    ctx.services!.lead!.createLead = vi.fn().mockResolvedValue(success(makeDomainLead()));

    await leadRouter.createCaller(ctx).create({ email: 'audit@example.com', source: 'WEBSITE' });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'CREATE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  it('getById logs a READ access action', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findUnique.mockResolvedValue({
      id: TEST_UUIDS.lead1,
      tenantId: TEST_UUIDS.tenant,
      aiInsights: [{ id: 'ai-1' }],
    } as any);

    await leadRouter.createCaller(ctx).getById({ id: TEST_UUIDS.lead1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'READ',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  it('update logs an UPDATE action', async () => {
    const ctx = createTestContext();
    ctx.services!.lead!.updateLead = vi
      .fn()
      .mockResolvedValue(success(makeDomainLead({ status: 'CONTACTED' })));

    await leadRouter.createCaller(ctx).update({ id: TEST_UUIDS.lead1, firstName: 'Edited' });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  it('delete logs a DELETE action (GDPR erasure)', async () => {
    const ctx = createTestContext();
    ctx.services!.lead!.deleteLead = vi.fn().mockResolvedValue(success(undefined));

    await leadRouter.createCaller(ctx).delete({ id: TEST_UUIDS.lead1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'DELETE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  it('setStarred logs an UPDATE action with isStarred metadata', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findUnique.mockResolvedValue({ id: TEST_UUIDS.lead1 } as any);
    prismaMock.lead.update.mockResolvedValue({ id: TEST_UUIDS.lead1, isStarred: true } as any);

    await leadRouter.createCaller(ctx).setStarred({ id: TEST_UUIDS.lead1, starred: true });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ isStarred: true }),
      })
    );
  });

  it('qualify logs a QUALIFY action', async () => {
    const ctx = createTestContext();
    ctx.services!.lead!.qualifyLead = vi.fn().mockResolvedValue(success(makeDomainLead()));

    await leadRouter.createCaller(ctx).qualify({ leadId: TEST_UUIDS.lead1, reason: 'Strong BANT' });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'QUALIFY',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ reason: 'Strong BANT' }),
      })
    );
  });

  it('convert logs a CONVERT action (GDPR)', async () => {
    const ctx = createTestContext();
    ctx.services!.lead!.convertLead = vi
      .fn()
      .mockResolvedValue(success({ leadId: TEST_UUIDS.lead1, contactId: TEST_UUIDS.contact1 }));

    await leadRouter.createCaller(ctx).convert({ leadId: TEST_UUIDS.lead1, createAccount: false });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'CONVERT',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  it('convertToDeal logs a CONVERT action with opportunityId metadata (GDPR)', async () => {
    const ctx = createTestContext();
    ctx.services!.convertLeadToDeal = {
      execute: vi.fn().mockResolvedValue(success({ opportunityId: TEST_UUIDS.opportunity1 })),
    } as any;

    await leadRouter.createCaller(ctx).convertToDeal({
      leadId: TEST_UUIDS.lead1,
      dealName: 'Big Deal',
      dealValue: 1000,
    } as any);
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'CONVERT',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ opportunityId: TEST_UUIDS.opportunity1 }),
      })
    );
  });

  it('scoreWithAI logs an AI_SCORE action', async () => {
    const ctx = createTestContext();
    ctx.services!.lead!.scoreLead = vi.fn().mockResolvedValue(
      success({
        leadId: TEST_UUIDS.lead1,
        previousScore: 10,
        newScore: 80,
        confidence: 0.9,
        tier: 'hot',
        autoQualified: true,
        autoDisqualified: false,
      })
    );

    await leadRouter.createCaller(ctx).scoreWithAI({ leadId: TEST_UUIDS.lead1 });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'AI_SCORE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ newScore: 80, tier: 'hot' }),
      })
    );
  });

  it('addNote logs an UPDATE action with add_note metadata', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findUnique.mockResolvedValue({ id: TEST_UUIDS.lead1 } as any);
    prismaMock.leadNote.create.mockResolvedValue({ id: 'note-1' } as any);

    await leadRouter.createCaller(ctx).addNote({ leadId: TEST_UUIDS.lead1, content: 'A note' });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ operation: 'add_note' }),
      })
    );
  });

  it('logActivity logs an UPDATE action with activityType metadata', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findUnique.mockResolvedValue({ id: TEST_UUIDS.lead1 } as any);
    (prismaMock as any).$transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          leadActivity: { create: vi.fn().mockResolvedValue({ id: 'act-1' }) },
          lead: { update: vi.fn().mockResolvedValue({}) },
        })
      );

    await leadRouter.createCaller(ctx).logActivity({
      leadId: TEST_UUIDS.lead1,
      type: 'CALL',
      title: 'Called the lead',
    });
    await flush();

    expect(mockLogAction).toHaveBeenCalledWith(
      'UPDATE',
      'lead',
      TEST_UUIDS.lead1,
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ activityType: 'CALL' }),
      })
    );
  });

  // ── Bulk mutations ────────────────────────────────────────────────────────

  it('bulkScore logs a BULK_UPDATE operation', async () => {
    const ctx = createTestContext();
    ctx.services!.lead!.bulkScoreLeads = vi
      .fn()
      .mockResolvedValue({ successful: [TEST_UUIDS.lead1], failed: [] });
    prismaMock.lead.findMany.mockResolvedValue([]); // bias-check short-circuits

    await leadRouter.createCaller(ctx).bulkScore({ leadIds: [TEST_UUIDS.lead1] });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_UPDATE',
      'lead',
      [TEST_UUIDS.lead1],
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ operation: 'score' }),
      })
    );
  });

  it('bulkConvert logs a BULK_UPDATE operation with the converted ids (GDPR)', async () => {
    const ctx = createTestContext();
    (prismaMock as any).$transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          lead: {
            findMany: vi
              .fn()
              .mockResolvedValue([
                {
                  ...mockLead,
                  id: TEST_UUIDS.lead1,
                  status: 'QUALIFIED',
                  tenantId: TEST_UUIDS.tenant,
                },
              ]),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          leadActivity: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
          contact: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
          account: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
        })
      );

    await leadRouter
      .createCaller(ctx)
      .bulkConvert({ ids: [TEST_UUIDS.lead1], createAccounts: false });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_UPDATE',
      'lead',
      expect.arrayContaining([TEST_UUIDS.lead1]),
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ operation: 'convert' }),
      })
    );
  });

  it('bulkUpdateStatus logs a BULK_UPDATE operation with status metadata', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findMany.mockResolvedValue([
      { id: TEST_UUIDS.lead1 },
      { id: TEST_UUIDS.lead2 },
    ] as any);
    prismaMock.lead.updateMany.mockResolvedValue({ count: 2 } as any);

    await leadRouter.createCaller(ctx).bulkUpdateStatus({
      ids: [TEST_UUIDS.lead1, TEST_UUIDS.lead2],
      status: 'CONTACTED',
    });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_UPDATE',
      'lead',
      expect.arrayContaining([TEST_UUIDS.lead1]),
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ operation: 'updateStatus', status: 'CONTACTED' }),
      })
    );
  });

  it('bulkArchive logs a BULK_UPDATE operation with archive metadata', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findMany.mockResolvedValue([{ id: TEST_UUIDS.lead1, status: 'NEW' }] as any);
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.leadActivity.createMany.mockResolvedValue({ count: 1 } as any);

    await leadRouter.createCaller(ctx).bulkArchive({ ids: [TEST_UUIDS.lead1] });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_UPDATE',
      'lead',
      expect.arrayContaining([TEST_UUIDS.lead1]),
      TEST_UUIDS.tenant,
      expect.objectContaining({
        actorId: TEST_UUIDS.user1,
        metadata: expect.objectContaining({ operation: 'archive' }),
      })
    );
  });

  it('bulkDelete logs a BULK_DELETE operation (GDPR erasure)', async () => {
    const ctx = createTestContext();
    prismaMock.lead.findMany.mockResolvedValue([{ id: TEST_UUIDS.lead1 }] as any);
    prismaMock.lead.deleteMany.mockResolvedValue({ count: 1 } as any);

    await leadRouter.createCaller(ctx).bulkDelete({ ids: [TEST_UUIDS.lead1] });
    await flush();

    expect(mockLogBulkOperation).toHaveBeenCalledWith(
      'BULK_DELETE',
      'lead',
      expect.arrayContaining([TEST_UUIDS.lead1]),
      TEST_UUIDS.tenant,
      expect.objectContaining({ actorId: TEST_UUIDS.user1 })
    );
  });

  // ── Fire-and-forget resilience (AC-4) ─────────────────────────────────────

  describe('fire-and-forget resilience', () => {
    it('a rejected logAction does not break create', async () => {
      mockLogAction.mockRejectedValue(new Error('audit store down'));
      const ctx = createTestContext();
      ctx.services!.lead!.createLead = vi.fn().mockResolvedValue(success(makeDomainLead()));

      const result = await leadRouter
        .createCaller(ctx)
        .create({ email: 'audit@example.com', source: 'WEBSITE' });
      await flush();

      expect(result.email).toBe('audit@example.com');
      expect(mockLogAction).toHaveBeenCalled();
    });

    it('a rejected logBulkOperation does not break bulkDelete', async () => {
      mockLogBulkOperation.mockRejectedValue(new Error('audit store down'));
      const ctx = createTestContext();
      prismaMock.lead.findMany.mockResolvedValue([{ id: TEST_UUIDS.lead1 }] as any);
      prismaMock.lead.deleteMany.mockResolvedValue({ count: 1 } as any);

      const result = await leadRouter.createCaller(ctx).bulkDelete({ ids: [TEST_UUIDS.lead1] });
      await flush();

      expect(result.successful).toContain(TEST_UUIDS.lead1);
      expect(mockLogBulkOperation).toHaveBeenCalled();
    });
  });
});
