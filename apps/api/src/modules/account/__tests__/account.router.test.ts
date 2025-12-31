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
});
