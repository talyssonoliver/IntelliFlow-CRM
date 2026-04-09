/**
 * Opportunity Router Additional Tests - covers uncovered error handling and filter paths
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prismaMock, createTestContext, TEST_UUIDS, mockServices } from '../../../test/setup';

const mockGetTenantContext = vi.fn();
const mockCreateTenantWhereClause = vi.fn();

vi.mock('../../../security/tenant-context', () => ({
  getTenantContext: (...args: any[]) => mockGetTenantContext(...args),
  createTenantWhereClause: (...args: any[]) => mockCreateTenantWhereClause(...args),
  // Required by tenantMiddleware in trpc.ts — return the prisma client unchanged
  createTenantScopedPrisma: vi.fn((prisma: unknown) => prisma),
  hasTenantContext: vi.fn(() => true),
  assertTenantContext: vi.fn(),
  extractTenantContext: vi.fn(),
}));

vi.mock('../../../shared/mappers', () => ({
  mapOpportunityToResponse: (opp: any) => opp,
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: vi.fn(() => ({
    logAction: vi.fn().mockResolvedValue('audit-id'),
    logBulkOperation: vi.fn().mockResolvedValue('audit-id'),
    logPermissionDenied: vi.fn().mockResolvedValue('audit-id'),
  })),
}));

import { opportunityRouter } from '../opportunity.router';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = TEST_UUIDS.user1;
const OPP_ID = TEST_UUIDS.lead1;

describe('opportunityRouter additional coverage', () => {
  const ctx = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantContext.mockReturnValue({
      ...ctx,
      tenant: { tenantId: TENANT_ID, userId: USER_ID },
      prismaWithTenant: prismaMock,
    });
    mockCreateTenantWhereClause.mockImplementation((_tenant: any, where: any) => where);
  });

  describe('create - generic BAD_REQUEST', () => {
    it('should throw BAD_REQUEST for generic service error', async () => {
      mockServices.opportunity.createOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(
        caller.create({
          name: 'Test Deal',
          accountId: TEST_UUIDS.account1,
          stage: 'PROSPECTING',
          value: { amount: 10000, currency: 'GBP' },
          probability: 50,
        })
      ).rejects.toThrow('Something went wrong');
    });

    it('should throw NOT_FOUND for VALIDATION_ERROR or NOT_FOUND_ERROR', async () => {
      mockServices.opportunity.createOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(
        caller.create({
          name: 'Test Deal',
          accountId: TEST_UUIDS.account1,
          stage: 'PROSPECTING',
          value: { amount: 10000, currency: 'GBP' },
          probability: 50,
        })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('update - error code mapping', () => {
    it('should throw NOT_FOUND for NOT_FOUND_ERROR', async () => {
      mockServices.opportunity.updateOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Opportunity not found' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(
        caller.update({
          id: OPP_ID,
          name: 'Updated Deal',
        })
      ).rejects.toThrow('Opportunity not found');
    });

    it('should throw BAD_REQUEST for VALIDATION_ERROR', async () => {
      mockServices.opportunity.updateOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid value' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(
        caller.update({
          id: OPP_ID,
          name: 'Updated Deal',
        })
      ).rejects.toThrow('Invalid value');
    });

    it('should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      mockServices.opportunity.updateOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'DB_ERROR', message: 'Database failure' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(
        caller.update({
          id: OPP_ID,
          name: 'Updated Deal',
        })
      ).rejects.toThrow('Database failure');
    });
  });

  describe('delete - VALIDATION_ERROR maps to PRECONDITION_FAILED', () => {
    it('should throw PRECONDITION_FAILED for VALIDATION_ERROR', async () => {
      mockServices.opportunity.deleteOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Has related records' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      try {
        await caller.delete({ id: OPP_ID });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('PRECONDITION_FAILED');
      }
    });

    it('should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      mockServices.opportunity.deleteOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'DB_ERROR', message: 'DB failure' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      try {
        await caller.delete({ id: OPP_ID });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      }
    });
  });

  describe('list - value filters', () => {
    it('should apply minValue and maxValue filters', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.list({
        minValue: 5000,
        maxValue: 50000,
      });

      expect(result.opportunities).toEqual([]);
    });
  });

  describe('list - probability filters', () => {
    it('should apply minProbability and maxProbability filters', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.list({
        minProbability: 25,
        maxProbability: 75,
      });

      expect(result.opportunities).toEqual([]);
    });
  });

  describe('list - date filters', () => {
    it('should apply dateFrom and dateTo filters', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.list({
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-12-31'),
      });

      expect(result.opportunities).toEqual([]);
    });
  });

  describe('list - contact filter', () => {
    it('should apply contactId filter', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.list({
        contactId: TEST_UUIDS.contact1,
      });

      expect(result.opportunities).toEqual([]);
    });
  });

  describe('moveStage - CLOSED_LOST without reason', () => {
    it('should pass empty reason when not provided', async () => {
      mockServices.closeDealLost.execute.mockResolvedValue({
        isFailure: false,
        value: { id: { value: OPP_ID }, name: 'Test Deal', stage: 'CLOSED_LOST' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await caller.moveStage({
        id: OPP_ID,
        targetStage: 'CLOSED_LOST',
      });

      expect(mockServices.closeDealLost.execute).toHaveBeenCalledWith({
        opportunityId: OPP_ID,
        reason: '',
        closedBy: USER_ID,
        tenantId: TENANT_ID,
      });
    });

    it('should pass reason when provided', async () => {
      mockServices.closeDealLost.execute.mockResolvedValue({
        isFailure: false,
        value: { id: { value: OPP_ID }, name: 'Test Deal', stage: 'CLOSED_LOST' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await caller.moveStage({
        id: OPP_ID,
        targetStage: 'CLOSED_LOST',
        reason: 'Budget cut forced cancellation',
      });

      expect(mockServices.closeDealLost.execute).toHaveBeenCalledWith({
        opportunityId: OPP_ID,
        reason: 'Budget cut forced cancellation',
        closedBy: USER_ID,
        tenantId: TENANT_ID,
      });
    });
  });

  describe('forecast - with data', () => {
    it('should calculate weighted value and win rate from real data', async () => {
      const activeOpps = [
        {
          id: 'opp-1',
          name: 'Deal A',
          stage: 'PROPOSAL',
          value: 10000,
          probability: 60,
          expectedCloseDate: new Date(),
          owner: { id: 'u1', name: 'Alice', email: 'a@e.com' },
          account: { id: 'a1', name: 'Corp' },
        },
        {
          id: 'opp-2',
          name: 'Deal B',
          stage: 'NEGOTIATION',
          value: 20000,
          probability: 80,
          expectedCloseDate: new Date(),
          owner: { id: 'u2', name: 'Bob', email: 'b@e.com' },
          account: null,
        },
      ];
      const closedDeals = [
        {
          id: 'c-1',
          value: 15000,
          stage: 'CLOSED_WON',
          closedAt: new Date(),
          createdAt: new Date(Date.now() - 30 * 86400000),
        },
        {
          id: 'c-2',
          value: 8000,
          stage: 'CLOSED_LOST',
          closedAt: new Date(),
          createdAt: new Date(Date.now() - 20 * 86400000),
        },
      ];

      // forecast calls findMany twice sequentially; distinguish by args (stage filter)
      (prismaMock.opportunity.findMany as any).mockImplementation(
        (args: { where?: { stage?: { notIn?: string[]; in?: string[] } } }) => {
          if (args?.where?.stage?.notIn) return Promise.resolve(activeOpps); // active opps
          if (args?.where?.stage?.in) return Promise.resolve(closedDeals); // closed deals
          return Promise.resolve([]);
        }
      );

      const caller = opportunityRouter.createCaller(ctx);
      const result = await caller.forecast();

      expect(result.totalOpportunities).toBe(2);
      expect(Number(result.weightedValue)).toBeGreaterThan(0);
      expect(result.totalPipelineValue).toBe(30000);
      expect(result.winRate).toBe(50);
      expect(result.wonDealsCount).toBe(1);
      expect(result.lostDealsCount).toBe(1);
      expect(result.deals).toHaveLength(2);
    });
  });

  describe('getOpportunityService - missing service', () => {
    it('should throw INTERNAL_SERVER_ERROR when service unavailable for mutations', async () => {
      const ctxNoService = createTestContext({
        services: {} as any,
      });
      mockGetTenantContext.mockReturnValue({
        ...ctxNoService,
        tenant: { tenantId: TENANT_ID, userId: USER_ID },
        prismaWithTenant: prismaMock,
      });
      const caller = opportunityRouter.createCaller(ctxNoService);

      // getById now uses Prisma directly, so test service-dependent procedure (delete) instead
      await expect(
        caller.delete({ id: OPP_ID })
      ).rejects.toThrow('Opportunity service not available');
    });
  });

  // =========================================================================
  // PG-175: Trash procedures (listTrashed, restore, permanentDelete)
  // =========================================================================

  describe('listTrashed', () => {
    const trashedOpp = {
      ...{
        id: OPP_ID,
        tenantId: TENANT_ID,
        name: 'Deleted Deal',
        value: 25000,
        stage: 'PROPOSAL',
        probability: 50,
        expectedCloseDate: new Date('2025-06-30'),
        closedAt: null,
        deletedAt: new Date('2026-03-15'),
        description: 'Was deleted',
        accountId: null,
        contactId: null,
        ownerId: USER_ID,
        sourceLeadId: null,
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-01'),
      },
      owner: { id: USER_ID, name: 'Test User', email: 'test@example.com' },
      account: null,
      contact: null,
    };

    it('should return trashed opportunities', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([trashedOpp] as any);
      prismaMock.opportunity.count.mockResolvedValue(1);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.listTrashed({});

      expect(result.opportunities).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(15);
      expect(result.hasMore).toBe(false);
    });

    it('should respect search filter on name', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.listTrashed({ search: 'Nonexistent' });

      expect(result.opportunities).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should paginate correctly', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([trashedOpp] as any);
      prismaMock.opportunity.count.mockResolvedValue(20);
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.listTrashed({ page: 2, limit: 5 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.hasMore).toBe(true); // 5 + 1 < 20
    });
  });

  describe('restore', () => {
    it('should restore a trashed opportunity successfully', async () => {
      mockServices.opportunity.restoreOpportunity.mockResolvedValue({
        isFailure: false,
        value: { id: OPP_ID },
      });
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.restore({ id: OPP_ID });

      expect(result).toEqual({ success: true, id: OPP_ID });
      expect(mockServices.opportunity.restoreOpportunity).toHaveBeenCalledWith(OPP_ID, TENANT_ID);
    });

    it('should throw NOT_FOUND for non-existent id', async () => {
      mockServices.opportunity.restoreOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Opportunity not found' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(caller.restore({ id: OPP_ID })).rejects.toThrow('Opportunity not found');
    });
  });

  describe('permanentDelete', () => {
    it('should permanently delete a trashed opportunity', async () => {
      mockServices.opportunity.permanentDeleteOpportunity.mockResolvedValue({
        isFailure: false,
        value: { id: OPP_ID },
      });
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.permanentDelete({ id: OPP_ID });

      expect(result).toEqual({ success: true, id: OPP_ID });
      expect(mockServices.opportunity.permanentDeleteOpportunity).toHaveBeenCalledWith(OPP_ID, TENANT_ID);
    });

    it('should reject non-trashed deals with PRECONDITION_FAILED', async () => {
      mockServices.opportunity.permanentDeleteOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Can only permanently delete deals that are in trash' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      try {
        await caller.permanentDelete({ id: OPP_ID });
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('PRECONDITION_FAILED');
      }
    });

    it('should throw NOT_FOUND for non-existent id', async () => {
      mockServices.opportunity.permanentDeleteOpportunity.mockResolvedValue({
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Opportunity not found' },
      });
      const caller = opportunityRouter.createCaller(ctx);

      await expect(caller.permanentDelete({ id: OPP_ID })).rejects.toThrow('Opportunity not found');
    });
  });

  describe('delete - now performs soft-delete', () => {
    it('should call deleteOpportunity (which is now soft-delete) successfully', async () => {
      mockServices.opportunity.deleteOpportunity.mockResolvedValue({
        isFailure: false,
        value: { id: OPP_ID },
      });
      const caller = opportunityRouter.createCaller(ctx);

      const result = await caller.delete({ id: OPP_ID });

      expect(result).toEqual({ success: true, id: OPP_ID });
      expect(mockServices.opportunity.deleteOpportunity).toHaveBeenCalled();
    });
  });
});
