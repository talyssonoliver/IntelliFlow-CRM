import { TEST_UUIDS } from '../../../test/setup';
/**
 * Contact Router Tests
 *
 * Comprehensive tests for all contact router procedures:
 * - create, getById, getByEmail, list, update, delete
 * - linkToAccount, unlinkFromAccount, stats
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { contactRouter } from '../contact.router';
import {
  prismaMock,
  createTestContext,
  mockContact,
  mockAccount,
  mockUser,
  mockLead,
  mockOpportunity,
  mockTask,
} from '../../../test/setup';

describe('Contact Router', () => {
  const caller = contactRouter.createCaller(createTestContext());

  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('create', () => {
    it('should create a new contact with valid input', async () => {
      const input = {
        email: 'newcontact@example.com',
        firstName: 'Bob',
        lastName: 'Williams',
        title: 'VP Sales',
        phone: '+1555555555',
        department: 'Sales',
      };

      prismaMock.contact.findUnique.mockResolvedValue(null); // No existing contact
      prismaMock.contact.create.mockResolvedValue({
        ...mockContact,
        ...input,
      });

      const result = await caller.create(input);

      expect(result.email).toBe(input.email);
      expect(result.firstName).toBe(input.firstName);
      expect(prismaMock.contact.create).toHaveBeenCalledWith({
        data: {
          ...input,
          ownerId: TEST_UUIDS.user1,
        },
      });
    });

    it('should throw CONFLICT if email already exists', async () => {
      const input = {
        email: 'existing@example.com',
        firstName: 'Test',
        lastName: 'User',
      };

      prismaMock.contact.findUnique.mockResolvedValue(mockContact);

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
          message: expect.stringContaining('already exists'),
        })
      );
    });

    it('should throw NOT_FOUND if accountId does not exist', async () => {
      const input = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        accountId: TEST_UUIDS.nonExistent, // Use valid UUID that doesn't exist
      };

      prismaMock.contact.findUnique.mockResolvedValue(null); // No existing contact
      prismaMock.account.findUnique.mockResolvedValue(null); // Account not found

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Account'),
        })
      );
    });

    it('should create contact with valid accountId', async () => {
      const input = {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        accountId: TEST_UUIDS.account1,
      };

      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.contact.create.mockResolvedValue({
        ...mockContact,
        ...input,
      });

      const result = await caller.create(input);

      expect(result.accountId).toBe(TEST_UUIDS.account1);
    });
  });

  describe('getById', () => {
    it('should return contact with related data', async () => {
      const contactWithRelations = {
        ...mockContact,
        owner: mockUser,
        account: mockAccount,
        lead: mockLead,
        opportunities: [mockOpportunity],
        tasks: [mockTask],
      };

      prismaMock.contact.findUnique.mockResolvedValue(contactWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result).toMatchObject(contactWithRelations);
      expect(prismaMock.contact.findUnique).toHaveBeenCalledWith({
        where: { id: TEST_UUIDS.contact1 },
        include: expect.objectContaining({
          owner: expect.any(Object),
          account: true,
          lead: expect.any(Object),
          opportunities: expect.any(Object),
          tasks: expect.any(Object),
        }),
      });
    });

    it('should throw NOT_FOUND for non-existent contact', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('getByEmail', () => {
    it('should return contact by email', async () => {
      const contactWithRelations = {
        ...mockContact,
        owner: mockUser,
        account: mockAccount,
      };

      prismaMock.contact.findUnique.mockResolvedValue(contactWithRelations);

      const result = await caller.getByEmail({ email: 'contact@example.com' });

      expect(result.email).toBe('contact@example.com');
      expect(prismaMock.contact.findUnique).toHaveBeenCalledWith({
        where: { email: 'contact@example.com' },
        include: expect.any(Object),
      });
    });

    it('should throw NOT_FOUND for non-existent email', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.getByEmail({ email: 'nonexistent@example.com' })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('list', () => {
    it('should list contacts with pagination', async () => {
      const contacts = [
        mockContact,
        { ...mockContact, id: 'contact-2', email: 'contact2@example.com' },
      ];
      const contactsWithRelations = contacts.map((contact) => ({
        ...contact,
        owner: mockUser,
        account: mockAccount,
        _count: { opportunities: 2, tasks: 1 },
      }));

      prismaMock.contact.findMany.mockResolvedValue(contactsWithRelations);
      prismaMock.contact.count.mockResolvedValue(2); // Total matches returned records

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.contacts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(false); // 0 + 2 < 2 = false
    });

    it('should filter contacts by search term', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      await caller.list({ search: 'Jane' });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'Jane', mode: 'insensitive' } },
              { firstName: { contains: 'Jane', mode: 'insensitive' } },
              { lastName: { contains: 'Jane', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter contacts by accountId', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      await caller.list({ accountId: TEST_UUIDS.account1 });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: TEST_UUIDS.account1,
          }),
        })
      );
    });

    it('should filter contacts by department', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      await caller.list({ department: 'Engineering' });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            department: { contains: 'Engineering', mode: 'insensitive' },
          }),
        })
      );
    });
  });

  describe('update', () => {
    it('should update contact with valid data', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);

      const updated = { ...mockContact, title: 'Senior Engineer' };
      prismaMock.contact.update.mockResolvedValue(updated);

      const result = await caller.update({
        id: TEST_UUIDS.contact1,
        title: 'Senior Engineer',
      });

      expect(result.title).toBe('Senior Engineer');
    });

    it('should throw NOT_FOUND when updating non-existent contact', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.update({ id: TEST_UUIDS.nonExistent, title: 'Test' })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should validate account exists when updating accountId', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.account.findUnique.mockResolvedValue(null);

      await expect(
        caller.update({ id: TEST_UUIDS.contact1, accountId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Account'),
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete contact without opportunities', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 0 },
      } as any);
      prismaMock.contact.delete.mockResolvedValue(mockContact);

      const result = await caller.delete({ id: TEST_UUIDS.contact1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.contact1);
    });

    it('should throw PRECONDITION_FAILED if contact has opportunities', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 3 },
      } as any);

      await expect(caller.delete({ id: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'PRECONDITION_FAILED',
          message: expect.stringContaining('3 associated opportunities'),
        })
      );
    });

    it('should throw NOT_FOUND for non-existent contact', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('linkToAccount', () => {
    it('should link contact to account', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.contact.update.mockResolvedValue({
        ...mockContact,
        accountId: TEST_UUIDS.account1,
      });

      const result = await caller.linkToAccount({
        contactId: TEST_UUIDS.contact1,
        accountId: TEST_UUIDS.account1,
      });

      expect(result.accountId).toBe(TEST_UUIDS.account1);
    });

    it('should throw NOT_FOUND if contact does not exist', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.nonExistent, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Contact'),
        })
      );
    });

    it('should throw NOT_FOUND if account does not exist', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.account.findUnique.mockResolvedValue(null);

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.contact1, accountId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Account'),
        })
      );
    });
  });

  describe('unlinkFromAccount', () => {
    it('should unlink contact from account', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        accountId: TEST_UUIDS.account1,
      });
      prismaMock.contact.update.mockResolvedValue({
        ...mockContact,
        accountId: null,
      });

      const result = await caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 });

      expect(result.accountId).toBeNull();
    });

    it('should throw BAD_REQUEST if contact has no account', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        accountId: null,
      });

      await expect(caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('not linked'),
        })
      );
    });

    it('should throw NOT_FOUND for non-existent contact', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.unlinkFromAccount({ contactId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    it('should return contact statistics', async () => {
      prismaMock.contact.count.mockResolvedValueOnce(50); // total
      vi.mocked(prismaMock.contact.groupBy).mockResolvedValue([
        { department: 'Engineering', _count: 20 },
        { department: 'Sales', _count: 15 },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.contact.groupBy>>);
      prismaMock.contact.count.mockResolvedValueOnce(35); // withAccounts

      const result = await caller.stats();

      expect(result.total).toBe(50);
      expect(result.byDepartment).toEqual({
        Engineering: 20,
        Sales: 15,
      });
      expect(result.withAccounts).toBe(35);
      expect(result.withoutAccounts).toBe(15);
    });

    it('should handle empty statistics', async () => {
      prismaMock.contact.count.mockResolvedValueOnce(0);
      vi.mocked(prismaMock.contact.groupBy).mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValueOnce(0);

      const result = await caller.stats();

      expect(result.total).toBe(0);
      expect(result.byDepartment).toEqual({});
      expect(result.withAccounts).toBe(0);
      expect(result.withoutAccounts).toBe(0);
    });
  });

  describe('search (IFC-089)', () => {
    it('should search contacts by query string', async () => {
      const searchResults = [
        {
          id: TEST_UUIDS.contact1,
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          title: 'Engineer',
          phone: null,
          department: 'Engineering',
          accountId: null,
        },
        {
          id: TEST_UUIDS.contact2,
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          title: 'Manager',
          phone: null,
          department: 'Sales',
          accountId: TEST_UUIDS.account1,
        },
      ];

      prismaMock.contact.findMany.mockResolvedValue(searchResults as any);

      const result = await caller.search({ query: 'john' });

      expect(result.contacts).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.performanceTarget).toBe(200);
      expect(typeof result.durationMs).toBe('number');
      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { email: { contains: 'john', mode: 'insensitive' } },
              { firstName: { contains: 'john', mode: 'insensitive' } },
              { lastName: { contains: 'john', mode: 'insensitive' } },
            ]),
          }),
          take: 20,
        })
      );
    });

    it('should respect limit parameter', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test', limit: 10 });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      );
    });

    it('should include account when requested', async () => {
      const searchWithAccount = [
        {
          id: TEST_UUIDS.contact1,
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          title: 'Engineer',
          phone: null,
          department: 'Engineering',
          accountId: TEST_UUIDS.account1,
          account: { id: TEST_UUIDS.account1, name: 'Acme Inc' },
        },
      ];

      prismaMock.contact.findMany.mockResolvedValue(searchWithAccount as any);

      const result = await caller.search({ query: 'john', includeAccount: true });

      expect(result.contacts[0]).toHaveProperty('account');
      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            account: expect.objectContaining({
              select: { id: true, name: true },
            }),
          }),
        })
      );
    });

    it('should return empty results for no matches', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.search({ query: 'nonexistent' });

      expect(result.contacts).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should meet <200ms KPI target', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.search({ query: 'test' });

      // The mocked query should be fast
      expect(result.meetsKpi).toBe(true);
      expect(result.durationMs).toBeLessThan(200);
    });

    it('should order results by lastName, firstName', async () => {
      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test' });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      );
    });
  });
});
