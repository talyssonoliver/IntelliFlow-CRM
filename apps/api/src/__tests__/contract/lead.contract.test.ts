/**
 * Lead Router Contract Tests (IFC-129)
 *
 * Verifies the tRPC API contract for lead operations:
 * - Input/output type validation
 * - Error response contracts
 * - Pagination contract
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { leadRouter } from '../../modules/lead/lead.router';
import {
  prismaMock,
  createTestContext,
  mockLead,
  mockUser,
  mockContact,
  mockAccount,
  mockTask,
  mockAIScore,
  TEST_UUIDS,
} from '../../test/setup';

/**
 * Lead entity contract schema
 * Defines the expected shape of a lead response
 */
const leadResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  source: z.enum(['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER']),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST']),
  score: z.number().min(0).max(100),
  ownerId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Lead list response contract schema
 */
const leadListResponseSchema = z.object({
  leads: z.array(z.any()), // Lead objects with relations
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

/**
 * Lead stats response contract schema
 */
const leadStatsResponseSchema = z.object({
  total: z.number().int().min(0),
  byStatus: z.record(z.number().int().min(0)),
  averageScore: z.number().min(0).max(100),
});

describe('Lead Router Contract Tests', () => {
  const caller = leadRouter.createCaller(createTestContext());

  describe('create - Input Contract', () => {
    it('should accept valid lead creation input', async () => {
      const validInput = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        phone: '+1234567890',
        source: 'WEBSITE' as const,
      };

      prismaMock.lead.create.mockResolvedValue({
        ...mockLead,
        ...validInput,
      });

      const result = await caller.create(validInput);

      // Verify response matches contract
      expect(result.email).toBe(validInput.email);
      expect(result.firstName).toBe(validInput.firstName);
      expect(result.source).toBe(validInput.source);
    });

    it('should enforce email format in input contract', async () => {
      const invalidInput = {
        email: 'not-an-email',
        source: 'WEBSITE' as const,
      };

      // Should throw validation error
      await expect(caller.create(invalidInput as any)).rejects.toThrow();
    });

    it('should accept all valid source enum values', async () => {
      const sources = ['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER'] as const;

      for (const source of sources) {
        const input = { email: `test-${source.toLowerCase()}@example.com`, source };

        prismaMock.lead.create.mockResolvedValue({
          ...mockLead,
          email: input.email,
          source,
        });

        const result = await caller.create(input);
        expect(result.source).toBe(source);
      }
    });
  });

  describe('create - Output Contract', () => {
    it('should return lead with all required fields', async () => {
      prismaMock.lead.create.mockResolvedValue(mockLead);

      const result = await caller.create({
        email: 'test@example.com',
        source: 'WEBSITE',
      });

      // Verify all required fields are present
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('ownerId');
      expect(result).toHaveProperty('createdAt');
    });

    it('should return status as NEW for new leads', async () => {
      prismaMock.lead.create.mockResolvedValue({
        ...mockLead,
        status: 'NEW' as const,
      });

      const result = await caller.create({
        email: 'new@example.com',
        source: 'WEBSITE',
      });

      expect(result.status).toBe('NEW');
    });

    it('should return initial score as 0', async () => {
      prismaMock.lead.create.mockResolvedValue({
        ...mockLead,
        score: 0,
      });

      const result = await caller.create({
        email: 'new@example.com',
        source: 'WEBSITE',
      });

      expect(result.score).toBe(0);
    });
  });

  describe('getById - Contract', () => {
    it('should require valid UUID for id parameter', async () => {
      await expect(caller.getById({ id: 'not-a-uuid' })).rejects.toThrow();
    });

    it('should return lead with relations when found', async () => {
      const leadWithRelations = {
        ...mockLead,
        owner: mockUser,
        contact: mockContact,
        aiScores: [mockAIScore],
        tasks: [mockTask],
      };

      prismaMock.lead.findUnique.mockResolvedValue(leadWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.lead1 });

      // Verify response includes relations
      expect(result).toHaveProperty('owner');
      expect(result).toHaveProperty('contact');
      expect(result).toHaveProperty('aiScores');
      expect(result).toHaveProperty('tasks');
    });

    it('should throw NOT_FOUND error with correct code', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      try {
        await caller.getById({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('not found');
      }
    });
  });

  describe('list - Contract', () => {
    beforeEach(() => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);
    });

    it('should return paginated response structure', async () => {
      const result = await caller.list({});

      const parseResult = leadListResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('leads');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('hasMore');
    });

    it('should accept valid filter parameters', async () => {
      // Should not throw with valid filters
      await caller.list({
        page: 1,
        limit: 20,
        status: ['NEW', 'QUALIFIED'],
        minScore: 50,
        maxScore: 100,
        search: 'test',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(prismaMock.lead.findMany).toHaveBeenCalled();
    });

    it('should enforce valid status enum values in filter', async () => {
      // This should still work because the router validates input
      await expect(
        caller.list({ status: ['INVALID_STATUS' as any] })
      ).rejects.toThrow();
    });

    it('should enforce pagination limits', async () => {
      // Page must be positive
      await expect(caller.list({ page: 0 })).rejects.toThrow();

      // Limit must be positive
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });

    it('should return hasMore correctly based on pagination', async () => {
      prismaMock.lead.findMany.mockResolvedValue([mockLead]);
      prismaMock.lead.count.mockResolvedValue(10);

      const result = await caller.list({ page: 1, limit: 5 });

      // With 10 total and limit 5, there should be more
      expect(result.hasMore).toBe(true);
    });
  });

  describe('update - Contract', () => {
    it('should require id in update input', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.update({ firstName: 'Updated' })).rejects.toThrow();
    });

    it('should accept partial updates', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.lead.update.mockResolvedValue({
        ...mockLead,
        firstName: 'Updated',
      });

      const result = await caller.update({
        id: TEST_UUIDS.lead1,
        firstName: 'Updated',
      });

      expect(result.firstName).toBe('Updated');
    });

    it('should validate status transitions', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.lead.update.mockResolvedValue({
        ...mockLead,
        status: 'QUALIFIED' as const,
      });

      const result = await caller.update({
        id: TEST_UUIDS.lead1,
        status: 'QUALIFIED',
      });

      expect(result.status).toBe('QUALIFIED');
    });
  });

  describe('delete - Contract', () => {
    it('should return success structure on delete', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.lead.delete.mockResolvedValue(mockLead);

      const result = await caller.delete({ id: TEST_UUIDS.lead1 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('id');
      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.lead1);
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      try {
        await caller.delete({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('qualify - Contract', () => {
    it('should require leadId and reason', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.qualify({ leadId: TEST_UUIDS.lead1 })).rejects.toThrow();
    });

    it('should return qualified lead', async () => {
      // Lead must have status other than QUALIFIED
      prismaMock.lead.findUnique.mockResolvedValue({
        ...mockLead,
        status: 'NEW' as const,
      });
      prismaMock.lead.update.mockResolvedValue({
        ...mockLead,
        status: 'QUALIFIED' as const,
      });
      prismaMock.task.create.mockResolvedValue(mockTask);

      const result = await caller.qualify({
        leadId: TEST_UUIDS.lead1,
        reason: 'Good fit for our product',
      });

      expect(result.status).toBe('QUALIFIED');
    });

    it('should throw BAD_REQUEST if already qualified', async () => {
      prismaMock.lead.findUnique.mockResolvedValue({
        ...mockLead,
        status: 'QUALIFIED' as const,
      });

      try {
        await caller.qualify({ leadId: TEST_UUIDS.lead1, reason: 'Test' });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('convert - Contract', () => {
    it('should return lead, contact, and optional accountId', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);

      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback({
          account: { create: async () => mockAccount },
          contact: { create: async () => mockContact },
          lead: { update: async () => ({ ...mockLead, status: 'CONVERTED' as const }) },
        } as any);
      });

      const result = await caller.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: true,
        accountName: 'Test Corp',
      });

      expect(result).toHaveProperty('lead');
      expect(result).toHaveProperty('contact');
      expect(result.lead.status).toBe('CONVERTED');
    });
  });

  describe('scoreWithAI - Contract', () => {
    it('should return score response with required fields', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.aIScore.create.mockResolvedValue(mockAIScore);
      prismaMock.lead.update.mockResolvedValue({ ...mockLead, score: 80 });

      const result = await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

      expect(result).toHaveProperty('leadId');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.score).toBe('number');
      expect(typeof result.confidence).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('stats - Contract', () => {
    it('should return stats response matching contract', async () => {
      prismaMock.lead.count.mockResolvedValue(100);
      vi.mocked(prismaMock.lead.groupBy).mockResolvedValue([
        { status: 'NEW', _count: 50 },
        { status: 'QUALIFIED', _count: 30 },
      ] as any);
      prismaMock.lead.aggregate.mockResolvedValue({
        _avg: { score: 75 },
      } as any);

      const result = await caller.stats();

      const parseResult = leadStatsResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('averageScore');
      expect(typeof result.total).toBe('number');
      expect(typeof result.averageScore).toBe('number');
    });
  });
});
