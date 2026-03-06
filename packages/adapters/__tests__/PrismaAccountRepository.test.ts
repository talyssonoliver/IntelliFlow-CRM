/**
 * PrismaAccountRepository Tests
 *
 * These tests verify the Prisma repository implementation using a mock Prisma client.
 * They ensure all repository methods correctly interact with the database layer.
 *
 * Coverage target: >90% for adapters layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Account, AccountId } from '@intelliflow/domain';
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
import { PrismaAccountRepository } from '../src/repositories/PrismaAccountRepository';

type AccountPrismaDelegateDouble = {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

interface AccountPrismaClientDouble {
  client: PrismaClient;
  account: AccountPrismaDelegateDouble;
}

const createMockPrismaClient = (): AccountPrismaClientDouble => {
  const account: AccountPrismaDelegateDouble = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  };

  const partialClient = {
    account,
  } satisfies Pick<PrismaClient, 'account'>;

  return {
    // Fail fast when repository code accesses undeclared Prisma delegates in tests.
    client: new Proxy(partialClient, {
      get(target, property, receiver) {
        if (!(property in target)) {
          throw new Error(
            `Unexpected Prisma delegate access in Account repository tests: ${String(property)}`
          );
        }
        return Reflect.get(target, property, receiver);
      },
    }) as PrismaClient,
    account,
  };
};

// Mock Decimal to behave like real Prisma Decimal
const mockDecimal = (value: number) => ({
  toString: () => value.toString(),
  toNumber: () => value,
});

describe('PrismaAccountRepository', () => {
  let repository: PrismaAccountRepository;
  let mockPrisma: AccountPrismaClientDouble;
  let testAccount: Account;
  let testAccountId: AccountId;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaAccountRepository(mockPrisma.client);

    // Create a test account
    const accountResult = Account.create({
      name: 'Acme Corporation',
      website: 'https://acme.com',
      industry: 'Technology',
      employees: 500,
      revenue: 50000000,
      description: 'A leading tech company',
      ownerId: 'owner-123',
      tenantId: 'tenant-123',
    });

    testAccount = accountResult.value;
    testAccountId = testAccount.id;

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should call prisma.account.upsert with correct data', async () => {
      const upsertMock = mockPrisma.account.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(testAccount);

      expect(upsertMock).toHaveBeenCalledWith({
        where: { id: testAccount.id.value },
        create: expect.objectContaining({
          id: testAccount.id.value,
          name: 'Acme Corporation',
          website: 'https://acme.com',
          industry: 'Technology',
          employees: 500,
          description: 'A leading tech company',
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
        }),
        update: expect.objectContaining({
          name: 'Acme Corporation',
        }),
      });
    });

    it('should handle null optional fields', async () => {
      const minimalAccountResult = Account.create({
        name: 'Minimal Corp',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      const upsertMock = mockPrisma.account.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(minimalAccountResult.value);

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            website: null,
            industry: null,
            employees: null,
            revenue: null,
            description: null,
          }),
        })
      );
    });

    it('should convert revenue to Decimal', async () => {
      const upsertMock = mockPrisma.account.upsert;
      upsertMock.mockResolvedValue({});

      await repository.save(testAccount);

      const callArgs = upsertMock.mock.calls[0][0];
      expect(callArgs.create.revenue).toBeDefined();
      expect(callArgs.create.revenue.toString()).toBe('50000000');
    });

    it('should handle prisma errors', async () => {
      const upsertMock = mockPrisma.account.upsert;
      upsertMock.mockRejectedValue(new Error('Database error'));

      await expect(repository.save(testAccount)).rejects.toThrow('Database error');
    });
  });

  describe('findById()', () => {
    it('should return account when found', async () => {
      const mockRecord = {
        id: testAccountId.value,
        name: 'Acme Corporation',
        website: 'https://acme.com',
        industry: 'Technology',
        employees: 500,
        revenue: mockDecimal(50000000),
        description: 'A leading tech company',
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.account.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

      const result = await repository.findById(testAccountId);

      expect(findUniqueMock).toHaveBeenCalledWith({
        where: { id: testAccountId.value },
      });

      expect(result).not.toBeNull();
      expect(result?.id.value).toBe(testAccountId.value);
      expect(result?.name).toBe('Acme Corporation');
      expect(result?.industry).toBe('Technology');
      expect(result?.revenue).toBe(50000000);
    });

    it('should return null when not found', async () => {
      const findUniqueMock = mockPrisma.account.findUnique;
      findUniqueMock.mockResolvedValue(null);

      const result = await repository.findById(testAccountId);

      expect(result).toBeNull();
    });

    it('should handle null optional fields', async () => {
      const mockRecord = {
        id: testAccountId.value,
        name: 'Minimal Corp',
        website: null,
        industry: null,
        employees: null,
        revenue: null,
        description: null,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.account.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

      const result = await repository.findById(testAccountId);

      expect(result?.website).toBeUndefined();
      expect(result?.industry).toBeUndefined();
      expect(result?.employees).toBeUndefined();
      expect(result?.revenue).toBeUndefined();
      expect(result?.description).toBeUndefined();
    });
  });

  describe('findByOwnerId()', () => {
    it('should return all accounts for owner', async () => {
      const mockRecords = [
        {
          id: testAccountId.value,
          name: 'Acme Corp',
          website: null,
          industry: 'Technology',
          employees: null,
          revenue: null,
          description: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: AccountId.generate().value,
          name: 'Beta Inc',
          website: null,
          industry: 'Finance',
          employees: null,
          revenue: null,
          description: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      const results = await repository.findByOwnerId('owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123' },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Acme Corp');
      expect(results[1].name).toBe('Beta Inc');
    });

    it('should return empty array when no accounts found', async () => {
      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByOwnerId('owner-999');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByName()', () => {
    it('should return accounts matching name', async () => {
      const mockRecords = [
        {
          id: testAccountId.value,
          name: 'Acme Corporation',
          website: null,
          industry: null,
          employees: null,
          revenue: null,
          description: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      const results = await repository.findByName('Acme');

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          name: { contains: 'Acme', mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Acme Corporation');
    });

    it('should return empty array when no matches', async () => {
      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByName('NonExistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('findByIndustry()', () => {
    it('should return accounts in industry', async () => {
      const mockRecords = [
        {
          id: testAccountId.value,
          name: 'Tech Corp',
          website: null,
          industry: 'Technology',
          employees: null,
          revenue: null,
          description: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      const results = await repository.findByIndustry('Technology');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { industry: 'Technology' },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should filter by industry and owner', async () => {
      const mockRecords = [
        {
          id: testAccountId.value,
          name: 'Tech Corp',
          website: null,
          industry: 'Technology',
          employees: null,
          revenue: null,
          description: null,
          ownerId: 'owner-123',
          tenantId: 'tenant-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue(mockRecords);

      const results = await repository.findByIndustry('Technology', 'owner-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { industry: 'Technology', ownerId: 'owner-123' },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByIndustry('NonExistent');

      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should call prisma.account.delete with correct ID', async () => {
      const deleteMock = mockPrisma.account.delete;
      deleteMock.mockResolvedValue({});

      await repository.delete(testAccountId);

      expect(deleteMock).toHaveBeenCalledWith({
        where: { id: testAccountId.value },
      });
    });

    it('should propagate prisma errors', async () => {
      const deleteMock = mockPrisma.account.delete;
      deleteMock.mockRejectedValue(new Error('Record not found'));

      await expect(repository.delete(testAccountId)).rejects.toThrow('Record not found');
    });
  });

  describe('countByOwner()', () => {
    it('should return count for owner', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(5);

      const count = await repository.countByOwner('owner-123');

      expect(countMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123' },
      });

      expect(count).toBe(5);
    });

    it('should return 0 when no accounts for owner', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(0);

      const count = await repository.countByOwner('owner-999');

      expect(count).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid account ID in reconstitution', async () => {
      const mockRecord = {
        id: 'invalid-uuid',
        name: 'Test Corp',
        website: null,
        industry: null,
        employees: null,
        revenue: null,
        description: null,
        ownerId: 'owner-123',
        tenantId: 'tenant-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const findUniqueMock = mockPrisma.account.findUnique;
      findUniqueMock.mockResolvedValue(mockRecord);

      await expect(repository.findById(testAccountId)).rejects.toThrow(/Invalid AccountId/);
    });
  });

  describe('Integration with Domain Layer', () => {
    it('should preserve all account properties through save and find cycle', async () => {
      const mockRecord = {
        id: testAccount.id.value,
        name: testAccount.name,
        website: testAccount.website?.value ?? null,
        industry: testAccount.industry,
        employees: testAccount.employees,
        revenue: testAccount.revenue ? mockDecimal(testAccount.revenue) : null,
        description: testAccount.description,
        ownerId: testAccount.ownerId,
        tenantId: testAccount.tenantId,
        createdAt: testAccount.createdAt,
        updatedAt: testAccount.updatedAt,
      };

      const upsertMock = mockPrisma.account.upsert;
      const findUniqueMock = mockPrisma.account.findUnique;
      upsertMock.mockResolvedValue(mockRecord);
      findUniqueMock.mockResolvedValue(mockRecord);

      await repository.save(testAccount);
      const found = await repository.findById(testAccount.id);

      expect(found).not.toBeNull();
      expect(found?.name).toBe(testAccount.name);
      expect(found?.website?.value).toBe(testAccount.website?.value);
      expect(found?.industry).toBe(testAccount.industry);
      expect(found?.employees).toBe(testAccount.employees);
      expect(found?.revenue).toBe(testAccount.revenue);
    });
  });
});
