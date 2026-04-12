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
  create: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
};

interface AccountPrismaClientDouble {
  client: PrismaClient;
  account: AccountPrismaDelegateDouble;
}

const createMockPrismaClient = (): AccountPrismaClientDouble => {
  const account: AccountPrismaDelegateDouble = {
    create: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
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
    it('should update existing record with tenant-scoped WHERE (F2 fix)', async () => {
      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      await repository.save(testAccount);

      expect(mockPrisma.account.updateMany).toHaveBeenCalledWith({
        where: { id: testAccount.id.value, tenantId: 'tenant-123' },
        data: expect.objectContaining({
          id: testAccount.id.value,
          name: 'Acme Corporation',
          tenantId: 'tenant-123',
        }),
      });
      // Should not call create when updateMany found a record
      expect(mockPrisma.account.create).not.toHaveBeenCalled();
    });

    it('should create new record when updateMany matches nothing', async () => {
      mockPrisma.account.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.account.create.mockResolvedValue({});

      await repository.save(testAccount);

      expect(mockPrisma.account.updateMany).toHaveBeenCalled();
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: testAccount.id.value,
          name: 'Acme Corporation',
          tenantId: 'tenant-123',
        }),
      });
    });

    it('should handle null optional fields', async () => {
      const minimalAccountResult = Account.create({
        name: 'Minimal Corp',
        ownerId: 'owner-456',
        tenantId: 'tenant-123',
      });

      mockPrisma.account.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.account.create.mockResolvedValue({});

      await repository.save(minimalAccountResult.value);

      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          website: null,
          industry: null,
          employees: null,
          revenue: null,
          description: null,
        }),
      });
    });

    it('should convert revenue to Decimal', async () => {
      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });

      await repository.save(testAccount);

      const callArgs = mockPrisma.account.updateMany.mock.calls[0][0];
      expect(callArgs.data.revenue).toBeDefined();
      expect(callArgs.data.revenue.toString()).toBe('50000000');
    });

    it('should handle prisma errors', async () => {
      mockPrisma.account.updateMany.mockRejectedValue(new Error('Database error'));

      await expect(repository.save(testAccount)).rejects.toThrow('Database error');
    });
  });

  describe('findById()', () => {
    it('should return account when found within tenant', async () => {
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

      const findFirstMock = mockPrisma.account.findFirst;
      findFirstMock.mockResolvedValue(mockRecord);

      const result = await repository.findById(testAccountId, 'tenant-123');

      expect(findFirstMock).toHaveBeenCalledWith({
        where: { id: testAccountId.value, tenantId: 'tenant-123' },
      });

      expect(result).not.toBeNull();
      expect(result?.id.value).toBe(testAccountId.value);
      expect(result?.name).toBe('Acme Corporation');
      expect(result?.industry).toBe('Technology');
      expect(result?.revenue).toBe(50000000);
    });

    it('should return null when not found', async () => {
      const findFirstMock = mockPrisma.account.findFirst;
      findFirstMock.mockResolvedValue(null);

      const result = await repository.findById(testAccountId, 'tenant-123');

      expect(result).toBeNull();
    });

    it('should return null for cross-tenant access (B-02)', async () => {
      const findFirstMock = mockPrisma.account.findFirst;
      findFirstMock.mockResolvedValue(null);

      const result = await repository.findById(testAccountId, 'tenant-OTHER');

      expect(findFirstMock).toHaveBeenCalledWith({
        where: { id: testAccountId.value, tenantId: 'tenant-OTHER' },
      });
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

      const findFirstMock = mockPrisma.account.findFirst;
      findFirstMock.mockResolvedValue(mockRecord);

      const result = await repository.findById(testAccountId, 'tenant-123');

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

      const results = await repository.findByOwnerId('owner-123', 'tenant-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123', tenantId: 'tenant-123' },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Acme Corp');
      expect(results[1].name).toBe('Beta Inc');
    });

    it('should return empty array when no accounts found', async () => {
      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByOwnerId('owner-999', 'tenant-123');

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

      const results = await repository.findByName('Acme', 'tenant-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          name: { contains: 'Acme', mode: 'insensitive' },
          tenantId: 'tenant-123',
        },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Acme Corporation');
    });

    it('should return empty array when no matches', async () => {
      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByName('NonExistent', 'tenant-123');

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

      const results = await repository.findByIndustry('Technology', 'tenant-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { industry: 'Technology', tenantId: 'tenant-123' },
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

      const results = await repository.findByIndustry('Technology', 'tenant-123');

      expect(findManyMock).toHaveBeenCalledWith({
        where: { industry: 'Technology', tenantId: 'tenant-123' },
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(1);
    });

    it('should return empty array when no matches', async () => {
      const findManyMock = mockPrisma.account.findMany;
      findManyMock.mockResolvedValue([]);

      const results = await repository.findByIndustry('NonExistent', 'tenant-123');

      expect(results).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('should call prisma.account.deleteMany with tenant-scoped WHERE (B-02)', async () => {
      const deleteManyMock = mockPrisma.account.deleteMany;
      deleteManyMock.mockResolvedValue({ count: 1 });

      await repository.delete(testAccountId, 'tenant-123');

      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { id: testAccountId.value, tenantId: 'tenant-123' },
      });
    });

    it('should gracefully handle cross-tenant delete (returns 0)', async () => {
      const deleteManyMock = mockPrisma.account.deleteMany;
      deleteManyMock.mockResolvedValue({ count: 0 });

      // Should not throw even though nothing was deleted
      await repository.delete(testAccountId, 'tenant-OTHER');

      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { id: testAccountId.value, tenantId: 'tenant-OTHER' },
      });
    });
  });

  describe('countByOwner()', () => {
    it('should return count for owner', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(5);

      const count = await repository.countByOwner('owner-123', 'tenant-123');

      expect(countMock).toHaveBeenCalledWith({
        where: { ownerId: 'owner-123', tenantId: 'tenant-123' },
      });

      expect(count).toBe(5);
    });

    it('should return 0 when no accounts for owner', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(0);

      const count = await repository.countByOwner('owner-999', 'tenant-123');

      expect(count).toBe(0);
    });
  });

  describe('existsByName() (B-03)', () => {
    it('should check name within tenant scope', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(1);

      const result = await repository.existsByName('Acme Corp', 'tenant-123');

      expect(countMock).toHaveBeenCalledWith({
        where: { name: 'Acme Corp', tenantId: 'tenant-123' },
      });
      expect(result).toBe(true);
    });

    it('should return false when name exists only in different tenant', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(0);

      const result = await repository.existsByName('Acme Corp', 'tenant-OTHER');

      expect(countMock).toHaveBeenCalledWith({
        where: { name: 'Acme Corp', tenantId: 'tenant-OTHER' },
      });
      expect(result).toBe(false);
    });

    it('should return false when name does not exist at all', async () => {
      const countMock = mockPrisma.account.count;
      countMock.mockResolvedValue(0);

      const result = await repository.existsByName('NonExistent', 'tenant-123');

      expect(result).toBe(false);
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

      const findFirstMock = mockPrisma.account.findFirst;
      findFirstMock.mockResolvedValue(mockRecord);

      await expect(repository.findById(testAccountId, 'tenant-123')).rejects.toThrow(
        /Invalid AccountId/
      );
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

      mockPrisma.account.updateMany.mockResolvedValue({ count: 1 });
      const findFirstMock = mockPrisma.account.findFirst;
      findFirstMock.mockResolvedValue(mockRecord);

      await repository.save(testAccount);
      const found = await repository.findById(testAccount.id, 'tenant-123');

      expect(found).not.toBeNull();
      expect(found?.name).toBe(testAccount.name);
      expect(found?.website?.value).toBe(testAccount.website?.value);
      expect(found?.industry).toBe(testAccount.industry);
      expect(found?.employees).toBe(testAccount.employees);
      expect(found?.revenue).toBe(testAccount.revenue);
    });
  });
});
