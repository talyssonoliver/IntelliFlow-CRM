import { TEST_UUIDS } from '../../../test/setup';
/**
 * Account Router Tests
 *
 * Comprehensive tests for all account router procedures:
 * - create, getById, list, update, delete, stats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { accountRouter } from '../account.router';
import { prismaMock, createTestContext, mockAccount, mockUser, mockContact, mockOpportunity } from '../../../test/setup';

describe('Account Router', () => {
  const caller = accountRouter.createCaller(createTestContext());

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

      prismaMock.account.create.mockResolvedValue({
        ...mockAccount,
        ...input,
      });

      const result = await caller.create(input);

      expect(result.name).toBe(input.name);
      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: {
          ...input,
          ownerId: TEST_UUIDS.user1,
        },
      });
    });

    it('should create account with minimal data', async () => {
      const input = {
        name: 'Minimal Corp',
      };

      prismaMock.account.create.mockResolvedValue({
        ...mockAccount,
        ...input,
      });

      const result = await caller.create(input);

      expect(result.name).toBe(input.name);
    });
  });

  describe('getById', () => {
    it('should return account with related data', async () => {
      const accountWithRelations = {
        ...mockAccount,
        owner: mockUser,
        contacts: [mockContact],
        opportunities: [mockOpportunity],
        _count: {
          contacts: 5,
          opportunities: 3,
        },
      };

      prismaMock.account.findUnique.mockResolvedValue(accountWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.account1 });

      expect(result).toMatchObject(accountWithRelations);
      expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.account1 },
        include: expect.objectContaining({
          owner: expect.any(Object),
          contacts: expect.any(Object),
          opportunities: expect.any(Object),
          _count: expect.any(Object),
        }),
      });
    });

    it('should throw NOT_FOUND for non-existent account', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('list', () => {
    it('should list accounts with pagination', async () => {
      const accounts = [mockAccount, { ...mockAccount, id: 'account-2', name: 'Corp 2' }];
      const accountsWithRelations = accounts.map(account => ({
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
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);

      const updated = { ...mockAccount, name: 'Updated Corp', revenue: 2000000 };
      prismaMock.account.update.mockResolvedValue(updated);

      const result = await caller.update({
        id: TEST_UUIDS.account1,
        name: 'Updated Corp',
        revenue: 2000000,
      });

      expect(result.name).toBe('Updated Corp');
      expect(result.revenue).toBe(2000000);
    });

    it('should throw NOT_FOUND when updating non-existent account', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.nonExistent, name: 'Test' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete account without related records', async () => {
      prismaMock.account.findUnique.mockResolvedValue({
        ...mockAccount,
        _count: { contacts: 0, opportunities: 0 },
      } as any);
      prismaMock.account.delete.mockResolvedValue(mockAccount);

      const result = await caller.delete({ id: TEST_UUIDS.account1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.account1);
    });

    it('should throw PRECONDITION_FAILED if account has contacts', async () => {
      prismaMock.account.findUnique.mockResolvedValue({
        ...mockAccount,
        _count: { contacts: 5, opportunities: 0 },
      } as any);

      await expect(caller.delete({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('5 contacts'),
        })
      );
    });

    it('should throw PRECONDITION_FAILED if account has opportunities', async () => {
      prismaMock.account.findUnique.mockResolvedValue({
        ...mockAccount,
        _count: { contacts: 0, opportunities: 2 },
      } as any);

      await expect(caller.delete({ id: TEST_UUIDS.account1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('2 opportunities'),
        })
      );
    });

    it('should throw NOT_FOUND for non-existent account', async () => {
      prismaMock.account.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    it('should return account statistics', async () => {
      prismaMock.account.count.mockResolvedValueOnce(100); // total
      prismaMock.account.groupBy.mockResolvedValue([
        { industry: 'Technology', _count: 40 },
        { industry: 'Finance', _count: 30 },
      ] as any);
      prismaMock.account.count.mockResolvedValueOnce(75); // withContacts
      prismaMock.account.aggregate.mockResolvedValue({
        _sum: { revenue: 50000000 },
      } as any);

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
      prismaMock.account.groupBy.mockResolvedValue([]);
      prismaMock.account.count.mockResolvedValueOnce(0);
      prismaMock.account.aggregate.mockResolvedValue({
        _sum: { revenue: null },
      } as any);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.totalRevenue).toBe('0');
    });
  });
});
