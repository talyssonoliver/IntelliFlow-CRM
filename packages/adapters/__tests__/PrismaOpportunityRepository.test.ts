/**
 * PrismaOpportunityRepository Tests
 *
 * These tests verify the Prisma repository implementation using a mock Prisma client.
 * They ensure all repository methods correctly interact with the database layer.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Opportunity, OpportunityId } from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';

// Mock the Decimal class from @intelliflow/db before importing the repository
vi.mock('@intelliflow/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('@intelliflow/db')>();
  return {
    ...original,
    Decimal: class MockDecimal {
      private value: string;
      constructor(value: string | number) {
        this.value = String(value);
      }
      toString() {
        return this.value;
      }
      toNumber() {
        return Number(this.value);
      }
    },
  };
});

// Import after mock is set up
import { PrismaOpportunityRepository } from '../src/repositories/PrismaOpportunityRepository';

// Mock Prisma Client
const createMockPrismaClient = () => {
  return {
    opportunity: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
  } as unknown as PrismaClient;
};

// Mock Decimal to behave like real Prisma Decimal
const mockDecimal = (value: number) => ({
  toString: () => value.toString(),
  toNumber: () => value,
});

describe('PrismaOpportunityRepository', () => {
  let repository: PrismaOpportunityRepository;
  let mockPrisma: PrismaClient;
  let testOpportunity: Opportunity;
  let testOpportunityId: OpportunityId;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaOpportunityRepository(mockPrisma);

    // Create a test opportunity
    const opportunityResult = Opportunity.create({
      name: 'Enterprise Deal',
      value: 100000,
      accountId: 'account-123',
      contactId: 'contact-456',
      expectedCloseDate: new Date('2024-12-31'),
      description: 'Large enterprise opportunity',
      ownerId: 'owner-123',
    });

    testOpportunity = opportunityResult.value;
    testOpportunityId = testOpportunity.id;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should call prisma.opportunity.upsert with correct data', async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.opportunity.upsert as any) = upsertMock;

      await repository.save(testOpportunity);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { id: testOpportunity.id.value },
        create: expect.objectContaining({
          id: testOpportunity.id.value,
          name: 'Enterprise Deal',
          stage: 'PROSPECTING',
          probability: 10,
          description: 'Large enterprise opportunity',
          accountId: 'account-123',
          contactId: 'contact-456',
          ownerId: 'owner-123',
        }),
        update: expect.objectContaining({
          name: 'Enterprise Deal',
        }),
      });
    });

    it('should convert value to Decimal', async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.opportunity.upsert as any) = upsertMock;

      await repository.save(testOpportunity);

      const callArgs = upsertMock.mock.calls[0][0];
      expect(callArgs.create.value).toBeDefined();
      expect(callArgs.create.value.toString()).toBe('100000');
    });

    it('should handle null optional fields', async () => {
      const minimalOpportunityResult = Opportunity.create({
        name: 'Simple Deal',
        value: 5000,
        accountId: 'account-789',
        ownerId: 'owner-456',
      });

      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.opportunity.upsert as any) = upsertMock;

      await repository.save(minimalOpportunityResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            expectedCloseDate: null,
            description: null,
            contactId: null,
            closedAt: null,
          }),
        })
      );
    });

    it('should handle prisma errors', async () => {
      const upsertMock = vi.fn().mockRejectedValue(new Error('Database error'));
      (mockPrisma.opportunity.upsert as any) = upsertMock;

      await expect(repository.save(testOpportunity)).rejects.toThrow('Database error');
    });
  });

  describe('findById()', () => {
    it('should return opportunity when found', async () => {
      const mockRecord = {
        id: testOpportunityId.value,
        name: 'Enterprise Deal',
        value: mockDecimal(100000),
        stage: 'PROSPECTING',
        probability: 10,
        expectedCloseDate: new Date('2024-12-31'),
        description: 'Large enterprise opportunity',
        accountId: 'account-123',
        contactId: 'contact-456',
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.opportunity.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testOpportunityId);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: testOpportunityId.value },
      });

      expect(result).not.toBeNull();
      expect(result?.id.value).toBe(testOpportunityId.value);
      expect(result?.name).toBe('Enterprise Deal');
      expect(result?.value).toBe(100000);
      expect(result?.stage).toBe('PROSPECTING');
    });

    it('should return null when not found', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue(null);
      (mockPrisma.opportunity.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testOpportunityId);

      expect(result).toBeNull();
    });

    it('should handle null optional fields', async () => {
      const mockRecord = {
        id: testOpportunityId.value,
        name: 'Simple Deal',
        value: mockDecimal(5000),
        stage: 'PROSPECTING',
        probability: 10,
        expectedCloseDate: null,
        description: null,
        accountId: 'account-123',
        contactId: null,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.opportunity.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testOpportunityId);

      expect(result?.expectedCloseDate).toBeUndefined();
      expect(result?.description).toBeUndefined();
      expect(result?.contactId).toBeUndefined();
      expect(result?.closedAt).toBeUndefined();
    });
  });

  describe('findByAccountId()', () => {
    it('should return all opportunities for account', async () => {
      const mockRecords = [
        {
          id: testOpportunityId.value,
          name: 'Deal 1',
          value: mockDecimal(50000),
          stage: 'PROSPECTING',
          probability: 10,
          expectedCloseDate: new Date('2024-12-31'),
          description: null,
          accountId: 'account-123',
          contactId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
        },
        {
          id: OpportunityId.generate().value,
          name: 'Deal 2',
          value: mockDecimal(75000),
          stage: 'QUALIFICATION',
          probability: 20,
          expectedCloseDate: new Date('2025-01-15'),
          description: null,
          accountId: 'account-123',
          contactId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findByAccountId('account-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { accountId: 'account-123' },
        orderBy: { expectedCloseDate: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Deal 1');
      expect(results[1].name).toBe('Deal 2');
    });

    it('should return empty array when no opportunities found', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findByAccountId('account-999');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all opportunities for owner', async () => {
      const mockRecords = [
        {
          id: testOpportunityId.value,
          name: 'My Deal',
          value: mockDecimal(30000),
          stage: 'PROSPECTING',
          probability: 10,
          expectedCloseDate: new Date(),
          description: null,
          accountId: 'account-123',
          contactId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123' },
        orderBy: { expectedCloseDate: 'asc' },
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('findByStage()', () => {
    it('should return opportunities in stage', async () => {
      const mockRecords = [
        {
          id: testOpportunityId.value,
          name: 'Qualified Deal',
          value: mockDecimal(50000),
          stage: 'QUALIFICATION',
          probability: 20,
          expectedCloseDate: new Date(),
          description: null,
          accountId: 'account-123',
          contactId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findByStage('QUALIFICATION');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { stage: 'QUALIFICATION' },
        orderBy: { expectedCloseDate: 'asc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].stage).toBe('QUALIFICATION');
    });

    it('should filter by stage and owner', async () => {
      const mockRecords = [
        {
          id: testOpportunityId.value,
          name: 'My Proposal',
          value: mockDecimal(80000),
          stage: 'PROPOSAL',
          probability: 60,
          expectedCloseDate: new Date(),
          description: null,
          accountId: 'account-123',
          contactId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findByStage('PROPOSAL', 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { stage: 'PROPOSAL', ownerId: 'owner-123' },
        orderBy: { expectedCloseDate: 'asc' },
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('findClosingSoon()', () => {
    it('should return opportunities closing within days', async () => {
      const mockRecords = [
        {
          id: testOpportunityId.value,
          name: 'Closing Soon',
          value: mockDecimal(25000),
          stage: 'NEGOTIATION',
          probability: 80,
          expectedCloseDate: new Date(),
          description: null,
          accountId: 'account-123',
          contactId: null,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
          closedAt: null,
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findClosingSoon(7);

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          expectedCloseDate: { lte: expect.any(Date) },
          closedAt: null,
        },
        orderBy: { expectedCloseDate: 'asc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should filter by days and owner', async () => {
      const mockRecords = [];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.opportunity.findMany as any) = findManyMock;

      const results = await repository.findClosingSoon(30, 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          expectedCloseDate: { lte: expect.any(Date) },
          closedAt: null,
          ownerId: 'owner-123',
        },
        orderBy: { expectedCloseDate: 'asc' },
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should call prisma.opportunity.delete with correct ID', async () => {
      const deleteMock = vi.fn().mockResolvedValue({});
      (mockPrisma.opportunity.delete as any) = deleteMock;

      await repository.delete(testOpportunityId);

      expect(deleteMock).toHaveBeenCalledWith({
        where: { id: testOpportunityId.value },
      });
    });

    it('should propagate prisma errors', async () => {
      const deleteMock = vi.fn().mockRejectedValue(new Error('Record not found'));
      (mockPrisma.opportunity.delete as any) = deleteMock;

      await expect(repository.delete(testOpportunityId)).rejects.toThrow('Record not found');
    });
  });

  describe('sumValueByStage()', () => {
    it('should return sum of values grouped by stage', async () => {
      const mockResults = [
        { stage: 'PROSPECTING', _sum: { value: mockDecimal(100000) } },
        { stage: 'QUALIFICATION', _sum: { value: mockDecimal(200000) } },
        { stage: 'PROPOSAL', _sum: { value: mockDecimal(150000) } },
      ];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const sums = await repository.sumValueByStage();

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['stage'],
        where: undefined,
        _sum: { value: true },
      });

      expect(sums).toEqual({
        PROSPECTING: 100000,
        QUALIFICATION: 200000,
        PROPOSAL: 150000,
      });
    });

    it('should filter by owner', async () => {
      const mockResults = [{ stage: 'PROSPECTING', _sum: { value: mockDecimal(50000) } }];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const sums = await repository.sumValueByStage('owner-123');

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['stage'],
        where: { ownerId: 'owner-123' },
        _sum: { value: true },
      });

      expect(sums).toEqual({ PROSPECTING: 50000 });
    });

    it('should return empty object when no opportunities', async () => {
      const groupByMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const sums = await repository.sumValueByStage();

      expect(sums).toEqual({});
    });

    it('should handle null sum values', async () => {
      const mockResults = [{ stage: 'PROSPECTING', _sum: { value: null } }];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const sums = await repository.sumValueByStage();

      expect(sums).toEqual({ PROSPECTING: 0 });
    });
  });

  describe('countByStage()', () => {
    it('should return counts grouped by stage', async () => {
      const mockResults = [
        { stage: 'PROSPECTING', _count: 5 },
        { stage: 'QUALIFICATION', _count: 3 },
        { stage: 'CLOSED_WON', _count: 2 },
      ];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const counts = await repository.countByStage();

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['stage'],
        where: undefined,
        _count: true,
      });

      expect(counts).toEqual({
        PROSPECTING: 5,
        QUALIFICATION: 3,
        CLOSED_WON: 2,
      });
    });

    it('should filter by owner', async () => {
      const mockResults = [{ stage: 'PROSPECTING', _count: 2 }];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const counts = await repository.countByStage('owner-123');

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['stage'],
        where: { ownerId: 'owner-123' },
        _count: true,
      });

      expect(counts).toEqual({ PROSPECTING: 2 });
    });

    it('should return empty object when no opportunities', async () => {
      const groupByMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.opportunity.groupBy as any) = groupByMock;

      const counts = await repository.countByStage();

      expect(counts).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid opportunity ID in reconstitution', async () => {
      const mockRecord = {
        id: 'invalid-uuid',
        name: 'Test Deal',
        value: mockDecimal(10000),
        stage: 'PROSPECTING',
        probability: 10,
        expectedCloseDate: null,
        description: null,
        accountId: 'account-123',
        contactId: null,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        closedAt: null,
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.opportunity.findUnique as any) = findUniqueMock;

      await expect(repository.findById(testOpportunityId)).rejects.toThrow(/Invalid OpportunityId/);
    });
  });

  describe('Integration with Domain Layer', () => {
    it('should preserve all opportunity properties through save and find cycle', async () => {
      const mockRecord = {
        id: testOpportunity.id.value,
        name: testOpportunity.name,
        value: mockDecimal(testOpportunity.value),
        stage: testOpportunity.stage,
        probability: testOpportunity.probability,
        expectedCloseDate: testOpportunity.expectedCloseDate,
        description: testOpportunity.description,
        accountId: testOpportunity.accountId,
        contactId: testOpportunity.contactId,
        ownerId: testOpportunity.ownerId,
        createdAt: testOpportunity.createdAt,
        updatedAt: testOpportunity.updatedAt,
        closedAt: testOpportunity.closedAt,
      };

      const upsertMock = vi.fn().mockResolvedValue(mockRecord);
      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);

      (mockPrisma.opportunity.upsert as any) = upsertMock;
      (mockPrisma.opportunity.findUnique as any) = findUniqueMock;

      await repository.save(testOpportunity);
      const found = await repository.findById(testOpportunity.id);

      expect(found).not.toBeNull();
      expect(found?.name).toBe(testOpportunity.name);
      expect(found?.value).toBe(testOpportunity.value);
      expect(found?.stage).toBe(testOpportunity.stage);
      expect(found?.probability).toBe(testOpportunity.probability);
      expect(found?.accountId).toBe(testOpportunity.accountId);
    });
  });
});
