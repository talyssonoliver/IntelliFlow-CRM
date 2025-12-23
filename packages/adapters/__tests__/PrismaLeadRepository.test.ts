/**
 * PrismaLeadRepository Tests
 *
 * These tests verify the Prisma repository implementation using a mock Prisma client.
 * They ensure all repository methods correctly interact with the database layer.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaLeadRepository } from '../src/repositories/PrismaLeadRepository';
import { Lead, LeadId, Email } from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';

// Mock Prisma Client
const createMockPrismaClient = () => {
  return {
    lead: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('PrismaLeadRepository', () => {
  let repository: PrismaLeadRepository;
  let mockPrisma: PrismaClient;
  let testLead: Lead;
  let testLeadId: LeadId;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaLeadRepository(mockPrisma);

    // Create a test lead
    const leadResult = Lead.create({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'CTO',
      phone: '+1-555-0100',
      source: 'WEBSITE',
      ownerId: 'owner-123',
    });

    testLead = leadResult.value;
    testLeadId = testLead.id;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should call prisma.lead.upsert with correct data', async () => {
      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.lead.upsert as any) = upsertMock;

      await repository.save(testLead);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { id: testLead.id.value },
        create: expect.objectContaining({
          id: testLead.id.value,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: 'Acme Corp',
          title: 'CTO',
          phone: '+1-555-0100',
          source: 'WEBSITE',
          status: 'NEW',
          score: 0,
          ownerId: 'owner-123',
        }),
        update: expect.objectContaining({
          email: 'test@example.com',
        }),
      });
    });

    it('should handle null optional fields', async () => {
      const minimalLeadResult = Lead.create({
        email: 'minimal@example.com',
        ownerId: 'owner-456',
      });

      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.lead.upsert as any) = upsertMock;

      await repository.save(minimalLeadResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            firstName: null,
            lastName: null,
            company: null,
            title: null,
            phone: null,
          }),
        })
      );
    });

    it('should save lead score value', async () => {
      testLead.updateScore(85, 0.9, 'v1.0.0');

      const upsertMock = vi.fn().mockResolvedValue({});
      (mockPrisma.lead.upsert as any) = upsertMock;

      await repository.save(testLead);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            score: 85,
          }),
        })
      );
    });

    it('should handle prisma errors', async () => {
      const upsertMock = vi.fn().mockRejectedValue(new Error('Database error'));
      (mockPrisma.lead.upsert as any) = upsertMock;

      await expect(repository.save(testLead)).rejects.toThrow('Database error');
    });
  });

  describe('findById()', () => {
    it('should return lead when found', async () => {
      const mockRecord = {
        id: testLeadId.value,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+1-555-0100',
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testLeadId);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: testLeadId.value },
      });

      expect(result).not.toBeNull();
      expect(result?.id.value).toBe(testLeadId.value);
      expect(result?.email.value).toBe('test@example.com');
      expect(result?.firstName).toBe('John');
    });

    it('should return null when not found', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue(null);
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testLeadId);

      expect(result).toBeNull();
    });

    it('should reconstitute lead with default confidence', async () => {
      const mockRecord = {
        id: testLeadId.value,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE',
        status: 'NEW',
        score: 75,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testLeadId);

      expect(result?.score.value).toBe(75);
      expect(result?.score.confidence).toBe(1.0);
    });

    it('should handle null optional fields', async () => {
      const mockRecord = {
        id: testLeadId.value,
        email: 'test@example.com',
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      const result = await repository.findById(testLeadId);

      expect(result?.firstName).toBeUndefined();
      expect(result?.lastName).toBeUndefined();
      expect(result?.company).toBeUndefined();
    });
  });

  describe('findByEmail()', () => {
    it('should return lead when found', async () => {
      const mockRecord = {
        id: testLeadId.value,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        phone: '+1-555-0100',
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findFirstMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.lead.findFirst as any) = findFirstMock;

      const emailResult = Email.create('test@example.com');
      const result = await repository.findByEmail(emailResult.value);

      expect(findFirstMock).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(result).not.toBeNull();
      expect(result?.email.value).toBe('test@example.com');
    });

    it('should return null when not found', async () => {
      const findFirstMock = vi.fn().mockResolvedValue(null);
      (mockPrisma.lead.findFirst as any) = findFirstMock;

      const emailResult = Email.create('nonexistent@example.com');
      const result = await repository.findByEmail(emailResult.value);

      expect(result).toBeNull();
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all leads for owner', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'test1@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'NEW',
          score: 0,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: LeadId.generate().value,
          email: 'test2@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          company: null,
          title: null,
          phone: null,
          source: 'REFERRAL',
          status: 'NEW',
          score: 0,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123' },
        orderBy: { createdAt: 'desc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0].email.value).toBe('test1@example.com');
      expect(results[1].email.value).toBe('test2@example.com');
    });

    it('should return empty array when no leads found', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByOwnerId('owner-999');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByStatus()', () => {
    it('should return leads with matching status', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'CONTACTED',
          score: 0,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByStatus('CONTACTED');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { status: 'CONTACTED' },
        orderBy: { createdAt: 'desc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('CONTACTED');
    });

    it('should filter by status and owner', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'QUALIFIED',
          score: 0,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByStatus('QUALIFIED', 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { status: 'QUALIFIED', ownerId: 'owner-123' },
        orderBy: { createdAt: 'desc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByStatus('LOST');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByMinScore()', () => {
    it('should return leads above score threshold', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'high@example.com',
          firstName: 'High',
          lastName: 'Score',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'NEW',
          score: 85,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByMinScore(70);

      expect(findManyMock).toHaveBeenCalledWith({
        where: { score: { gte: 70 } },
        orderBy: { score: 'desc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].score.value).toBeGreaterThanOrEqual(70);
    });

    it('should filter by score and owner', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'NEW',
          score: 90,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByMinScore(80, 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { score: { gte: 80 }, ownerId: 'owner-123' },
        orderBy: { score: 'desc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no leads meet threshold', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findByMinScore(95);

      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should call prisma.lead.delete with correct ID', async () => {
      const deleteMock = vi.fn().mockResolvedValue({});
      (mockPrisma.lead.delete as any) = deleteMock;

      await repository.delete(testLeadId);

      expect(deleteMock).toHaveBeenCalledWith({
        where: { id: testLeadId.value },
      });
    });

    it('should propagate prisma errors', async () => {
      const deleteMock = vi.fn().mockRejectedValue(new Error('Record not found'));
      (mockPrisma.lead.delete as any) = deleteMock;

      await expect(repository.delete(testLeadId)).rejects.toThrow('Record not found');
    });
  });

  describe('existsByEmail()', () => {
    it('should return true when email exists', async () => {
      const countMock = vi.fn().mockResolvedValue(1);
      (mockPrisma.lead.count as any) = countMock;

      const emailResult = Email.create('test@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(countMock).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(exists).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      const countMock = vi.fn().mockResolvedValue(0);
      (mockPrisma.lead.count as any) = countMock;

      const emailResult = Email.create('nonexistent@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });

    it('should return true for multiple matches', async () => {
      const countMock = vi.fn().mockResolvedValue(2);
      (mockPrisma.lead.count as any) = countMock;

      const emailResult = Email.create('duplicate@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(true);
    });
  });

  describe('countByStatus()', () => {
    it('should return counts grouped by status', async () => {
      const mockResults = [
        { status: 'NEW', _count: 5 },
        { status: 'CONTACTED', _count: 3 },
        { status: 'QUALIFIED', _count: 2 },
      ];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.lead.groupBy as any) = groupByMock;

      const counts = await repository.countByStatus();

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['status'],
        where: undefined,
        _count: true,
      });

      expect(counts).toEqual({
        NEW: 5,
        CONTACTED: 3,
        QUALIFIED: 2,
      });
    });

    it('should filter counts by owner', async () => {
      const mockResults = [
        { status: 'NEW', _count: 2 },
        { status: 'CONTACTED', _count: 1 },
      ];

      const groupByMock = vi.fn().mockResolvedValue(mockResults);
      (mockPrisma.lead.groupBy as any) = groupByMock;

      const counts = await repository.countByStatus('owner-123');

      expect(groupByMock).toHaveBeenCalledWith({
        by: ['status'],
        where: { ownerId: 'owner-123' },
        _count: true,
      });

      expect(counts).toEqual({
        NEW: 2,
        CONTACTED: 1,
      });
    });

    it('should return empty object when no leads exist', async () => {
      const groupByMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.lead.groupBy as any) = groupByMock;

      const counts = await repository.countByStatus();

      expect(counts).toEqual({});
    });
  });

  describe('findForScoring()', () => {
    it('should return unscored and stale leads', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'unscored@example.com',
          firstName: 'Unscored',
          lastName: 'Lead',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'NEW',
          score: 0,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findForScoring(10);

      const callArgs = findManyMock.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toContainEqual({ score: 0 });
      expect(callArgs.where.OR).toContainEqual({
        updatedAt: { lt: expect.any(Date) },
      });
      expect(callArgs.take).toBe(10);
      expect(callArgs.orderBy).toEqual({ createdAt: 'asc' });

      expect(results).toHaveLength(1);
    });

    it('should limit results', async () => {
      const mockRecords = [
        {
          id: testLeadId.value,
          email: 'test1@example.com',
          firstName: 'Test',
          lastName: 'One',
          company: null,
          title: null,
          phone: null,
          source: 'WEBSITE',
          status: 'NEW',
          score: 0,
          ownerId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = vi.fn().mockResolvedValue(mockRecords);
      (mockPrisma.lead.findMany as any) = findManyMock;

      await repository.findForScoring(5);

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it('should query for leads older than 30 days', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.lead.findMany as any) = findManyMock;

      await repository.findForScoring(10);

      const callArgs = findManyMock.mock.calls[0][0];
      const thirtyDaysAgo = callArgs.where.OR[1].updatedAt.lt;

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 30);

      // Check that the date is approximately 30 days ago (within 1 second tolerance)
      expect(Math.abs(thirtyDaysAgo.getTime() - expectedDate.getTime())).toBeLessThan(1000);
    });

    it('should return empty array when no leads need scoring', async () => {
      const findManyMock = vi.fn().mockResolvedValue([]);
      (mockPrisma.lead.findMany as any) = findManyMock;

      const results = await repository.findForScoring(10);

      expect(results).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid lead ID in reconstitution', async () => {
      const mockRecord = {
        id: 'invalid-uuid',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      await expect(repository.findById(testLeadId)).rejects.toThrow(/Invalid LeadId/);
    });

    it('should handle invalid email in reconstitution', async () => {
      const mockRecord = {
        id: testLeadId.value,
        email: 'not-an-email',
        firstName: 'John',
        lastName: 'Doe',
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      // Should throw during Email.create() in reconstitution
      await expect(repository.findById(testLeadId)).rejects.toThrow();
    });
  });

  describe('Integration with Domain Layer', () => {
    it('should preserve all lead properties through save and find cycle', async () => {
      const mockRecord = {
        id: testLead.id.value,
        email: testLead.email.value,
        firstName: testLead.firstName,
        lastName: testLead.lastName,
        company: testLead.company,
        title: testLead.title,
        phone: testLead.phone,
        source: testLead.source,
        status: testLead.status,
        score: testLead.score.value,
        ownerId: testLead.ownerId,
        createdAt: testLead.createdAt,
        updatedAt: testLead.updatedAt,
      };

      const upsertMock = vi.fn().mockResolvedValue(mockRecord);
      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);

      (mockPrisma.lead.upsert as any) = upsertMock;
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      await repository.save(testLead);
      const found = await repository.findById(testLead.id);

      expect(found).not.toBeNull();
      expect(found?.email.value).toBe(testLead.email.value);
      expect(found?.firstName).toBe(testLead.firstName);
      expect(found?.lastName).toBe(testLead.lastName);
      expect(found?.company).toBe(testLead.company);
      expect(found?.status).toBe(testLead.status);
      expect(found?.score.value).toBe(testLead.score.value);
    });

    it('should handle lead with updated score', async () => {
      testLead.updateScore(75, 0.9, 'v1.0.0');

      const mockRecord = {
        id: testLead.id.value,
        email: testLead.email.value,
        firstName: testLead.firstName,
        lastName: testLead.lastName,
        company: testLead.company,
        title: testLead.title,
        phone: testLead.phone,
        source: testLead.source,
        status: testLead.status,
        score: 75,
        ownerId: testLead.ownerId,
        createdAt: testLead.createdAt,
        updatedAt: testLead.updatedAt,
      };

      const upsertMock = vi.fn().mockResolvedValue(mockRecord);
      const findUniqueMock = vi.fn().mockResolvedValue(mockRecord);

      (mockPrisma.lead.upsert as any) = upsertMock;
      (mockPrisma.lead.findUnique as any) = findUniqueMock;

      await repository.save(testLead);
      const found = await repository.findById(testLead.id);

      expect(found?.score.value).toBe(75);
      // Note: Confidence is lost in Prisma storage (defaults to 1.0)
      expect(found?.score.confidence).toBe(1.0);
    });
  });
});
