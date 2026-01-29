import { TEST_UUIDS } from '../../../test/setup';
/**
 * Contact Router Tests
 *
 * Comprehensive tests for all contact router procedures:
 * - create, getById, getByEmail, list, update, delete
 * - linkToAccount, unlinkFromAccount, stats
 *
 * Tests mock ContactService for procedures using hexagonal architecture
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

/**
 * Create a mock domain Contact for service responses
 */
const createMockDomainContact = (overrides: Record<string, unknown> = {}) => ({
  id: { value: TEST_UUIDS.contact1 },
  email: { value: 'contact@example.com' },
  firstName: 'Jane',
  lastName: 'Smith',
  title: 'CTO',
  phone: '+1234567891',
  department: 'Engineering',
  status: 'ACTIVE',
  accountId: TEST_UUIDS.account1,
  leadId: null,
  ownerId: TEST_UUIDS.user1,
  tenantId: TEST_UUIDS.tenant,
  hasAccount: true,
  isConvertedFromLead: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

describe('Contact Router', () => {
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

      const mockDomainContact = createMockDomainContact({
        id: { value: TEST_UUIDS.contact1 },
        email: { value: input.email },
        firstName: input.firstName,
        lastName: input.lastName,
        title: input.title,
        phone: input.phone,
        department: input.department,
        accountId: null,
        hasAccount: false,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainContact,
      });

      const result = await caller.create(input);

      expect(result.email).toBe(input.email);
      expect(result.firstName).toBe(input.firstName);
      // Verify service was called with expected fields
      // Note: phone may be transformed to value object by validators
      expect(ctx.services!.contact!.createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          title: input.title,
          department: input.department,
          ownerId: TEST_UUIDS.user1,
        })
      );
    });

    it('should throw CONFLICT if email already exists', async () => {
      const input = {
        email: 'existing@example.com',
        firstName: 'Test',
        lastName: 'User',
      };

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact with email existing@example.com already exists' },
      });

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
        accountId: TEST_UUIDS.nonExistent,
      };

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(caller.create(input)).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('not found'),
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

      const mockDomainContact = createMockDomainContact({
        email: { value: input.email },
        firstName: input.firstName,
        lastName: input.lastName,
        accountId: TEST_UUIDS.account1,
        hasAccount: true,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockDomainContact,
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

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Service verifies existence
      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(),
      });

      // Prisma returns relations
      prismaMock.contact.findUnique.mockResolvedValue(contactWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result).toMatchObject(contactWithRelations);
    });

    it('should throw NOT_FOUND for non-existent contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Contact not found: ${TEST_UUIDS.nonExistent}` },
      });

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

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactByEmail = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(),
      });

      prismaMock.contact.findUnique.mockResolvedValue(contactWithRelations);

      const result = await caller.getByEmail({ email: 'contact@example.com' });

      expect(result!.email).toBe('contact@example.com');
    });

    it('should throw NOT_FOUND for non-existent email', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactByEmail = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact with email nonexistent@example.com not found' },
      });

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

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue(contactsWithRelations);
      prismaMock.contact.count.mockResolvedValue(2);

      const result = await caller.list({ page: 1, limit: 20 });

      expect(result.contacts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(false);
    });

    it('should filter contacts by search term', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const updatedContact = createMockDomainContact({
        title: 'Senior Engineer',
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: updatedContact,
      });

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: updatedContact,
      });

      const result = await caller.update({
        id: TEST_UUIDS.contact1,
        title: 'Senior Engineer',
      });

      expect(result.title).toBe('Senior Engineer');
    });

    it('should throw NOT_FOUND when updating non-existent contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Contact not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(caller.update({ id: TEST_UUIDS.nonExistent, title: 'Test' })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should validate account exists when updating accountId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(
        caller.update({ id: TEST_UUIDS.contact1, accountId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete contact without opportunities', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 0 },
      } as any);

      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await caller.delete({ id: TEST_UUIDS.contact1 });

      expect(result.success).toBe(true);
      expect(result.id).toBe(TEST_UUIDS.contact1);
    });

    it('should throw PRECONDITION_FAILED if contact has opportunities', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const linkedContact = createMockDomainContact({
        accountId: TEST_UUIDS.account1,
        hasAccount: true,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: linkedContact,
      });

      const result = await caller.linkToAccount({
        contactId: TEST_UUIDS.contact1,
        accountId: TEST_UUIDS.account1,
      });

      expect(result.accountId).toBe(TEST_UUIDS.account1);
    });

    it('should throw NOT_FOUND if contact does not exist', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Contact not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.nonExistent, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw NOT_FOUND if account does not exist', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.contact1, accountId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('unlinkFromAccount', () => {
    it('should unlink contact from account', async () => {
      const unlinkedContact = createMockDomainContact({
        accountId: undefined,
        hasAccount: false,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: unlinkedContact,
      });

      const result = await caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 });

      expect(result.accountId).toBeNull();
    });

    it('should throw BAD_REQUEST if contact has no account', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact is not associated with any account' },
      });

      await expect(caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: expect.stringContaining('not linked'),
        })
      );
    });

    it('should throw NOT_FOUND for non-existent contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Contact not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(caller.unlinkFromAccount({ contactId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('stats', () => {
    it('should return contact statistics', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactStatistics = vi.fn().mockResolvedValue({
        total: 50,
        withAccount: 35,
        withoutAccount: 15,
        convertedFromLeads: 10,
        byDepartment: {
          Engineering: 20,
          Sales: 15,
        },
      });

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
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactStatistics = vi.fn().mockResolvedValue({
        total: 0,
        withAccount: 0,
        withoutAccount: 0,
        convertedFromLeads: 0,
        byDepartment: {},
      });

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

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.search({ query: 'nonexistent' });

      expect(result.contacts).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should meet <200ms KPI target', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.search({ query: 'test' });

      // The mocked query should be fast
      expect(result.meetsKpi).toBe(true);
      expect(result.durationMs).toBeLessThan(200);
    });

    it('should order results by lastName, firstName', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

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
