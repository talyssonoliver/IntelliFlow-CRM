/**
 * Opportunity Router Audit Logging Tests
 *
 * IFC-281 AC-006, AC-007, AC-008:
 * Verifies that audit log calls are fired for all 7 mutation procedures:
 *   create, update, delete, moveStage (opportunityRouter)
 *   pipeline-config.updateStage, updateAll, resetToDefaults (pipelineConfigRouter)
 *
 * Audit log calls are fire-and-forget — tests assert that the mock was called
 * with the expected action, resourceType, resourceId, tenantId, and actorId.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TEST_UUIDS, createTestContext, prismaMock } from '../../../test/setup';

// ─── Audit logger mock ─────────────────────────────────────────────────────
// NOTE: vi.clearAllMocks() in setup.ts resets all vi.fn() implementations each
// test. We therefore re-assign mockResolvedValue in beforeEach via the factory.
// The factory runs every time getAuditLogger() is called by the router.

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(),
}));

import { opportunityRouter } from '../opportunity.router';
import { pipelineConfigRouter } from '../pipeline-config.router';
import { getAuditLogger } from '../../../security/audit-logger';

// ─── Domain opportunity factory ────────────────────────────────────────────

const createMockDomainOpportunity = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Audit Deal',
  value: { amount: 50000, currency: 'GBP' },
  probability: { value: 60 },
  stage: 'PROPOSAL',
  expectedCloseDate: new Date('2025-06-30'),
  accountId: TEST_UUIDS.account1,
  contactId: TEST_UUIDS.contact1,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  weightedValue: { amount: 30000, currency: 'GBP' },
  isClosed: false,
  isWon: false,
  isLost: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

const makeSuccess = (opp = createMockDomainOpportunity()) => ({
  isSuccess: true,
  isFailure: false,
  value: opp,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Opportunity Router — Audit Logging (IFC-281 AC-006/AC-007/AC-008)', () => {
  const ctx = createTestContext();

  // Per-test mock logger spies — re-created after clearAllMocks()
  let mockLogAction: ReturnType<typeof vi.fn>;
  let mockLogBulkOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Make prisma.$extends return the same mock so tenantMiddleware works
    (prismaMock.$extends as ReturnType<typeof vi.fn>).mockReturnValue(prismaMock);
    // PG-184: deal-automation helpers read these tables on every mutation.
    (prismaMock as any).dealAutomationSetting = {
      findUnique: vi.fn().mockResolvedValue(null),
    };
    if (!(prismaMock as any).task) (prismaMock as any).task = {};
    (prismaMock as any).task.count = vi.fn().mockResolvedValue(0);

    // Re-wire audit logger after clearAllMocks() resets all vi.fn() implementations
    mockLogAction = vi.fn().mockResolvedValue('audit-id');
    mockLogBulkOperation = vi.fn().mockResolvedValue('audit-id');

    vi.mocked(getAuditLogger).mockReturnValue({
      logAction: mockLogAction,
      logBulkOperation: mockLogBulkOperation,
      logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
    } as any);
  });

  // ── opportunityRouter procedures ─────────────────────────────────────────

  describe('create — logs CREATE action', () => {
    it('should call logAction with CREATE, opportunity resource type and tenant', async () => {
      const caller = opportunityRouter.createCaller(ctx);
      const mockOpp = createMockDomainOpportunity({ name: 'New Deal' });

      ctx.services!.opportunity!.createOpportunity = vi
        .fn()
        .mockResolvedValue(makeSuccess(mockOpp));
      prismaMock.notification.create.mockResolvedValue({} as any);

      await caller.create({
        name: 'New Deal',
        value: { amount: 75000 },
        stage: 'PROPOSAL' as const,
        probability: 50,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.account1,
      });

      // Fire-and-forget: flush microtask queue so the .catch chain settles
      await new Promise((r) => setImmediate(r));

      expect(mockLogAction).toHaveBeenCalledWith(
        'CREATE',
        'opportunity',
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
        })
      );
    });
  });

  describe('update — logs UPDATE action', () => {
    it('should call logAction with UPDATE, opportunity resource type and tenant', async () => {
      const caller = opportunityRouter.createCaller(ctx);
      const mockOpp = createMockDomainOpportunity({ stage: 'NEGOTIATION' });

      ctx.services!.opportunity!.updateOpportunity = vi
        .fn()
        .mockResolvedValue(makeSuccess(mockOpp));

      await caller.update({ id: TEST_UUIDS.opportunity1, stage: 'NEGOTIATION' });

      await new Promise((r) => setImmediate(r));

      expect(mockLogAction).toHaveBeenCalledWith(
        'UPDATE',
        'opportunity',
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
        })
      );
    });
  });

  describe('delete — logs DELETE action', () => {
    it('should call logAction with DELETE, opportunity resource type and tenant', async () => {
      const caller = opportunityRouter.createCaller(ctx);

      ctx.services!.opportunity!.deleteOpportunity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      await caller.delete({ id: TEST_UUIDS.opportunity1 });

      await new Promise((r) => setImmediate(r));

      expect(mockLogAction).toHaveBeenCalledWith(
        'DELETE',
        'opportunity',
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
        })
      );
    });
  });

  describe('moveStage — logs UPDATE action with stage metadata', () => {
    it('should call logAction with UPDATE, targetStage and previousStage in metadata', async () => {
      const caller = opportunityRouter.createCaller(ctx);
      const mockOpp = createMockDomainOpportunity({
        stage: 'NEGOTIATION',
        probability: { value: 80 },
      });

      // Pre-mutation stage lookup for previousStage capture
      prismaMock.opportunity.findUnique.mockResolvedValue({ stage: 'PROPOSAL' } as any);
      ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue(makeSuccess(mockOpp));
      prismaMock.notification.create.mockResolvedValue({} as any);

      await caller.moveStage({ id: TEST_UUIDS.opportunity1, targetStage: 'NEGOTIATION' });

      await new Promise((r) => setImmediate(r));

      expect(mockLogAction).toHaveBeenCalledWith(
        'UPDATE',
        'opportunity',
        TEST_UUIDS.opportunity1,
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
          metadata: expect.objectContaining({
            targetStage: 'NEGOTIATION',
            previousStage: 'PROPOSAL',
          }),
        })
      );
    });
  });

  // ── pipelineConfigRouter procedures ──────────────────────────────────────

  describe('pipeline-config.updateStage — logs UPDATE action', () => {
    it('should call logAction with UPDATE, pipeline_config resource type', async () => {
      const caller = pipelineConfigRouter.createCaller(ctx);

      // updateStage: no existing config → will call create
      (prismaMock.pipelineStageConfig as any).findUnique.mockResolvedValue(null);
      (prismaMock.pipelineStageConfig as any).create.mockResolvedValue({
        id: 'cfg-1',
        stageKey: 'PROPOSAL',
        displayName: 'Proposal Updated',
        color: '#ff0000',
        order: 3,
        probability: 75,
        isActive: true,
        tenantId: TEST_UUIDS.tenant,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await caller.updateStage({
        stage: 'PROPOSAL' as const,
        displayName: 'Proposal Updated',
        color: '#ff0000',
        probability: 75,
        isActive: true,
      });

      await new Promise((r) => setImmediate(r));

      expect(mockLogAction).toHaveBeenCalledWith(
        'UPDATE',
        'pipeline_config',
        'PROPOSAL',
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
        })
      );
    });
  });

  describe('pipeline-config.updateAll — logs BULK_UPDATE operation', () => {
    it('should call logBulkOperation with BULK_UPDATE, pipeline_config resource type', async () => {
      const caller = pipelineConfigRouter.createCaller(ctx);

      // updateAll uses prismaWithTenant.$transaction
      (prismaMock.$transaction as any) = vi.fn().mockResolvedValue([
        {
          stageKey: 'PROPOSAL',
          displayName: 'Proposal',
          color: '#fb923c',
          order: 3,
          probability: 70,
          isActive: true,
        },
        {
          stageKey: 'NEGOTIATION',
          displayName: 'Negotiation',
          color: '#facc15',
          order: 4,
          probability: 80,
          isActive: true,
        },
      ]);

      await caller.updateAll({
        stages: [
          {
            stage: 'PROPOSAL' as const,
            displayName: 'Proposal',
            color: '#fb923c',
            probability: 70,
            isActive: true,
          },
          {
            stage: 'NEGOTIATION' as const,
            displayName: 'Negotiation',
            color: '#facc15',
            probability: 80,
            isActive: true,
          },
        ],
      });

      await new Promise((r) => setImmediate(r));

      expect(mockLogBulkOperation).toHaveBeenCalledWith(
        'BULK_UPDATE',
        'pipeline_config',
        expect.arrayContaining(['PROPOSAL', 'NEGOTIATION']),
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
        })
      );
    });
  });

  describe('pipeline-config.resetToDefaults — logs DELETE action', () => {
    it('should call logAction with DELETE, pipeline_config and resource id "all"', async () => {
      const caller = pipelineConfigRouter.createCaller(ctx);

      (prismaMock.pipelineStageConfig as any).deleteMany.mockResolvedValue({ count: 7 });

      await caller.resetToDefaults();

      await new Promise((r) => setImmediate(r));

      expect(mockLogAction).toHaveBeenCalledWith(
        'DELETE',
        'pipeline_config',
        'all',
        TEST_UUIDS.tenant,
        expect.objectContaining({
          actorId: TEST_UUIDS.user1,
        })
      );
    });
  });
});
