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

type LeadPrismaDelegateDouble = {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

interface LeadPrismaClientDouble {
  client: PrismaClient;
  lead: LeadPrismaDelegateDouble;
}

const createMockPrismaClient = (): LeadPrismaClientDouble => {
  const lead: LeadPrismaDelegateDouble = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  };

  const partialClient = {
    lead,
  } satisfies Pick<PrismaClient, 'lead'>;

  return {
    // Fail fast when repository code accesses undeclared Prisma delegates in tests.
    client: new Proxy(partialClient, {
      get(target, property, receiver) {
        if (!(property in target)) {
          throw new Error(
            `Unexpected Prisma delegate access in Lead repository tests: ${String(property)}`
          );
        }
        return Reflect.get(target, property, receiver);
      },
    }) as PrismaClient,
    lead,
  };
};

describe('PrismaLeadRepository', () => {
  let repository: PrismaLeadRepository;
  let mockPrisma: LeadPrismaClientDouble;
  let testLead: Lead;
  let testLeadId: LeadId;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaLeadRepository(mockPrisma.client);

    // Create a test lead
    const leadResult = Lead.create({
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corp',
      title: 'CTO',
      phone: '+15550100',
      source: 'WEBSITE',
      ownerId: 'owner-123',
      tenantId: 'tenant-123',
    });

    testLead = leadResult.value;
    testLeadId = testLead.id;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should call prisma.lead.upsert with correct data', async () => {
      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

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
          phone: '+15550100',
          source: 'WEBSITE',
          status: 'NEW',
          score: 0,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
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
        tenantId: 'tenant-123',
      });

      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

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

      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

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
      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockRejectedValue(new Error('Database error'));

      await expect(repository.save(testLead)).rejects.toThrow('Database error');
    });
  });

  describe('Lead 360 fields (IFC-004)', () => {
    it('persists location, website, avatarUrl, estimatedValue, lastContactedAt and tags on save', async () => {
      const lastContacted = new Date('2026-01-15T00:00:00.000Z');
      const leadResult = Lead.create({
        email: 'l360@example.com',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        location: 'London, UK',
        website: 'https://acme.com',
        avatarUrl: 'https://cdn.example.com/a.png',
        estimatedValue: 250000,
        lastContactedAt: lastContacted,
        tags: ['enterprise', 'inbound'],
      });
      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(leadResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            location: 'London, UK',
            website: 'https://acme.com',
            avatarUrl: 'https://cdn.example.com/a.png',
            estimatedValue: 250000,
            lastContactedAt: lastContacted,
            tags: ['enterprise', 'inbound'],
          }),
        })
      );
    });

    it('persists an initial note atomically (nested write) when opts.note is supplied', async () => {
      const leadResult = Lead.create({
        email: 'noted@example.com',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });
      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(leadResult.value, {
        note: { content: 'Source detail: Podcast ad', author: 'me@example.com' },
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            notes: {
              create: [
                expect.objectContaining({
                  content: 'Source detail: Podcast ad',
                  author: 'me@example.com',
                  tenantId: 'tenant-123',
                }),
              ],
            },
          }),
        })
      );
    });

    it('does not nest a note when opts.note is absent', async () => {
      const leadResult = Lead.create({
        email: 'nonote@example.com',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });
      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(leadResult.value);

      const callArg = upsertMock.mock.calls[0][0];
      expect(callArg.create.notes).toBeUndefined();
    });

    it('persists null estimatedValue (not 0) when no estimate is supplied', async () => {
      const leadResult = Lead.create({
        email: 'noestimate@example.com',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
      });
      const upsertMock = mockPrisma.lead.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(leadResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ estimatedValue: null }),
        })
      );
    });

    it('reconstitutes the Lead 360 fields from a persisted record', async () => {
      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue({
        id: testLeadId.value,
        email: 'l360@example.com',
        firstName: null,
        lastName: null,
        company: null,
        title: null,
        phone: null,
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        location: 'London, UK',
        website: 'https://acme.com',
        avatarUrl: 'https://cdn.example.com/a.png',
        estimatedValue: 250000,
        lastContactedAt: new Date('2026-01-15T00:00:00.000Z'),
        tags: ['enterprise', 'inbound'],
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await repository.findById(testLeadId);

      expect(result?.location).toBe('London, UK');
      expect(result?.website).toBe('https://acme.com');
      expect(result?.avatarUrl).toBe('https://cdn.example.com/a.png');
      expect(result?.estimatedValue).toBe(250000);
      expect(result?.lastContactedAt).toEqual(new Date('2026-01-15T00:00:00.000Z'));
      expect(result?.tags).toEqual(['enterprise', 'inbound']);
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
        phone: '+15550100',
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

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
      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue(null);

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
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

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
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

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
        phone: '+15550100',
        source: 'WEBSITE',
        status: 'NEW',
        score: 0,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findFirstMock = mockPrisma.lead.findFirst;
      findFirstMock.mockResolvedValue(mockRecord);

      const emailResult = Email.create('test@example.com');
      const result = await repository.findByEmail(emailResult.value);

      expect(findFirstMock).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(result).not.toBeNull();
      expect(result?.email.value).toBe('test@example.com');
    });

    it('should return null when not found', async () => {
      const findFirstMock = mockPrisma.lead.findFirst;
      findFirstMock.mockResolvedValue(null);

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
          tenantId: 'tenant-123',
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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

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
      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue([]);

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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      const results = await repository.findByStatus('QUALIFIED', 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { status: 'QUALIFIED', ownerId: 'owner-123' },
        orderBy: { createdAt: 'desc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue([]);

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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      const results = await repository.findByMinScore(80, 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { score: { gte: 80 }, ownerId: 'owner-123' },
        orderBy: { score: 'desc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no leads meet threshold', async () => {
      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByMinScore(95);

      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should call prisma.lead.delete with correct ID', async () => {
      const deleteMock = mockPrisma.lead.delete;
      deleteMock.mockResolvedValue({});

      await repository.delete(testLeadId);

      expect(deleteMock).toHaveBeenCalledWith({
        where: { id: testLeadId.value },
      });
    });

    it('should propagate prisma errors', async () => {
      const deleteMock = mockPrisma.lead.delete;
      deleteMock.mockRejectedValue(new Error('Record not found'));

      await expect(repository.delete(testLeadId)).rejects.toThrow('Record not found');
    });
  });

  describe('existsByEmail()', () => {
    it('should return true when email exists', async () => {
      const countMock = mockPrisma.lead.count;
      countMock.mockResolvedValue(1);

      const emailResult = Email.create('test@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(countMock).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(exists).toBe(true);
    });

    it('should return false when email does not exist', async () => {
      const countMock = mockPrisma.lead.count;
      countMock.mockResolvedValue(0);

      const emailResult = Email.create('nonexistent@example.com');
      const exists = await repository.existsByEmail(emailResult.value);

      expect(exists).toBe(false);
    });

    it('should return true for multiple matches', async () => {
      const countMock = mockPrisma.lead.count;
      countMock.mockResolvedValue(2);

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

      const groupByMock = mockPrisma.lead.groupBy;
      groupByMock.mockResolvedValue(mockResults);

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

      const groupByMock = mockPrisma.lead.groupBy;
      groupByMock.mockResolvedValue(mockResults);

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
      const groupByMock = mockPrisma.lead.groupBy;
      groupByMock.mockResolvedValue([]);

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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

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
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      await repository.findForScoring(5);

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });

    it('should query for leads older than 30 days', async () => {
      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue([]);

      await repository.findForScoring(10);

      const callArgs = findManyMock.mock.calls[0][0];
      const thirtyDaysAgo = callArgs.where.OR[1].updatedAt.lt;

      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 30);

      // Check that the date is approximately 30 days ago (within 1 second tolerance)
      expect(Math.abs(thirtyDaysAgo.getTime() - expectedDate.getTime())).toBeLessThan(1000);
    });

    it('should return empty array when no leads need scoring', async () => {
      const findManyMock = mockPrisma.lead.findMany;
      findManyMock.mockResolvedValue([]);

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
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

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
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.lead.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

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
        phone: testLead.phone?.value ?? null,
        source: testLead.source,
        status: testLead.status,
        score: testLead.score.value,
        ownerId: testLead.ownerId,
        tenantId: testLead.tenantId,
        createdAt: testLead.createdAt,
        updatedAt: testLead.updatedAt,
      };

      const upsertMock = mockPrisma.lead.upsert;
      const findUniqueMock = mockPrisma.lead.findUnique;
      upsertMock.mockResolvedValue(mockRecord);
      findUniqueMock.mockResolvedValue(mockRecord);

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
        phone: testLead.phone?.value ?? null,
        source: testLead.source,
        status: testLead.status,
        score: 75,
        ownerId: testLead.ownerId,
        tenantId: testLead.tenantId,
        createdAt: testLead.createdAt,
        updatedAt: testLead.updatedAt,
      };

      const upsertMock = mockPrisma.lead.upsert;
      const findUniqueMock = mockPrisma.lead.findUnique;
      upsertMock.mockResolvedValue(mockRecord);
      findUniqueMock.mockResolvedValue(mockRecord);

      await repository.save(testLead);
      const found = await repository.findById(testLead.id);

      expect(found?.score.value).toBe(75);
      // Note: Confidence is lost in Prisma storage (defaults to 1.0)
      expect(found?.score.confidence).toBe(1.0);
    });
  });
});
