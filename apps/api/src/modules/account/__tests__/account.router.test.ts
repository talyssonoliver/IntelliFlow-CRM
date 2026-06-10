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
import { Prisma } from '@intelliflow/db';
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
  tenantId: TEST_UUIDS.tenant,
  createdAt: new Date(),
  updatedAt: new Date(),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  assignOwner: vi.fn().mockReturnValue({ isSuccess: true, isFailure: false }),
  ...overrides,
});

describe('Account Router', () => {
  const ctx = createTestContext();
  const caller = accountRouter.createCaller(ctx);

  beforeEach(() => {
    // Reset is handled by setup.ts
    // Ensure $extends returns the mock itself so tenant-scoped prisma works
    (prismaMock as any).$extends = vi.fn().mockReturnValue(prismaMock);
    (prismaMock as any).$executeRawUnsafe = vi.fn().mockResolvedValue(undefined);
    // Support $transaction for B-05 TOCTOU wrapping — pass prismaMock as tx client
    (prismaMock as any).$transaction = vi
      .fn()
      .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(prismaMock));
    // PG-183: account.router now loads AccountAutomationSetting + queries
    // opportunity.count on delete. Stub both so existing test cases stay
    // focused on the behaviour under test (no row ⇒ factory defaults, no
    // open opportunities ⇒ no delete guard).
    (prismaMock.accountAutomationSetting.findUnique as any).mockResolvedValue(null);
    (prismaMock.accountRequiredField.findMany as any).mockResolvedValue([]);
    (prismaMock.opportunity.count as any).mockResolvedValue(0);
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
        error: {
          code: 'VALIDATION_ERROR',
          message: `Account with name "${input.name}" already exists`,
        },
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

      prismaMock.account.findFirst.mockResolvedValue({
        _count: { contacts: 3, opportunities: 2 },
        owner: { id: TEST_UUIDS.user1, name: 'Jane Smith', email: 'jane@co.com' },
      } as any);

      const result = await caller.getById({ id: TEST_UUIDS.account1 });

      expect(result.id).toBe(TEST_UUIDS.account1);
      expect(result.name).toBe('TechCorp Inc');
      expect(result.owner).toEqual({
        id: TEST_UUIDS.user1,
        name: 'Jane Smith',
        email: 'jane@co.com',
      });
      expect(result._count).toEqual({ contacts: 3, opportunities: 2 });
      expect(ctx.services!.account!.getAccountById).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        expect.any(String)
      );
    });

    it('should return owner with null name gracefully', async () => {
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      prismaMock.account.findFirst.mockResolvedValue({
        _count: { contacts: 0, opportunities: 0 },
        owner: { id: TEST_UUIDS.user1, name: null, email: 'jane@co.com' },
      } as any);

      const result = await caller.getById({ id: TEST_UUIDS.account1 });

      expect(result.owner).toEqual({ id: TEST_UUIDS.user1, name: null, email: 'jane@co.com' });
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

      // Mock getAccountById for tenant isolation check
      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
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
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      ctx.services!.account!.updateAccountInfo = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Account with name "Existing Corp" already exists',
        },
      });

      await expect(
        caller.update({ id: TEST_UUIDS.account1, name: 'Existing Corp' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete account without related records', async () => {
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await caller.delete({ id: TEST_UUIDS.account1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.account1);
      // IFC-271 D-01: delete now threads the acting user (tenantId, deletedBy)
      expect(ctx.services!.account!.deleteAccount).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        expect.any(String),
        expect.any(String)
      );
    });

    it('should throw PRECONDITION_FAILED if account has contacts', async () => {
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Cannot delete account with 5 associated contacts. Reassign or delete contacts first.',
        },
      });

      await expect(caller.delete({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('contacts'),
        })
      );
    });

    it('should throw PRECONDITION_FAILED if account has active opportunities', async () => {
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      ctx.services!.account!.deleteAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'Cannot delete account with 2 active opportunities. Close or reassign them first.',
        },
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

  describe('setParent', () => {
    it('forwards the guaranteed-non-null tenant actor, not an unsafe ctx.user! (B-06)', async () => {
      // Exercises the real procedure: it must pass typedCtx.tenant.userId (typed
      // non-null by tenantProcedure) as the actor — the fix that replaced the
      // unsafe `typedCtx.user!.userId` non-null assertion.
      ctx.services!.account!.setParent = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainAccount({ parentAccountId: TEST_UUIDS.account2 }),
      });

      const result = await caller.setParent({
        accountId: TEST_UUIDS.account1,
        parentAccountId: TEST_UUIDS.account2,
      });

      expect(result).toBeDefined();
      expect(ctx.services!.account!.setParent).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.account2,
        TEST_UUIDS.tenant,
        TEST_UUIDS.user1
      );
    });
  });

  describe('stats', () => {
    // stats still uses Prisma for aggregations
    it('should return account statistics', async () => {
      // stats calls count 3 times concurrently via Promise.all:
      //   count()                               → total (no where)
      //   count({where: {contacts: {some:{}}}}) → withContacts
      //   count({where: {opportunities:{some:{}}}}) → withOpportunities
      // Use mockImplementation to distinguish calls by args rather than order queue
      (prismaMock.account.count as any).mockImplementation(
        (args?: { where?: Record<string, unknown> }) => {
          if (args?.where?.contacts) return Promise.resolve(75);
          if (args?.where?.opportunities) return Promise.resolve(40);
          return Promise.resolve(100);
        }
      );
      (prismaMock.account.groupBy as any).mockResolvedValue([
        { industry: 'Technology', _count: 40 },
        { industry: 'Finance', _count: 30 },
      ]);
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
      (prismaMock.account.count as any).mockResolvedValue(0);
      (prismaMock.account.groupBy as any).mockResolvedValue([]);
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
      // groupBy is called twice concurrently in Promise.all:
      //   groupBy({by: ['industry'], ...}) → industry counts
      //   groupBy({by: ['ownerId'], ...})  → owner counts
      // Use mockImplementation to distinguish by 'by' argument
      (prismaMock.account.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('industry')) {
          return Promise.resolve([
            { industry: 'Technology', _count: 10 },
            { industry: 'Finance', _count: 5 },
            { industry: null, _count: 2 }, // null should be filtered out
          ]);
        }
        if (args.by?.includes('ownerId')) {
          return Promise.resolve([
            { ownerId: TEST_UUIDS.user1, _count: 8 },
            { ownerId: TEST_UUIDS.admin1, _count: 7 },
          ]);
        }
        return Promise.resolve([]);
      });

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
      (prismaMock.account.groupBy as any).mockResolvedValue([]);

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
      (prismaMock.account.groupBy as any).mockResolvedValue([]);

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
      (prismaMock.account.groupBy as any).mockResolvedValue([]);

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
      (prismaMock.account.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('industry'))
          return Promise.resolve([{ industry: 'Tech', _count: 5 }]);
        if (args.by?.includes('ownerId')) return Promise.resolve([{ ownerId: null, _count: 3 }]);
        return Promise.resolve([]);
      });

      const result = await caller.filterOptions({});

      // Should not call findMany since no valid ownerIds
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
      expect(result.owners).toHaveLength(0); // null filtered out
    });

    it('should handle undefined input', async () => {
      (prismaMock.account.groupBy as any).mockResolvedValue([]);

      const result = await caller.filterOptions(undefined);

      expect(result.industries).toEqual([]);
      expect(result.owners).toEqual([]);
    });

    it('should fallback to ownerId when owner not found in map', async () => {
      (prismaMock.account.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('industry')) return Promise.resolve([]);
        if (args.by?.includes('ownerId'))
          return Promise.resolve([{ ownerId: TEST_UUIDS.user1, _count: 5 }]);
        return Promise.resolve([]);
      });

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
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

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

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
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

      // PG-183 hardening: `normalizeWebsiteDomain` is ON by default, so the
      // router strips the scheme before handing to the service.
      expect(ctx.services!.account!.updateAccountInfo).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        expect.objectContaining({
          website: 'updated.com',
        }),
        expect.any(String),
        expect.any(String)
      );
      expect(result.website).toBe('https://updated.com');
    });
  });

  describe('delete - additional error handling', () => {
    it('should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      const mockDomainAccount = createMockDomainAccount();

      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

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
      ctxWithoutService.services = { account: undefined } as any;
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

  // ===========================================================================
  // IFC-185: New endpoint tests - getContacts, getOpportunities, getActivity
  // ===========================================================================

  describe('getContacts', () => {
    it('should return contacts for valid account', async () => {
      const mockContacts = [
        {
          id: TEST_UUIDS.contact1,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          phone: '+1234567891',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-01'),
        },
        {
          id: TEST_UUIDS.contact2,
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-02'),
        },
      ];

      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          contacts: mockContacts,
          nextCursor: undefined,
          total: 2,
        },
      });

      const result = await caller.getContacts({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.contacts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.nextCursor).toBeUndefined();
      expect(ctx.services!.account!.getAccountContacts).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ limit: 20 })
      );
    });

    it('should return empty array for account with no contacts', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          contacts: [],
          nextCursor: undefined,
          total: 0,
        },
      });

      const result = await caller.getContacts({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.contacts).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should paginate with cursor correctly', async () => {
      const mockContacts = Array.from({ length: 10 }, (_, i) => ({
        id: `contact-${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        email: `user${i}@example.com`,
        status: 'ACTIVE',
        createdAt: new Date(`2024-01-${(i + 1).toString().padStart(2, '0')}`),
      }));

      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          contacts: mockContacts,
          nextCursor: 'contact-9',
          total: 30,
        },
      });

      const result = await caller.getContacts({
        accountId: TEST_UUIDS.account1,
        limit: 10,
      });

      expect(result.contacts).toHaveLength(10);
      expect(result.nextCursor).toBe('contact-9');
      expect(result.total).toBe(30);
    });

    it('should respect limit parameter', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          contacts: [
            {
              id: 'c1',
              firstName: 'A',
              lastName: 'B',
              email: 'a@b.com',
              status: 'ACTIVE',
              createdAt: new Date(),
            },
          ],
          nextCursor: 'c1',
          total: 50,
        },
      });

      const result = await caller.getContacts({
        accountId: TEST_UUIDS.account1,
        limit: 1,
      });

      expect(ctx.services!.account!.getAccountContacts).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ limit: 1 })
      );
      expect(result.contacts).toHaveLength(1);
    });

    it('should filter by status when provided', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          contacts: [
            {
              id: 'c1',
              firstName: 'A',
              lastName: 'B',
              email: 'a@b.com',
              status: 'ACTIVE',
              createdAt: new Date(),
            },
          ],
          nextCursor: undefined,
          total: 1,
        },
      });

      await caller.getContacts({
        accountId: TEST_UUIDS.account1,
        status: ['ACTIVE'],
      });

      expect(ctx.services!.account!.getAccountContacts).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ status: ['ACTIVE'] })
      );
    });

    it('should filter by multiple statuses', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { contacts: [], nextCursor: undefined, total: 0 },
      });

      await caller.getContacts({
        accountId: TEST_UUIDS.account1,
        status: ['ACTIVE', 'INACTIVE'],
      });

      expect(ctx.services!.account!.getAccountContacts).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ status: ['ACTIVE', 'INACTIVE'] })
      );
    });

    it('should return NOT_FOUND for non-existent account', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getContacts({ accountId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should reject access to account from different tenant', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getContacts({ accountId: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should pass cursor to service', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { contacts: [], nextCursor: undefined, total: 0 },
      });

      await caller.getContacts({
        accountId: TEST_UUIDS.account1,
        cursor: TEST_UUIDS.contact1,
      });

      expect(ctx.services!.account!.getAccountContacts).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ cursor: TEST_UUIDS.contact1 })
      );
    });
  });

  describe('getOpportunities', () => {
    it('should return opportunities for valid account', async () => {
      const mockOpps = [
        {
          id: TEST_UUIDS.opportunity1,
          name: 'Enterprise Deal',
          stage: 'PROPOSAL',
          value: 50000,
          probability: 60,
          expectedCloseDate: new Date('2024-12-31'),
          createdAt: new Date('2024-01-01'),
        },
      ];

      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          opportunities: mockOpps,
          nextCursor: undefined,
          total: 1,
          summary: {
            totalValue: 50000,
            weightedValue: 30000,
            stageBreakdown: { PROPOSAL: 1 },
          },
        },
      });

      const result = await caller.getOpportunities({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.opportunities).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.summary.totalValue).toBe(50000);
      expect(result.summary.weightedValue).toBe(30000);
      expect(result.summary.stageBreakdown).toEqual({ PROPOSAL: 1 });
    });

    it('should return empty array for account with no opportunities', async () => {
      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          opportunities: [],
          nextCursor: undefined,
          total: 0,
          summary: { totalValue: 0, weightedValue: 0, stageBreakdown: {} },
        },
      });

      const result = await caller.getOpportunities({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.opportunities).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.summary.totalValue).toBe(0);
    });

    it('should calculate summary correctly', async () => {
      const mockOpps = [
        {
          id: 'o1',
          name: 'Deal A',
          stage: 'PROPOSAL',
          value: 10000,
          probability: 50,
          createdAt: new Date(),
        },
        {
          id: 'o2',
          name: 'Deal B',
          stage: 'QUALIFICATION',
          value: 20000,
          probability: 25,
          createdAt: new Date(),
        },
      ];

      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          opportunities: mockOpps,
          nextCursor: undefined,
          total: 2,
          summary: {
            totalValue: 30000,
            weightedValue: 10000, // 10000*0.5 + 20000*0.25
            stageBreakdown: { PROPOSAL: 1, QUALIFICATION: 1 },
          },
        },
      });

      const result = await caller.getOpportunities({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.summary.totalValue).toBe(30000);
      expect(result.summary.weightedValue).toBe(10000);
      expect(result.summary.stageBreakdown.PROPOSAL).toBe(1);
      expect(result.summary.stageBreakdown.QUALIFICATION).toBe(1);
    });

    it('should filter by stage when provided', async () => {
      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          opportunities: [],
          nextCursor: undefined,
          total: 0,
          summary: { totalValue: 0, weightedValue: 0, stageBreakdown: {} },
        },
      });

      await caller.getOpportunities({
        accountId: TEST_UUIDS.account1,
        stage: ['QUALIFICATION'],
      });

      expect(ctx.services!.account!.getAccountOpportunities).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ stage: ['QUALIFICATION'] })
      );
    });

    it('should paginate with cursor correctly', async () => {
      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          opportunities: [
            {
              id: 'o1',
              name: 'D',
              stage: 'PROPOSAL',
              value: 100,
              probability: 50,
              createdAt: new Date(),
            },
          ],
          nextCursor: 'o1',
          total: 20,
          summary: { totalValue: 100, weightedValue: 50, stageBreakdown: { PROPOSAL: 1 } },
        },
      });

      const result = await caller.getOpportunities({
        accountId: TEST_UUIDS.account1,
        limit: 1,
        cursor: TEST_UUIDS.opportunity1,
      });

      expect(ctx.services!.account!.getAccountOpportunities).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ cursor: TEST_UUIDS.opportunity1, limit: 1 })
      );
      expect(result.nextCursor).toBe('o1');
    });

    it('should return NOT_FOUND for non-existent account', async () => {
      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getOpportunities({ accountId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should reject access to account from different tenant', async () => {
      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getOpportunities({ accountId: TEST_UUIDS.account2 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });
  });

  describe('getActivity', () => {
    it('should merge contact and opportunity activities', async () => {
      const mockActivities = [
        {
          id: 'act-1',
          type: 'CONTACT_CREATED',
          description: 'Contact Jane Smith added',
          entityType: 'CONTACT' as const,
          entityId: TEST_UUIDS.contact1,
          entityName: 'Jane Smith',
          createdAt: new Date('2024-01-02'),
        },
        {
          id: 'act-2',
          type: 'OPPORTUNITY_CREATED',
          description: 'Opportunity Enterprise Deal created',
          entityType: 'OPPORTUNITY' as const,
          entityId: TEST_UUIDS.opportunity1,
          entityName: 'Enterprise Deal',
          createdAt: new Date('2024-01-01'),
        },
      ];

      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          activities: mockActivities,
          nextCursor: undefined,
        },
      });

      const result = await caller.getActivity({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.activities).toHaveLength(2);
      expect(result.activities[0].entityType).toBe('CONTACT');
      expect(result.activities[1].entityType).toBe('OPPORTUNITY');
    });

    it('should sort by createdAt descending', async () => {
      const earlier = new Date('2024-01-01');
      const later = new Date('2024-01-15');

      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          activities: [
            {
              id: 'act-2',
              type: 'CONTACT_CREATED',
              description: 'Newer activity',
              entityType: 'CONTACT' as const,
              entityId: TEST_UUIDS.contact1,
              entityName: 'Jane Smith',
              createdAt: later,
            },
            {
              id: 'act-1',
              type: 'OPPORTUNITY_CREATED',
              description: 'Older activity',
              entityType: 'OPPORTUNITY' as const,
              entityId: TEST_UUIDS.opportunity1,
              entityName: 'Enterprise Deal',
              createdAt: earlier,
            },
          ],
          nextCursor: undefined,
        },
      });

      const result = await caller.getActivity({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.activities[0].createdAt).toEqual(later);
      expect(result.activities[1].createdAt).toEqual(earlier);
    });

    it('should filter by activity type', async () => {
      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          activities: [
            {
              id: 'act-1',
              type: 'CONTACT_CREATED',
              description: 'Contact added',
              entityType: 'CONTACT' as const,
              entityId: TEST_UUIDS.contact1,
              entityName: 'Jane Smith',
              createdAt: new Date(),
            },
          ],
          nextCursor: undefined,
        },
      });

      await caller.getActivity({
        accountId: TEST_UUIDS.account1,
        types: ['CONTACT_CREATED'],
      });

      expect(ctx.services!.account!.getAccountActivity).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ types: ['CONTACT_CREATED'] })
      );
    });

    it('should paginate correctly across merged results', async () => {
      const activities = Array.from({ length: 10 }, (_, i) => ({
        id: `act-${i}`,
        type: i % 2 === 0 ? 'CONTACT_CREATED' : 'OPPORTUNITY_CREATED',
        description: `Activity ${i}`,
        entityType: (i % 2 === 0 ? 'CONTACT' : 'OPPORTUNITY') as 'CONTACT' | 'OPPORTUNITY',
        entityId: `entity-${i}`,
        entityName: `Entity ${i}`,
        createdAt: new Date(2024, 0, 10 - i),
      }));

      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          activities,
          nextCursor: activities[9].createdAt.toISOString(),
        },
      });

      const result = await caller.getActivity({
        accountId: TEST_UUIDS.account1,
        limit: 10,
      });

      expect(result.activities).toHaveLength(10);
      expect(result.nextCursor).toBeDefined();
    });

    it('should return NOT_FOUND for non-existent account', async () => {
      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getActivity({ accountId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should reject access to account from different tenant', async () => {
      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getActivity({ accountId: TEST_UUIDS.account2 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should pass cursor to service for pagination', async () => {
      const cursorDate = new Date('2024-01-05').toISOString();

      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { activities: [], nextCursor: undefined },
      });

      await caller.getActivity({
        accountId: TEST_UUIDS.account1,
        cursor: cursorDate,
      });

      expect(ctx.services!.account!.getAccountActivity).toHaveBeenCalledWith(
        TEST_UUIDS.account1,
        TEST_UUIDS.tenant,
        expect.objectContaining({ cursor: cursorDate })
      );
    });

    it('should return empty activities for account with no activity', async () => {
      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { activities: [], nextCursor: undefined },
      });

      const result = await caller.getActivity({
        accountId: TEST_UUIDS.account1,
      });

      expect(result.activities).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });
  });

  describe('account router tenant isolation (IFC-185)', () => {
    it('should reject getContacts for different tenant account', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getContacts({ accountId: TEST_UUIDS.account2 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should reject getOpportunities for different tenant account', async () => {
      ctx.services!.account!.getAccountOpportunities = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getOpportunities({ accountId: TEST_UUIDS.account2 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should reject getActivity for different tenant account', async () => {
      ctx.services!.account!.getAccountActivity = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      await expect(caller.getActivity({ accountId: TEST_UUIDS.account2 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('should not leak data through error messages', async () => {
      ctx.services!.account!.getAccountContacts = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { code: 'NOT_FOUND_ERROR', message: 'Account not found' },
      });

      try {
        await caller.getContacts({ accountId: TEST_UUIDS.account2 });
      } catch (e: any) {
        // Error should be generic "Account not found", not "Account belongs to different tenant"
        expect(e.message).toBe('Account not found');
        expect(e.message).not.toContain('tenant');
      }
    });
  });

  describe('getContacts - service unavailable', () => {
    it('should throw INTERNAL_SERVER_ERROR when service unavailable for getContacts', async () => {
      const ctxWithoutService = createTestContext();
      ctxWithoutService.services = { account: undefined } as any;
      const callerWithoutService = accountRouter.createCaller(ctxWithoutService);

      await expect(
        callerWithoutService.getContacts({ accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Account service not available',
        })
      );
    });
  });

  describe('getOpportunities - service unavailable', () => {
    it('should throw INTERNAL_SERVER_ERROR when service unavailable for getOpportunities', async () => {
      const ctxWithoutService = createTestContext();
      ctxWithoutService.services = { account: undefined } as any;
      const callerWithoutService = accountRouter.createCaller(ctxWithoutService);

      await expect(
        callerWithoutService.getOpportunities({ accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Account service not available',
        })
      );
    });
  });

  describe('getActivity - service unavailable', () => {
    it('should throw INTERNAL_SERVER_ERROR when service unavailable for getActivity', async () => {
      const ctxWithoutService = createTestContext();
      ctxWithoutService.services = { account: undefined } as any;
      const callerWithoutService = accountRouter.createCaller(ctxWithoutService);

      await expect(
        callerWithoutService.getActivity({ accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Account service not available',
        })
      );
    });
  });

  describe('assignees', () => {
    it('should return tenant-scoped user list', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'Alice', email: 'alice@co.com', role: 'ADMIN', avatarUrl: null } as any,
        {
          id: 'u2',
          name: null,
          email: 'bob@co.com',
          role: 'SALES_REP',
          avatarUrl: 'https://avatar.com/bob.jpg',
        } as any,
      ]);

      const result = await caller.assignees();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'u1', name: 'Alice', title: 'Administrator', avatar: null });
      expect(result[1]).toEqual({
        id: 'u2',
        name: 'bob@co.com',
        title: 'Sales Representative',
        avatar: 'https://avatar.com/bob.jpg',
      });
    });
  });

  describe('assignOwner', () => {
    const newOwnerUuid = TEST_UUIDS.user2 ?? '00000000-0000-0000-0000-000000000099';

    it('should update ownerId and return success with owner', async () => {
      prismaMock.account.findFirst.mockResolvedValue(mockAccount as any);
      prismaMock.user.findFirst.mockResolvedValue({
        id: newOwnerUuid,
        name: 'New Owner',
        email: 'new@co.com',
        tenantId: TEST_UUIDS.tenant,
      } as any);
      prismaMock.account.updateMany.mockResolvedValue({ count: 1 } as any);

      const mockDomainAccount = createMockDomainAccount();
      mockDomainAccount.assignOwner = vi
        .fn()
        .mockReturnValue({ isSuccess: true, isFailure: false });
      ctx.services!.account!.getAccountById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainAccount,
      });

      const result = await caller.assignOwner({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid });

      expect(result.success).toBe(true);
      expect(result.ownerId).toBe(newOwnerUuid);
    });

    it('should throw NOT_FOUND for non-existent account', async () => {
      prismaMock.account.findFirst.mockResolvedValue(null);

      await expect(
        caller.assignOwner({ id: TEST_UUIDS.nonExistent, ownerId: newOwnerUuid })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });

    it('should throw NOT_FOUND when target user does not exist', async () => {
      prismaMock.account.findFirst.mockResolvedValue(mockAccount as any);
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        caller.assignOwner({ id: TEST_UUIDS.account1, ownerId: newOwnerUuid })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });

    it('should reject cross-tenant user assignment (masked as NOT_FOUND)', async () => {
      prismaMock.account.findFirst.mockResolvedValue(mockAccount as any);
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(
        caller.assignOwner({ id: TEST_UUIDS.account1, ownerId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });
  });
});
