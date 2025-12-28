import { TEST_UUIDS } from '../../../test/setup';
/**
 * Opportunity Router Tests
 *
 * Comprehensive tests for all opportunity router procedures:
 * - create, getById, list, update, delete, stats, forecast
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

describe('Opportunity Router', () => {
  const caller = opportunityRouter.createCaller(createTestContext());

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new opportunity with valid input', async () => {
      const input = {
        name: 'New Deal',
        value: 75000,
        stage: 'PROPOSAL' as const,
        probability: 50,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.account1,
        contactId: TEST_UUIDS.contact1,
      };

      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.opportunity.create.mockResolvedValue({
        ...mockOpportunity,
        ...input,
        value: new Prisma.Decimal(input.value),
      });

      const result = await caller.create(input);

      expect(result.name).toBe(input.name);
      expect(Number(result.value)).toBe(input.value);
      expect(prismaMock.opportunity.create).toHaveBeenCalledWith({
        data: {
          ...input,
          ownerId: TEST_UUIDS.user1,
        },
      });
    });

    it('should throw NOT_FOUND if account does not exist', async () => {
      const input = {
        name: 'Deal',
        value: 50000,
        stage: 'PROPOSAL' as const,
        probability: 60,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.nonExistent,
      };

      prismaMock.account.findUnique.mockResolvedValue(null);

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
        value: 50000,
        stage: 'PROPOSAL' as const,
        probability: 60,
        expectedCloseDate: new Date('2025-06-30'),
        accountId: TEST_UUIDS.account1,
        contactId: TEST_UUIDS.nonExistent,
      };

      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.contact.findUnique.mockResolvedValue(null);

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
      const opportunityWithRelations = {
        ...mockOpportunity,
        owner: mockUser,
        account: mockAccount,
        contact: mockContact,
        tasks: [mockTask],
      };

      prismaMock.opportunity.findUnique.mockResolvedValue(opportunityWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.opportunity1 });

      expect(result).toMatchObject(opportunityWithRelations);
      expect(prismaMock.opportunity.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.opportunity1 },
        include: expect.objectContaining({
          owner: expect.any(Object),
          account: expect.any(Object),
          contact: expect.any(Object),
          tasks: expect.any(Object),
        }),
      });
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('list', () => {
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
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity as any);

      const updated = { ...mockOpportunity, stage: 'NEGOTIATION' as const, probability: 70 };
      prismaMock.opportunity.update.mockResolvedValue(updated as any);

      const result = await caller.update({
        id: TEST_UUIDS.opportunity1,
        stage: 'NEGOTIATION',
        probability: 70,
      });

      expect(result.stage).toBe('NEGOTIATION');
      expect(result.probability).toBe(70);
    });

    it('should throw NOT_FOUND when updating non-existent opportunity', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.nonExistent, stage: 'CLOSED_WON' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should validate account exists when updating accountId', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.account.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.opportunity1, accountId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Account'),
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing opportunity', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.opportunity.delete.mockResolvedValue(mockOpportunity);

      const result = await caller.delete({ id: TEST_UUIDS.opportunity1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.opportunity1);
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
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

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith({
        where: {
          stage: {
            notIn: ['CLOSED_WON', 'CLOSED_LOST'],
          },
        },
        select: expect.any(Object),
      });
    });

    it('should handle empty pipeline', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);

      const result = await caller.forecast();

      expect(result.totalOpportunities).toBe(0);
      expect(result.weightedValue).toBe('0');
    });
  });
});
