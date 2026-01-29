import { TEST_UUIDS } from '../../../test/setup';
/**
 * Account Router Tests
 *
 * Comprehensive tests for all account router procedures:
 * - create, getById, list, update, delete, stats
 *
 * Following hexagonal architecture - mocks services for business logic procedures.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { accountRouter } from '../account.router';
import {
  prismaMock,
  createTestContext,
  mockAccount,
  mockUser,
  mockContact,
  mockOpportunity,
} from '../../../test/setup';

/**
 * Create a mock domain account for service responses
 */
const createMockDomainAccount = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.account1 },
  name: 'TechCorp Inc',
  website: 'https://techcorp.example.com',
  industry: 'Technology',
  employees: 200,
  revenue: 5000000,
  description: 'A technology company',
  ownerId: TEST_UUIDS.user1,
  createdAt: new Date(),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

describe('Account Router', () => {
  const ctx = createTestContext();
  const caller = accountRouter.createCaller(ctx);

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new account with valid input', async () => {
      const input = {
        name: 'New Company Inc',
        website: 'https://newcompany.com',
        industry: 'Software',
        revenue: 5000000,
        employees: 100,
      };

      const mockDomainAccount = createMockDomainAccount({
        name: input.name,
        website: input.website,
        industry: input.industry,
        revenue: input.revenue,
        employees: input.employees,
      });

      ctx.services!.account!.createAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      const result = await caller.create(input);

      expect(result.name).toBe(input.name);
      expect(ctx.services!.account!.createAccount).toHaveBeenCalled();
    });

    it('should create account with minimal data', async () => {
      const input = {
        name: 'Minimal Corp',
      };

      const mockDomainAccount = createMockDomainAccount({
        name: input.name,
        website: null,
        industry: null,
        employees: null,
        revenue: null,
      });

      ctx.services!.account!.createAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      const result = await caller.create(input);

      expect(result.name).toBe(input.name);
    });

    it('should throw CONFLICT for duplicate account name', async () => {
      const input = {
        name: 'Existing Corp',
      };

      ctx.services!.account!.createAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: `Account with name "${input.name}" already exists` },
      });

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
        })
      );
    });
  });

  describe('getById', () => {
    it('should return account with related data', async () => {
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      const result = await caller.getById({ id: TEST_UUIDS.account1 });

      expect(result.id).toBe(TEST_UUIDS.account1);
      expect(result.name).toBe('TechCorp Inc');
      expect(ctx.services!.account!.getAccountById).toHaveBeenCalledWith(TEST_UUIDS.account1);
    });

    it('should throw NOT_FOUND for non-existent account', async () => {
      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Account not found: ${TEST_UUIDS.nonExistent}` },
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
    it('should list accounts with pagination', async () => {
      const accounts = [mockAccount, { ...mockAccount, id: 'account-2', name: 'Corp 2' }];
      const accountsWithRelations = accounts.map((account) => ({
        ...account,
        owner: mockUser,
        _count: { contacts: 2, opportunities: 1 },
      }));

      prismaMock.account.findMany.mockResolvedValue(accountsWithRelations);
      prismaMock.account.count.mockResolvedValue(25);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.accounts).toHaveLength(2);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true);
    });

    it('should filter accounts by search term', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ search: 'TechCorp' });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'TechCorp', mode: 'insensitive' } },
              { website: { contains: 'TechCorp', mode: 'insensitive' } },
              { industry: { contains: 'TechCorp', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter accounts by industry', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ industry: 'Technology' });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            industry: { contains: 'Technology', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should filter accounts by revenue range', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ minRevenue: 1000000, maxRevenue: 10000000 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revenue: { gte: 1000000, lte: 10000000 },
          }),
        })
      );
    });

    it('should filter accounts by employee count', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ minEmployees: 50, maxEmployees: 200 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employees: { gte: 50, lte: 200 },
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('should update account with valid data', async () => {
      const mockDomainAccount = createMockDomainAccount({
        name: 'Updated Corp',
        revenue: 2000000,
      });

      ctx.services!.account!.updateAccountInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      const result = await caller.update({
        id: TEST_UUIDS.account1,
        name: 'Updated Corp',
      });

      expect(result.name).toBe('Updated Corp');
      expect(ctx.services!.account!.updateAccountInfo).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when updating non-existent account', async () => {
      ctx.services!.account!.updateAccountInfo = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(caller.update({ id: TEST_UUIDS.nonExistent, name: 'Test' })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw CONFLICT when updating to duplicate name', async () => {
      ctx.services!.account!.updateAccountInfo = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Account with name "Existing Corp" already exists' },
      });

      await expect(caller.update({ id: TEST_UUIDS.account1, name: 'Existing Corp' })).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete account without related records', async () => {
      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await caller.delete({ id: TEST_UUIDS.account1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.account1);
      expect(ctx.services!.account!.deleteAccount).toHaveBeenCalledWith(TEST_UUIDS.account1);
    });

    it('should throw PRECONDITION_FAILED if account has contacts', async () => {
      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot delete account with 5 associated contacts. Reassign or delete contacts first.' },
      });

      await expect(caller.delete({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('contacts'),
        })
      );
    });

    it('should throw PRECONDITION_FAILED if account has active opportunities', async () => {
      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot delete account with 2 active opportunities. Close or reassign them first.' },
      });

      await expect(caller.delete({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('opportunities'),
        })
      );
    });

    it('should throw NOT_FOUND for non-existent account', async () => {
      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    // stats still uses Prisma for aggregations
    it('should return account statistics', async () => {
      prismaMock.account.count.mockResolvedValueOnce(100); // total
      vi.mocked(prismaMock.account.groupBy).mockResolvedValue([
        { industry: 'Technology', _count: 40 },
        { industry: 'Finance', _count: 30 },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);
      prismaMock.account.count.mockResolvedValueOnce(75); // withContacts
      prismaMock.account.aggregate.mockResolvedValue({
        _sum: { revenue: new Prisma.Decimal(50000000) },
      } as Awaited<ReturnType<typeof prismaMock.account.aggregate>>);

      const result = await caller.stats();

      expect(result.total).toBe(100);
      expect(result.byIndustry).toEqual({
        Technology: 40,
        Finance: 30,
      });
      expect(result.withContacts).toBe(75);
      expect(result.withoutContacts).toBe(25);
      expect(result.totalRevenue).toBe('50000000');
    });

    it('should handle zero revenue', async () => {
      prismaMock.account.count.mockResolvedValueOnce(0);
      vi.mocked(prismaMock.account.groupBy).mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValueOnce(0);
      prismaMock.account.aggregate.mockResolvedValue({
        _sum: { revenue: null },
      } as Awaited<ReturnType<typeof prismaMock.account.aggregate>>);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.totalRevenue).toBe('0');
    });
  });

  describe('filterOptions', () => {
    it('should return filter options with counts', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([
          { industry: 'Technology', _count: 10 },
          { industry: 'Finance', _count: 5 },
          { industry: null, _count: 2 }, // null should be filtered out
        ] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([
          { ownerId: TEST_UUIDS.user1, _count: 8 },
          { ownerId: TEST_UUIDS.admin1, _count: 7 },
        ] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      prismaMock.user.findMany.mockResolvedValue([
        { id: TEST_UUIDS.user1, name: 'John Doe', email: 'john@example.com' },
        { id: TEST_UUIDS.admin1, name: null, email: 'jane@example.com' },
      ] as any);

      const result = await caller.filterOptions({});

      expect(result.industries).toHaveLength(2); // null filtered out
      expect(result.industries).toEqual([
        { value: 'Technology', label: 'Technology', count: 10 },
        { value: 'Finance', label: 'Finance', count: 5 },
      ]);
      expect(result.owners).toHaveLength(2);
      expect(result.owners[0]).toEqual({
        value: TEST_UUIDS.user1,
        label: 'John Doe',
        count: 8,
      });
      // User with null name should fall back to email
      expect(result.owners[1]).toEqual({
        value: TEST_UUIDS.admin1,
        label: 'jane@example.com',
        count: 7,
      });
    });

    it('should apply search filter to filterOptions query', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      await caller.filterOptions({ search: 'Tech' });

      expect(prismaMock.account.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'Tech', mode: 'insensitive' } },
              { website: { contains: 'Tech', mode: 'insensitive' } },
              { industry: { contains: 'Tech', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should apply industry filter to filterOptions query', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      await caller.filterOptions({ industry: 'Finance' });

      expect(prismaMock.account.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            industry: { contains: 'Finance', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should apply ownerId filter to filterOptions query', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      await caller.filterOptions({ ownerId: TEST_UUIDS.user1 });

      expect(prismaMock.account.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should handle empty owner IDs', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([
          { industry: 'Tech', _count: 5 },
        ] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([
          { ownerId: null, _count: 3 }, // null ownerId
        ] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      const result = await caller.filterOptions({});

      // Should not call findMany since no valid ownerIds
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(result.owners).toHaveLength(0); // null filtered out
    });

    it('should handle undefined input', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      const result = await caller.filterOptions(undefined);

      expect(result.industries).toEqual([]);
      expect(result.owners).toEqual([]);
    });

    it('should fallback to ownerId when owner not found in map', async () => {
      vi.mocked(prismaMock.account.groupBy)
        .mockResolvedValueOnce([] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>)
        .mockResolvedValueOnce([
          { ownerId: TEST_UUIDS.user1, _count: 5 },
        ] as unknown as Awaited<ReturnType<typeof prismaMock.account.groupBy>>);

      // Return empty - user not found
      prismaMock.user.findMany.mockResolvedValue([]);

      const result = await caller.filterOptions({});

      // Should fallback to ownerId when name not found
      expect(result.owners[0].label).toBe(TEST_UUIDS.user1);
    });
  });

  describe('create - additional error handling', () => {
    it('should throw BAD_REQUEST for non-validation errors', async () => {
      ctx.services!.account!.createAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong' },
      });

      await expect(caller.create({ name: 'Test Corp' })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Something went wrong',
        })
      );
    });
  });

  describe('list - additional filters', () => {
    it('should filter accounts by ownerId', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ ownerId: TEST_UUIDS.user1 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should apply custom sorting', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ sortBy: 'name', sortOrder: 'asc' });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      );
    });

    it('should return hasMore=false when on last page', async () => {
      const accounts = [mockAccount];
      const accountsWithRelations = accounts.map((account) => ({
        ...account,
        owner: mockUser,
        _count: { contacts: 1, opportunities: 0 },
      }));

      prismaMock.account.findMany.mockResolvedValue(accountsWithRelations);
      prismaMock.account.count.mockResolvedValue(1);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.hasMore).toBe(false);
    });

    it('should filter with only minRevenue', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ minRevenue: 1000000 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revenue: { gte: 1000000 },
          }),
        })
      );
    });

    it('should filter with only maxRevenue', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ maxRevenue: 5000000 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revenue: { lte: 5000000 },
          }),
        })
      );
    });

    it('should filter with only minEmployees', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ minEmployees: 50 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employees: { gte: 50 },
          }),
        })
      );
    });

    it('should filter with only maxEmployees', async () => {
      prismaMock.account.findMany.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValue(0);

      await caller.list({ maxEmployees: 100 });

      expect(prismaMock.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employees: { lte: 100 },
          }),
        })
      );
    });
  });

  describe('update - additional error handling', () => {
    it('should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      ctx.services!.account!.updateAccountInfo = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'UNKNOWN_ERROR', message: 'Database connection failed' },
      });

      await expect(caller.update({ id: TEST_UUIDS.account1, name: 'Test' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database connection failed',
        })
      );
    });

    it('should handle website as string', async () => {
      const mockDomainAccount = createMockDomainAccount({
        website: 'https://updated.com',
      });

      ctx.services!.account!.updateAccountInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      const result = await caller.update({
        id: TEST_UUIDS.account1,
        website: 'https://updated.com',
      });

      expect(ctx.services!.account!.updateAccountInfo).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        expect.objectContaining({
          website: 'https://updated.com',
        }),
        expect.any(String)
      );
      expect(result.website).toBe('https://updated.com');
    });
  });

  describe('delete - additional error handling', () => {
    it('should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'UNKNOWN_ERROR', message: 'Unexpected database error' },
      });

      await expect(caller.delete({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected database error',
        })
      );
    });
  });

  describe('service unavailable', () => {
    it('should throw INTERNAL_SERVER_ERROR when account service is not available', async () => {
      const ctxWithoutService = createTestContext();
      ctxWithoutService.services = { account: undefined as any };
      const callerWithoutService = accountRouter.createCaller(ctxWithoutService);

      await expect(callerWithoutService.create({ name: 'Test' })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Account service not available',
        })
      );
    });

    it('should throw INTERNAL_SERVER_ERROR when services object is missing', async () => {
      const ctxWithoutServices = createTestContext();
      ctxWithoutServices.services = undefined as any;
      const callerWithoutServices = accountRouter.createCaller(ctxWithoutServices);

      await expect(callerWithoutServices.getById({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Account service not available',
        })
      );
    });
  });
});
