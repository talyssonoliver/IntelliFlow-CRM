import { TEST_UUIDS } from '../../../test/setup';
/**
 * Opportunity Router Tests
 *
 * Comprehensive tests for all opportunity router procedures:
 * - create, getById, list, update, delete, stats, forecast
 *
 * Following hexagonal architecture - mocks services for business logic procedures.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { opportunityRouter } from '../opportunity.router';
import {
  prismaMock,
  createTestContext,
  mockOpportunity,
  mockAccount,
  mockContact,
  mockUser,
  mockTask,
} from '../../../test/setup';

/**
 * Create a mock domain opportunity for service responses
 */
const createMockDomainOpportunity = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.opportunity1 },
  name: 'Big Deal',
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

describe('Opportunity Router', () => {
  const ctx = createTestContext();
  const caller = opportunityRouter.createCaller(ctx);

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new opportunity with valid input', async () => {
      const input = {
        name: 'New Deal',
        value: { amount: 75000 },
        stage: 'PROPOSAL' as const,
        probability: 50,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.account1,
        contactId: TEST_UUIDS.contact1,
      };

      const mockDomainOpp = createMockDomainOpportunity({
        name: input.name,
        value: { amount: input.value.amount, currency: 'GBP' },
        probability: { value: input.probability },
        stage: input.stage,
        expectedCloseDate: input.expectedCloseDate,
        contactId: input.contactId,
        weightedValue: { amount: input.value.amount * (input.probability / 100), currency: 'GBP' },
      });

      ctx.services!.opportunity!.createOpportunity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainOpp,
      });

      const result = await caller.create(input);

      expect(result.name).toBe(input.name);
      expect(result.value).toBe(input.value.amount); // Mapper returns value.amount
      expect(result.stage).toBe(input.stage);
      expect(ctx.services!.opportunity!.createOpportunity).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND if account does not exist', async () => {
      const input = {
        name: 'Deal',
        value: { amount: 50000 },
        stage: 'PROPOSAL' as const,
        probability: 60,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.nonExistent,
      };

      ctx.services!.opportunity!.createOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: `Account not found: ${input.accountId}` },
      });

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Account'),
        })
      );
    });

    it('should throw NOT_FOUND if contact does not exist', async () => {
      const input = {
        name: 'Deal',
        value: { amount: 50000 },
        stage: 'PROPOSAL' as const,
        probability: 60,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.account1,
        contactId: TEST_UUIDS.nonExistent,
      };

      ctx.services!.opportunity!.createOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: `Contact not found: ${input.contactId}` },
      });

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Contact'),
        })
      );
    });
  });

  describe('getById', () => {
    it('should return opportunity with related data', async () => {
      const mockDomainOpp = createMockDomainOpportunity();

      ctx.services!.opportunity!.getOpportunityById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainOpp,
      });

      const result = await caller.getById({ id: TEST_UUIDS.opportunity1 });

      expect(result.id).toBe(TEST_UUIDS.opportunity1);
      expect(result.name).toBe('Big Deal');
      expect(ctx.services!.opportunity!.getOpportunityById).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1
      );
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      ctx.services!.opportunity!.getOpportunityById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'NOT_FOUND_ERROR',
          message: `Opportunity not found: ${TEST_UUIDS.nonExistent}`,
        },
      });

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('list', () => {
    // list still uses Prisma for complex queries with joins
    it('should list opportunities with pagination', async () => {
      const opportunities = [mockOpportunity, { ...mockOpportunity, id: 'opp-2', name: 'Deal 2' }];
      const opportunitiesWithRelations = opportunities.map((opp) => ({
        ...opp,
        owner: mockUser,
        account: mockAccount,
        contact: mockContact,
      }));

      prismaMock.opportunity.findMany.mockResolvedValue(opportunitiesWithRelations as any);
      prismaMock.opportunity.count.mockResolvedValue(30);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.opportunities).toHaveLength(2);
      expect(result.total).toBe(30);
      expect(result.hasMore).toBe(true);
    });

    it('should filter opportunities by stage', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);

      await caller.list({ stage: ['PROPOSAL', 'NEGOTIATION'] });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stage: { in: ['PROPOSAL', 'NEGOTIATION'] },
          }),
        })
      );
    });

    it('should filter opportunities by value range', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);

      await caller.list({ minValue: 10000, maxValue: 100000 });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            value: { gte: 10000, lte: 100000 },
          }),
        })
      );
    });

    it('should filter opportunities by probability range', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);

      await caller.list({ minProbability: 50, maxProbability: 80 });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            probability: { gte: 50, lte: 80 },
          }),
        })
      );
    });

    it('should filter opportunities by date range', async () => {
      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-12-31');

      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);

      await caller.list({ dateFrom, dateTo });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expectedCloseDate: { gte: dateFrom, lte: dateTo },
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('should update opportunity with valid data', async () => {
      const mockDomainOpp = createMockDomainOpportunity({
        stage: 'NEGOTIATION',
        probability: { value: 70 },
      });

      ctx.services!.opportunity!.updateOpportunity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainOpp,
      });

      const result = await caller.update({
        id: TEST_UUIDS.opportunity1,
        stage: 'NEGOTIATION',
        probability: 70,
      });

      expect(result.stage).toBe('NEGOTIATION');
      expect(result.probability).toBe(70);
      expect(ctx.services!.opportunity!.updateOpportunity).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when updating non-existent opportunity', async () => {
      ctx.services!.opportunity!.updateOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'NOT_FOUND_ERROR',
          message: `Opportunity not found: ${TEST_UUIDS.nonExistent}`,
        },
      });

      await expect(
        caller.update({ id: TEST_UUIDS.nonExistent, stage: 'CLOSED_WON' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should validate account exists when updating accountId', async () => {
      ctx.services!.opportunity!.updateOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(
        caller.update({ id: TEST_UUIDS.opportunity1, accountId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Account'),
        })
      );
    });

    it('should throw BAD_REQUEST for invalid stage transition', async () => {
      ctx.services!.opportunity!.updateOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid stage transition from PROPOSAL to CLOSED_WON',
        },
      });

      await expect(
        caller.update({ id: TEST_UUIDS.opportunity1, stage: 'CLOSED_WON' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing opportunity', async () => {
      ctx.services!.opportunity!.deleteOpportunity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await caller.delete({ id: TEST_UUIDS.opportunity1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.opportunity1);
      expect(ctx.services!.opportunity!.deleteOpportunity).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1
      );
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      ctx.services!.opportunity!.deleteOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'NOT_FOUND_ERROR',
          message: `Opportunity not found: ${TEST_UUIDS.nonExistent}`,
        },
      });

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw PRECONDITION_FAILED for won opportunities', async () => {
      ctx.services!.opportunity!.deleteOpportunity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot delete won opportunities. Archive them instead.',
        },
      });

      await expect(caller.delete({ id: TEST_UUIDS.opportunity1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
        })
      );
    });
  });

  describe('stats', () => {
    // stats still uses Prisma for aggregations
    it('should return opportunity statistics', async () => {
      prismaMock.opportunity.count.mockResolvedValue(50);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([
        { stage: 'PROPOSAL', _count: 15, _sum: { value: new Prisma.Decimal(500000) } },
        { stage: 'NEGOTIATION', _count: 10, _sum: { value: new Prisma.Decimal(300000) } },
        { stage: 'CLOSED_WON', _count: 20, _sum: { value: new Prisma.Decimal(1000000) } },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: new Prisma.Decimal(2000000) },
      } as Awaited<ReturnType<typeof prismaMock.opportunity.aggregate>>);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _avg: { probability: 65.5 },
      } as Awaited<ReturnType<typeof prismaMock.opportunity.aggregate>>);

      const result = await caller.stats();

      expect(result.total).toBe(50);
      expect(result.byStage).toEqual({
        PROPOSAL: { count: 15, totalValue: '500000' },
        NEGOTIATION: { count: 10, totalValue: '300000' },
        CLOSED_WON: { count: 20, totalValue: '1000000' },
      });
      expect(result.totalValue).toBe('2000000');
      expect(result.averageProbability).toBe(65.5);
    });

    it('should handle zero statistics', async () => {
      prismaMock.opportunity.count.mockResolvedValue(0);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([]);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: null },
      } as Awaited<ReturnType<typeof prismaMock.opportunity.aggregate>>);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _avg: { probability: null },
      } as Awaited<ReturnType<typeof prismaMock.opportunity.aggregate>>);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.totalValue).toBe('0');
      expect(result.averageProbability).toBe(0);
    });
  });

  describe('forecast', () => {
    // forecast still uses Prisma for complex queries
    it('should calculate weighted pipeline value', async () => {
      // Create forecast data with just the fields needed for calculation
      const forecastData = [
        { value: new Prisma.Decimal(100000), probability: 80, stage: 'NEGOTIATION' as const },
        { value: new Prisma.Decimal(50000), probability: 60, stage: 'PROPOSAL' as const },
        { value: new Prisma.Decimal(200000), probability: 90, stage: 'NEGOTIATION' as const },
      ];

      prismaMock.opportunity.findMany.mockResolvedValue(
        forecastData as Awaited<ReturnType<typeof prismaMock.opportunity.findMany>>
      );

      const result = await caller.forecast();

      // Expected: (100000 * 0.8) + (50000 * 0.6) + (200000 * 0.9) = 80000 + 30000 + 180000 = 290000
      expect(result.totalOpportunities).toBe(3);
      expect(result.weightedValue).toBe('290000');
    });

    it('should exclude closed opportunities', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);

      await caller.forecast();

      // First call gets active opportunities (excluding closed)
      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stage: {
              notIn: ['CLOSED_WON', 'CLOSED_LOST'],
            },
          }),
        })
      );
    });

    it('should handle empty pipeline', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);

      const result = await caller.forecast();

      expect(result.totalOpportunities).toBe(0);
      expect(result.weightedValue).toBe('0');
    });
  });

  // ============================================
  // IFC-186: New endpoints
  // ============================================

  describe('moveStage', () => {
    it('should move opportunity to valid next stage', async () => {
      const mockDomainOpp = createMockDomainOpportunity({
        stage: 'NEGOTIATION',
        probability: { value: 80 },
      });

      ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainOpp,
      });

      const result = await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'NEGOTIATION',
      });

      expect(result.stage).toBe('NEGOTIATION');
      expect(ctx.services!.opportunity!.changeStage).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        'NEGOTIATION',
        expect.any(String)
      );
    });

    it('should mark as won when targetStage is CLOSED_WON', async () => {
      const mockDomainOpp = createMockDomainOpportunity({
        stage: 'CLOSED_WON',
        probability: { value: 100 },
        isClosed: true,
        isWon: true,
      });

      ctx.services!.opportunity!.markAsWon = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainOpp,
      });

      const result = await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_WON',
      });

      expect(result.isWon).toBe(true);
      expect(ctx.services!.opportunity!.markAsWon).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        expect.any(String)
      );
    });

    it('should mark as lost when targetStage is CLOSED_LOST with reason', async () => {
      const mockDomainOpp = createMockDomainOpportunity({
        stage: 'CLOSED_LOST',
        probability: { value: 0 },
        isClosed: true,
        isLost: true,
      });

      ctx.services!.opportunity!.markAsLost = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainOpp,
      });

      const result = await caller.moveStage({
        id: TEST_UUIDS.opportunity1,
        targetStage: 'CLOSED_LOST',
        reason: 'Lost to competitor pricing',
      });

      expect(result.isLost).toBe(true);
      expect(ctx.services!.opportunity!.markAsLost).toHaveBeenCalledWith(
        TEST_UUIDS.opportunity1,
        'Lost to competitor pricing',
        expect.any(String)
      );
    });

    it('should reject invalid stage transition with BAD_REQUEST', async () => {
      ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid stage transition' },
      });

      await expect(
        caller.moveStage({ id: TEST_UUIDS.opportunity1, targetStage: 'PROPOSAL' })
      ).rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      ctx.services!.opportunity!.changeStage = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Opportunity not found' },
      });

      await expect(
        caller.moveStage({ id: TEST_UUIDS.nonExistent, targetStage: 'NEGOTIATION' })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });

    it('should throw BAD_REQUEST for CLOSED_LOST without reason', async () => {
      ctx.services!.opportunity!.markAsLost = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Reason is required and must be at least 10 characters',
        },
      });

      await expect(
        caller.moveStage({ id: TEST_UUIDS.opportunity1, targetStage: 'CLOSED_LOST', reason: '' })
      ).rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });
  });

  describe('getHistory', () => {
    const mockEvents = [
      {
        id: 'evt-1',
        opportunityId: TEST_UUIDS.opportunity1,
        type: 'STAGE_CHANGE',
        timestamp: new Date('2024-06-15T10:00:00Z'),
        data: {},
      },
      {
        id: 'evt-2',
        opportunityId: TEST_UUIDS.opportunity1,
        type: 'NOTE',
        timestamp: new Date('2024-06-14T10:00:00Z'),
        data: {},
      },
      {
        id: 'evt-3',
        opportunityId: TEST_UUIDS.opportunity1,
        type: 'CALL',
        timestamp: new Date('2024-06-13T10:00:00Z'),
        data: {},
      },
    ];

    it('should return paginated activity events', async () => {
      (prismaMock.activityEvent as any).findMany.mockResolvedValue(mockEvents);

      const result = await caller.getHistory({
        opportunityId: TEST_UUIDS.opportunity1,
        limit: 20,
      });

      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should support cursor-based pagination with hasMore', async () => {
      // Return limit+1 items to trigger hasMore
      const manyEvents = Array.from({ length: 21 }, (_, i) => ({
        id: `evt-${i}`,
        opportunityId: TEST_UUIDS.opportunity1,
        type: 'NOTE',
        timestamp: new Date(Date.now() - i * 3600000),
        data: {},
      }));

      (prismaMock.activityEvent as any).findMany.mockResolvedValue(manyEvents);

      const result = await caller.getHistory({
        opportunityId: TEST_UUIDS.opportunity1,
        limit: 20,
      });

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('should filter by event type', async () => {
      (prismaMock.activityEvent as any).findMany.mockResolvedValue([]);

      await caller.getHistory({
        opportunityId: TEST_UUIDS.opportunity1,
        types: ['STAGE_CHANGE', 'NOTE'],
      });

      expect((prismaMock.activityEvent as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: ['STAGE_CHANGE', 'NOTE'] },
          }),
        })
      );
    });

    it('should return empty items for opportunity with no events', async () => {
      (prismaMock.activityEvent as any).findMany.mockResolvedValue([]);

      const result = await caller.getHistory({
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should apply cursor timestamp for pagination', async () => {
      (prismaMock.activityEvent as any).findMany.mockResolvedValue([]);

      await caller.getHistory({
        opportunityId: TEST_UUIDS.opportunity1,
        cursor: '2024-06-15T10:00:00.000Z',
      });

      expect((prismaMock.activityEvent as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: { lt: new Date('2024-06-15T10:00:00.000Z') },
          }),
        })
      );
    });
  });

  describe('getProducts', () => {
    it('should return products with calculated total value', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          opportunityId: TEST_UUIDS.opportunity1,
          name: 'Product A',
          quantity: 2,
          unitPrice: new Prisma.Decimal(10000),
          totalPrice: new Prisma.Decimal(25000),
          createdAt: new Date(),
        },
        {
          id: 'prod-2',
          opportunityId: TEST_UUIDS.opportunity1,
          name: 'Product B',
          quantity: 1,
          unitPrice: new Prisma.Decimal(15000),
          totalPrice: new Prisma.Decimal(15000),
          createdAt: new Date(),
        },
      ];

      (prismaMock.dealProduct as any).findMany.mockResolvedValue(mockProducts);

      const result = await caller.getProducts({
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect(result.products).toHaveLength(2);
      expect(result.totalValue).toBe(40000);
    });

    it('should return empty array with totalValue=0 when no products', async () => {
      (prismaMock.dealProduct as any).findMany.mockResolvedValue([]);

      const result = await caller.getProducts({
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect(result.products).toEqual([]);
      expect(result.totalValue).toBe(0);
    });

    it('should order products by createdAt ascending', async () => {
      (prismaMock.dealProduct as any).findMany.mockResolvedValue([]);

      await caller.getProducts({
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect((prismaMock.dealProduct as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        })
      );
    });

    it('should calculate totalValue as sum of all totalPrice', async () => {
      const mockProducts = [
        { id: 'prod-1', totalPrice: new Prisma.Decimal(10000), createdAt: new Date() },
        { id: 'prod-2', totalPrice: new Prisma.Decimal(20000), createdAt: new Date() },
        { id: 'prod-3', totalPrice: new Prisma.Decimal(30000), createdAt: new Date() },
      ];

      (prismaMock.dealProduct as any).findMany.mockResolvedValue(mockProducts);

      const result = await caller.getProducts({
        opportunityId: TEST_UUIDS.opportunity1,
      });

      expect(result.totalValue).toBe(60000);
    });
  });

  describe('getPipeline', () => {
    const mockStageConfigs = [
      {
        stageKey: 'PROSPECTING',
        displayName: 'Prospecting',
        color: '#94a3b8',
        order: 0,
        probability: 10,
        tenantId: 'test-tenant-id',
      },
      {
        stageKey: 'QUALIFICATION',
        displayName: 'Qualification',
        color: '#60a5fa',
        order: 1,
        probability: 20,
        tenantId: 'test-tenant-id',
      },
      {
        stageKey: 'NEEDS_ANALYSIS',
        displayName: 'Needs Analysis',
        color: '#38bdf8',
        order: 2,
        probability: 30,
        tenantId: 'test-tenant-id',
      },
      {
        stageKey: 'PROPOSAL',
        displayName: 'Proposal',
        color: '#fb923c',
        order: 3,
        probability: 70,
        tenantId: 'test-tenant-id',
      },
      {
        stageKey: 'NEGOTIATION',
        displayName: 'Negotiation',
        color: '#facc15',
        order: 4,
        probability: 80,
        tenantId: 'test-tenant-id',
      },
    ];

    const mockGroupBy = [
      {
        stage: 'PROSPECTING',
        _count: 5,
        _sum: { value: new Prisma.Decimal(100000) },
        _avg: { probability: 10 },
      },
      {
        stage: 'PROPOSAL',
        _count: 3,
        _sum: { value: new Prisma.Decimal(200000) },
        _avg: { probability: 70 },
      },
    ];

    it('should return stages with opportunity counts and values', async () => {
      (prismaMock.pipelineStageConfig as any).findMany.mockResolvedValue(mockStageConfigs);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue(
        mockGroupBy as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>
      );

      const result = await caller.getPipeline({});

      expect(result.stages.length).toBe(5); // Excludes CLOSED_WON, CLOSED_LOST
      expect(result.totalOpportunities).toBe(8); // 5 + 3
      const prospecting = result.stages.find((s) => s.stageKey === 'PROSPECTING');
      expect(prospecting?.count).toBe(5);
      expect(prospecting?.totalValue).toBe('100000');
    });

    it('should exclude closed stages by default', async () => {
      (prismaMock.pipelineStageConfig as any).findMany.mockResolvedValue(mockStageConfigs);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue(
        mockGroupBy as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>
      );

      const result = await caller.getPipeline({});

      const stageKeys = result.stages.map((s) => s.stageKey);
      expect(stageKeys).not.toContain('CLOSED_WON');
      expect(stageKeys).not.toContain('CLOSED_LOST');
    });

    it('should include closed stages when includeClosedStages=true', async () => {
      const allConfigs = [
        ...mockStageConfigs,
        {
          stageKey: 'CLOSED_WON',
          displayName: 'Closed Won',
          color: '#22c55e',
          order: 5,
          probability: 100,
          tenantId: 'test-tenant-id',
        },
        {
          stageKey: 'CLOSED_LOST',
          displayName: 'Closed Lost',
          color: '#ef4444',
          order: 6,
          probability: 0,
          tenantId: 'test-tenant-id',
        },
      ];

      (prismaMock.pipelineStageConfig as any).findMany.mockResolvedValue(allConfigs);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue(
        mockGroupBy as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>
      );

      const result = await caller.getPipeline({ includeClosedStages: true });

      const stageKeys = result.stages.map((s) => s.stageKey);
      expect(stageKeys).toContain('CLOSED_WON');
      expect(stageKeys).toContain('CLOSED_LOST');
      expect(result.stages.length).toBe(7);
    });

    it('should handle empty pipeline (zero opportunities)', async () => {
      (prismaMock.pipelineStageConfig as any).findMany.mockResolvedValue([]);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>
      );

      const result = await caller.getPipeline({});

      expect(result.totalOpportunities).toBe(0);
      expect(result.totalPipelineValue).toBe('0');
      result.stages.forEach((s) => {
        expect(s.count).toBe(0);
        expect(s.totalValue).toBe('0');
      });
    });

    it('should use stage config for display names and colors', async () => {
      const customConfigs = [
        {
          stageKey: 'PROSPECTING',
          displayName: 'Lead Generation',
          color: '#ff0000',
          order: 0,
          probability: 15,
          tenantId: 'test-tenant-id',
        },
      ];

      (prismaMock.pipelineStageConfig as any).findMany.mockResolvedValue(customConfigs);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof prismaMock.opportunity.groupBy>>
      );

      const result = await caller.getPipeline({});

      const prospecting = result.stages.find((s) => s.stageKey === 'PROSPECTING');
      expect(prospecting?.displayName).toBe('Lead Generation');
      expect(prospecting?.color).toBe('#ff0000');
      expect(prospecting?.probability).toBe(15);
    });
  });
});
