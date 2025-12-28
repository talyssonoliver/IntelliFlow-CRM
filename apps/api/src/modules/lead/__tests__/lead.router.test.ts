import { TEST_UUIDS } from '../../../test/setup';
/**
 * Lead Router Tests
 *
 * Comprehensive tests for all lead router procedures:
 * - create, getById, list, update, delete
 * - qualify, convert, scoreWithAI, stats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { leadRouter } from '../lead.router';
import {
  prismaMock,
  createTestContext,
  mockLead,
  mockUser,
  mockContact,
  mockAccount,
  mockTask,
  mockAIScore,
} from '../../../test/setup';

describe('Lead Router', () => {
  const caller = leadRouter.createCaller(createTestContext());

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new lead with valid input', async () => {
      const input = {
        email: 'newlead@example.com',
        firstName: 'Alice',
        lastName: 'Johnson',
        company: 'StartupCo',
        phone: '+1987654321',
        source: 'WEBSITE' as const,
      };

      const expected = {
        ...mockLead,
        ...input,
        status: 'NEW' as const,
        score: 0,
      };

      prismaMock.lead.create.mockResolvedValue(expected);

      const result = await caller.create(input);

      expect(result).toMatchObject(expected);
      expect(prismaMock.lead.create).toHaveBeenCalledWith({
        data: {
          ...input,
          ownerId: TEST_UUIDS.user1,
          status: 'NEW',
          score: 0,
        },
      });
    });

    it('should throw for invalid email', async () => {
      const input = {
        email: 'invalid-email',
        phone: '+1234567890',
        source: 'WEBSITE' as const,
      };

      await expect(caller.create(input as any)).rejects.toThrow();
    });
  });

  describe('getById', () => {
    it('should return lead with related data', async () => {
      const leadWithRelations = {
        ...mockLead,
        owner: mockUser,
        contact: mockContact,
        aiScores: [mockAIScore],
        tasks: [mockTask],
      };

      prismaMock.lead.findUnique.mockResolvedValue(leadWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.lead1 });

      expect(result).toMatchObject(leadWithRelations);
      expect(prismaMock.lead.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.lead1 },
        include: {
          owner: { select: { id: true, email: true, name: true, avatarUrl: true } },
          contact: true,
          aiScores: { orderBy: { createdAt: 'desc' }, take: 5 },
          tasks: { where: { status: { not: 'COMPLETED' } }, orderBy: { dueDate: 'asc' } },
        },
      });
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found'),
        })
      );
    });
  });

  describe('list', () => {
    it('should list leads with pagination', async () => {
      const leads = [mockLead, { ...mockLead, id: TEST_UUIDS.lead2, email: 'lead2@example.com' }];
      const leadsWithRelations = leads.map((lead) => ({
        ...lead,
        owner: mockUser,
        contact: mockContact,
      }));

      prismaMock.lead.findMany.mockResolvedValue(leadsWithRelations);
      prismaMock.lead.count.mockResolvedValue(10);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.leads).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true); // skip(0) + leads.length(2) < total(10)
    });

    it('should filter leads by status', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ status: ['QUALIFIED', 'CONVERTED'] });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['QUALIFIED', 'CONVERTED'] },
          }),
        })
      );
    });

    it('should filter leads by score range', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ minScore: 70, maxScore: 90 });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            score: { gte: 70, lte: 90 },
          }),
        })
      );
    });

    it('should search leads by text', async () => {
      prismaMock.lead.findMany.mockResolvedValue([]);
      prismaMock.lead.count.mockResolvedValue(0);

      await caller.list({ search: 'ACME' });

      expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'ACME', mode: 'insensitive' } },
              { firstName: { contains: 'ACME', mode: 'insensitive' } },
              { lastName: { contains: 'ACME', mode: 'insensitive' } },
              { company: { contains: 'ACME', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('should update lead with valid data', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);

      const updated = { ...mockLead, firstName: 'Updated', status: 'CONTACTED' as const };
      prismaMock.lead.update.mockResolvedValue(updated);

      const result = await caller.update({
        id: TEST_UUIDS.lead1,
        firstName: 'Updated',
        status: 'CONTACTED',
      });

      expect(result.firstName).toBe('Updated');
      expect(result.status).toBe('CONTACTED');
    });

    it('should throw NOT_FOUND when updating non-existent lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.nonExistent, firstName: 'Test' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.lead.delete.mockResolvedValue(mockLead);

      const result = await caller.delete({ id: TEST_UUIDS.lead1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.lead1);
      expect(prismaMock.lead.delete).toHaveBeenCalledWith({ where: { id: TEST_UUIDS.lead1 } });
    });

    it('should throw NOT_FOUND when deleting non-existent lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('qualify', () => {
    it('should qualify a lead and create follow-up task', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);

      const qualified = { ...mockLead, status: 'QUALIFIED' as const };
      prismaMock.lead.update.mockResolvedValue(qualified);
      prismaMock.task.create.mockResolvedValue(mockTask);

      const result = await caller.qualify({
        leadId: TEST_UUIDS.lead1,
        reason: 'Strong fit for enterprise package, budget confirmed',
      });

      expect(result.status).toBe('QUALIFIED');
      expect(prismaMock.lead.update).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.lead1 },
        data: { status: 'QUALIFIED' },
      });
      expect(prismaMock.task.create).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(
        caller.qualify({ leadId: TEST_UUIDS.nonExistent, reason: 'Good fit for our product' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw BAD_REQUEST if lead already qualified', async () => {
      const qualifiedLead = { ...mockLead, status: 'QUALIFIED' as const };
      prismaMock.lead.findUnique.mockResolvedValue(qualifiedLead);

      await expect(
        caller.qualify({ leadId: TEST_UUIDS.lead1, reason: 'Already qualified' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('already qualified'),
        })
      );
    });
  });

  describe('convert', () => {
    it('should convert lead to contact and create account', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);

      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback({
          account: {
            create: async () => mockAccount,
          },
          contact: {
            create: async () => mockContact,
          },
          lead: {
            update: async () => ({ ...mockLead, status: 'CONVERTED' as const }),
          },
        } as any);
      });

      const result = await caller.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: true,
        accountName: 'ACME Corp',
      });

      expect(result.lead.status).toBe('CONVERTED');
      expect(result.contact).toBeDefined();
      expect(result.accountId).toBeDefined();
    });

    it('should convert lead without creating account', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);

      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback({
          contact: {
            create: async () => mockContact,
          },
          lead: {
            update: async () => ({ ...mockLead, status: 'CONVERTED' as const }),
          },
        } as any);
      });

      const result = await caller.convert({
        leadId: TEST_UUIDS.lead1,
        createAccount: false,
      });

      expect(result.lead.status).toBe('CONVERTED');
      expect(result.contact).toBeDefined();
      expect(result.accountId).toBeUndefined();
    });

    it('should throw BAD_REQUEST if lead already converted', async () => {
      const convertedLead = { ...mockLead, status: 'CONVERTED' as const };
      prismaMock.lead.findUnique.mockResolvedValue(convertedLead);

      await expect(
        caller.convert({ leadId: TEST_UUIDS.lead1, createAccount: true })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('already converted'),
        })
      );
    });
  });

  describe('scoreWithAI', () => {
    it('should generate AI score for lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(mockLead);
      prismaMock.aIScore.create.mockResolvedValue(mockAIScore);
      prismaMock.lead.update.mockResolvedValue({ ...mockLead, score: 80 });

      const result = await caller.scoreWithAI({ leadId: TEST_UUIDS.lead1 });

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(prismaMock.aIScore.create).toHaveBeenCalled();
      expect(prismaMock.lead.update).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND for non-existent lead', async () => {
      prismaMock.lead.findUnique.mockResolvedValue(null);

      await expect(caller.scoreWithAI({ leadId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    it('should return lead statistics', async () => {
      prismaMock.lead.count.mockResolvedValue(100);
      vi.mocked(prismaMock.lead.groupBy).mockResolvedValue([
        { status: 'NEW', _count: 30 },
        { status: 'QUALIFIED', _count: 25 },
        { status: 'CONVERTED', _count: 20 },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.lead.groupBy>>);
      prismaMock.lead.aggregate.mockResolvedValue({
        _avg: { score: 72.5 },
      } as Awaited<ReturnType<typeof prismaMock.lead.aggregate>>);

      const result = await caller.stats();

      expect(result.total).toBe(100);
      expect(result.byStatus).toEqual({
        NEW: 30,
        QUALIFIED: 25,
        CONVERTED: 20,
      });
      expect(result.averageScore).toBe(72.5);
    });

    it('should handle zero average score', async () => {
      prismaMock.lead.count.mockResolvedValue(0);
      vi.mocked(prismaMock.lead.groupBy).mockResolvedValue([]);
      prismaMock.lead.aggregate.mockResolvedValue({
        _avg: { score: null },
      } as Awaited<ReturnType<typeof prismaMock.lead.aggregate>>);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.averageScore).toBe(0);
    });
  });
});
