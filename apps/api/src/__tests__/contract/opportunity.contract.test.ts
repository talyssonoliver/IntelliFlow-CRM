/**
 * Opportunity Router Contract Tests (IFC-129)
 *
 * Verifies the tRPC API contract for opportunity/deal operations:
 * - Input/output type validation
 * - Stage progression contracts
 * - Value and probability contracts
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { opportunityRouter } from '../../modules/opportunity/opportunity.router';
import {
  prismaMock,
  createTestContext,
  mockOpportunity,
  mockAccount,
  mockContact,
  mockUser,
  mockTask,
  TEST_UUIDS,
} from '../../test/setup';

/**
 * Opportunity stages contract
 */
const opportunityStages = [
  'PROSPECTING',
  'QUALIFICATION',
  'PROPOSAL',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const;

/**
 * Opportunity list response contract
 */
const opportunityListResponseSchema = z.object({
  opportunities: z.array(z.any()),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

/**
 * Opportunity stats response contract
 */
const opportunityStatsResponseSchema = z.object({
  total: z.number().int().min(0),
  byStage: z.record(
    z.object({
      count: z.number().int().min(0),
      totalValue: z.string(),
    })
  ),
  totalValue: z.string(),
  averageProbability: z.number().min(0).max(100),
});

/**
 * Forecast response contract
 */
const forecastResponseSchema = z.object({
  totalOpportunities: z.number().int().min(0),
  weightedValue: z.string(),
});

describe('Opportunity Router Contract Tests', () => {
  const caller = opportunityRouter.createCaller(createTestContext());

  describe('create - Input Contract', () => {
    it('should require name, value, stage, probability, expectedCloseDate, and accountId', async () => {
      const validInput = {
        name: 'Enterprise Deal',
        value: 50000,
        stage: 'PROPOSAL' as const,
        probability: 60,
        expectedCloseDate: new Date('2025-12-31'),
        accountId: TEST_UUIDS.account1,
      };

      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.opportunity.create.mockResolvedValue({
        ...mockOpportunity,
        ...validInput,
        value: new Prisma.Decimal(validInput.value),
      });

      const result = await caller.create(validInput);

      expect(result.name).toBe(validInput.name);
      expect(Number(result.value)).toBe(validInput.value);
      expect(result.stage).toBe(validInput.stage);
    });

    it('should accept all valid stage enum values', async () => {
      for (const stage of opportunityStages) {
        const input = {
          name: `Deal for ${stage}`,
          value: 10000,
          stage,
          probability: 50,
          expectedCloseDate: new Date('2025-12-31'),
          accountId: TEST_UUIDS.account1,
        };

        prismaMock.account.findUnique.mockResolvedValue(mockAccount);
        prismaMock.opportunity.create.mockResolvedValue({
          ...mockOpportunity,
          ...input,
          value: new Prisma.Decimal(input.value),
        });

        const result = await caller.create(input);
        expect(result.stage).toBe(stage);
      }
    });

    it('should enforce probability range 0-100', async () => {
      const inputWithInvalidProbability = {
        name: 'Deal',
        value: 10000,
        stage: 'PROPOSAL' as const,
        probability: 150, // Invalid
        expectedCloseDate: new Date('2025-12-31'),
        accountId: TEST_UUIDS.account1,
      };

      await expect(caller.create(inputWithInvalidProbability as any)).rejects.toThrow();
    });

    it('should enforce positive value', async () => {
      const inputWithNegativeValue = {
        name: 'Deal',
        value: -1000,
        stage: 'PROPOSAL' as const,
        probability: 50,
        expectedCloseDate: new Date('2025-12-31'),
        accountId: TEST_UUIDS.account1,
      };

      await expect(caller.create(inputWithNegativeValue as any)).rejects.toThrow();
    });

    it('should validate accountId exists', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);

      try {
        await caller.create({
          name: 'Deal',
          value: 10000,
          stage: 'PROPOSAL',
          probability: 50,
          expectedCloseDate: new Date('2025-12-31'),
          accountId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Account');
      }
    });

    it('should validate contactId if provided', async () => {
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.contact.findUnique.mockResolvedValue(null);

      try {
        await caller.create({
          name: 'Deal',
          value: 10000,
          stage: 'PROPOSAL',
          probability: 50,
          expectedCloseDate: new Date('2025-12-31'),
          accountId: TEST_UUIDS.account1,
          contactId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Contact');
      }
    });
  });

  describe('create - Output Contract', () => {
    it('should return opportunity with all required fields', async () => {
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.opportunity.create.mockResolvedValue(mockOpportunity);

      const result = await caller.create({
        name: 'New Deal',
        value: 50000,
        stage: 'PROPOSAL',
        probability: 60,
        expectedCloseDate: new Date('2025-12-31'),
        accountId: TEST_UUIDS.account1,
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('stage');
      expect(result).toHaveProperty('probability');
      expect(result).toHaveProperty('expectedCloseDate');
      expect(result).toHaveProperty('accountId');
      expect(result).toHaveProperty('ownerId');
    });

    it('should return value as Decimal', async () => {
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.opportunity.create.mockResolvedValue(mockOpportunity);

      const result = await caller.create({
        name: 'Deal',
        value: 50000,
        stage: 'PROPOSAL',
        probability: 60,
        expectedCloseDate: new Date('2025-12-31'),
        accountId: TEST_UUIDS.account1,
      });

      // Value should be convertible to number
      expect(Number(result.value)).toBe(50000);
    });
  });

  describe('getById - Contract', () => {
    it('should require valid UUID', async () => {
      await expect(caller.getById({ id: 'invalid' })).rejects.toThrow();
    });

    it('should return opportunity with relations', async () => {
      const opportunityWithRelations = {
        ...mockOpportunity,
        owner: mockUser,
        account: mockAccount,
        contact: mockContact,
        tasks: [mockTask],
      };

      prismaMock.opportunity.findUnique.mockResolvedValue(opportunityWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.opportunity1 });

      expect(result).toHaveProperty('owner');
      expect(result).toHaveProperty('account');
      expect(result).toHaveProperty('contact');
      expect(result).toHaveProperty('tasks');
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      try {
        await caller.getById({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('list - Contract', () => {
    beforeEach(() => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);
      prismaMock.opportunity.count.mockResolvedValue(0);
    });

    it('should return paginated response', async () => {
      const result = await caller.list({});

      const parseResult = opportunityListResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);
    });

    it('should accept stage filter with array of stages', async () => {
      await caller.list({ stage: ['PROPOSAL', 'NEGOTIATION'] });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stage: { in: ['PROPOSAL', 'NEGOTIATION'] },
          }),
        })
      );
    });

    it('should accept value range filters', async () => {
      await caller.list({ minValue: 10000, maxValue: 100000 });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            value: { gte: 10000, lte: 100000 },
          }),
        })
      );
    });

    it('should accept probability range filters', async () => {
      await caller.list({ minProbability: 50, maxProbability: 80 });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            probability: { gte: 50, lte: 80 },
          }),
        })
      );
    });

    it('should accept date range filters', async () => {
      const dateFrom = new Date('2025-01-01');
      const dateTo = new Date('2025-12-31');

      await caller.list({ dateFrom, dateTo });

      expect(prismaMock.opportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            expectedCloseDate: { gte: dateFrom, lte: dateTo },
          }),
        })
      );
    });

    it('should enforce pagination limits', async () => {
      await expect(caller.list({ page: 0 })).rejects.toThrow();
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });
  });

  describe('update - Contract', () => {
    it('should require id for update', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.update({ name: 'Updated' })).rejects.toThrow();
    });

    it('should accept partial updates', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.opportunity.update.mockResolvedValue({
        ...mockOpportunity,
        stage: 'NEGOTIATION' as const,
      });

      const result = await caller.update({
        id: TEST_UUIDS.opportunity1,
        stage: 'NEGOTIATION',
      });

      expect(result.stage).toBe('NEGOTIATION');
    });

    it('should allow stage progression', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);

      for (const stage of opportunityStages) {
        prismaMock.opportunity.update.mockResolvedValue({
          ...mockOpportunity,
          stage,
        });

        const result = await caller.update({
          id: TEST_UUIDS.opportunity1,
          stage,
        });

        expect(result.stage).toBe(stage);
      }
    });

    it('should validate accountId on update', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.account.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: TEST_UUIDS.opportunity1,
          accountId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Account');
      }
    });

    it('should validate contactId on update', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.contact.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: TEST_UUIDS.opportunity1,
          contactId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Contact');
      }
    });
  });

  describe('delete - Contract', () => {
    it('should return success response', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(mockOpportunity);
      prismaMock.opportunity.delete.mockResolvedValue(mockOpportunity);

      const result = await caller.delete({ id: TEST_UUIDS.opportunity1 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('id');
      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.opportunity1);
    });

    it('should throw NOT_FOUND for non-existent opportunity', async () => {
      prismaMock.opportunity.findUnique.mockResolvedValue(null);

      try {
        await caller.delete({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('stats - Contract', () => {
    it('should return stats matching contract', async () => {
      prismaMock.opportunity.count.mockResolvedValue(50);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([
        { stage: 'PROPOSAL', _count: 15, _sum: { value: new Prisma.Decimal(500000) } },
        { stage: 'NEGOTIATION', _count: 10, _sum: { value: new Prisma.Decimal(300000) } },
      ] as any);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: new Prisma.Decimal(2000000) },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _avg: { probability: 65.5 },
      } as any);

      const result = await caller.stats();

      const parseResult = opportunityStatsResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byStage');
      expect(result).toHaveProperty('totalValue');
      expect(result).toHaveProperty('averageProbability');
    });

    it('should return totalValue as string', async () => {
      prismaMock.opportunity.count.mockResolvedValue(10);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([]);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: new Prisma.Decimal(1000000) },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _avg: { probability: 50 },
      } as any);

      const result = await caller.stats();

      expect(typeof result.totalValue).toBe('string');
    });

    it('should handle zero values correctly', async () => {
      prismaMock.opportunity.count.mockResolvedValue(0);
      vi.mocked(prismaMock.opportunity.groupBy).mockResolvedValue([]);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _sum: { value: null },
      } as any);
      prismaMock.opportunity.aggregate.mockResolvedValueOnce({
        _avg: { probability: null },
      } as any);

      const result = await caller.stats();

      expect(result.totalValue).toBe('0');
      expect(result.averageProbability).toBe(0);
    });
  });

  describe('forecast - Contract', () => {
    it('should return forecast matching contract', async () => {
      const forecastData = [
        { value: new Prisma.Decimal(100000), probability: 80, stage: 'NEGOTIATION' as const },
        { value: new Prisma.Decimal(50000), probability: 60, stage: 'PROPOSAL' as const },
      ];

      prismaMock.opportunity.findMany.mockResolvedValue(forecastData as any);

      const result = await caller.forecast();

      const parseResult = forecastResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('totalOpportunities');
      expect(result).toHaveProperty('weightedValue');
    });

    it('should calculate weighted value correctly', async () => {
      const forecastData = [
        { value: new Prisma.Decimal(100000), probability: 50, stage: 'PROPOSAL' as const },
      ];

      prismaMock.opportunity.findMany.mockResolvedValue(forecastData as any);

      const result = await caller.forecast();

      // 100000 * 0.5 = 50000
      expect(result.weightedValue).toBe('50000');
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

    it('should return weightedValue as string', async () => {
      prismaMock.opportunity.findMany.mockResolvedValue([]);

      const result = await caller.forecast();

      expect(typeof result.weightedValue).toBe('string');
    });
  });
});
