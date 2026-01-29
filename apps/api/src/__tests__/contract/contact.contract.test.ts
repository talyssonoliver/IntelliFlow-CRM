/**
 * Contact Router Contract Tests (IFC-129)
 *
 * Verifies the tRPC API contract for contact operations:
 * - Input/output type validation
 * - Error response contracts
 * - Relationship contracts (account linking)
 *
 * Tests mock ContactService for procedures using hexagonal architecture
 *
 * @see Sprint 6 - IFC-129: UI and Contract Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { contactRouter } from '../../modules/contact/contact.router';
import {
  prismaMock,
  createTestContext,
  mockContact,
  mockAccount,
  mockUser,
  mockLead,
  mockOpportunity,
  mockTask,
  TEST_UUIDS,
} from '../../test/setup';

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
  // Extended fields (IFC-089)
  streetAddress: '123 Tech Street',
  city: 'San Francisco',
  zipCode: '94102',
  company: 'TechCorp Inc',
  linkedInUrl: 'https://linkedin.com/in/janesmith',
  contactType: 'customer',
  tags: ['enterprise', 'vip'],
  contactNotes: 'Key technical contact',
  hasAccount: true,
  isConvertedFromLead: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

/**
 * Contact list response contract schema
 */
const contactListResponseSchema = z.object({
  contacts: z.array(z.any()),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

/**
 * Contact search response contract schema
 */
const contactSearchResponseSchema = z.object({
  contacts: z.array(z.any()),
  count: z.number().int().min(0),
  durationMs: z.number(),
  meetsKpi: z.boolean(),
  performanceTarget: z.number(),
});

describe('Contact Router Contract Tests', () => {
  describe('create - Input Contract', () => {
    it('should require email, firstName, and lastName', async () => {
      const validInput = {
        email: 'contact@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      };

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({
          email: { value: validInput.email },
          firstName: validInput.firstName,
          lastName: validInput.lastName,
        }),
      });

      const result = await caller.create(validInput);

      expect(result.email).toBe(validInput.email);
      expect(result.firstName).toBe(validInput.firstName);
      expect(result.lastName).toBe(validInput.lastName);
    });

    it('should enforce email format', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      const invalidInput = {
        email: 'not-an-email',
        firstName: 'Test',
        lastName: 'User',
      };

      await expect(caller.create(invalidInput as any)).rejects.toThrow();
    });

    it('should accept optional fields', async () => {
      const inputWithOptionals = {
        email: 'contact@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'CTO',
        phone: '+1234567890',
        department: 'Engineering',
      };

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(inputWithOptionals),
      });

      const result = await caller.create(inputWithOptionals);

      expect(result.title).toBe(inputWithOptionals.title);
      expect(result.department).toBe(inputWithOptionals.department);
    });

    it('should validate accountId if provided', async () => {
      const input = {
        email: 'contact@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        accountId: TEST_UUIDS.account1,
      };

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ accountId: TEST_UUIDS.account1 }),
      });

      const result = await caller.create(input);
      expect(result.accountId).toBe(input.accountId);
    });
  });

  describe('create - Output Contract', () => {
    it('should return contact with all required fields', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(),
      });

      const result = await caller.create({
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'Contact',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('ownerId');
      expect(result).toHaveProperty('createdAt');
    });

    it('should return ownerId matching the authenticated user', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ ownerId: TEST_UUIDS.user1 }),
      });

      const result = await caller.create({
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'Contact',
      });

      expect(result.ownerId).toBe(TEST_UUIDS.user1);
    });
  });

  describe('create - Error Contract', () => {
    it('should return CONFLICT for duplicate email', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact with email existing@example.com already exists' },
      });

      try {
        await caller.create({
          email: 'existing@example.com',
          firstName: 'Test',
          lastName: 'User',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('CONFLICT');
        expect(error.message).toContain('already exists');
      }
    });

    it('should return NOT_FOUND for invalid accountId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      try {
        await caller.create({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          accountId: TEST_UUIDS.nonExistent,
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getById - Contract', () => {
    it('should require valid UUID', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      await expect(caller.getById({ id: 'invalid' })).rejects.toThrow();
    });

    it('should return contact with relations', async () => {
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

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(),
      });

      prismaMock.contact.findUnique.mockResolvedValue(contactWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result).toHaveProperty('owner');
      expect(result).toHaveProperty('account');
    });

    it('should throw NOT_FOUND with correct code', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Contact not found: ${TEST_UUIDS.nonExistent}` },
      });

      try {
        await caller.getById({ id: TEST_UUIDS.nonExistent });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getByEmail - Contract', () => {
    it('should require valid email format', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      await expect(caller.getByEmail({ email: 'invalid' })).rejects.toThrow();
    });

    it('should return contact when found by email', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactByEmail = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(),
      });

      prismaMock.contact.findUnique.mockResolvedValue(mockContact as never);

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

      try {
        await caller.getByEmail({ email: 'nonexistent@example.com' });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('list - Contract', () => {
    beforeEach(() => {
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);
    });

    it('should return paginated response', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      const result = await caller.list({});

      const parseResult = contactListResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('contacts');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('hasMore');
    });

    it('should accept valid filter parameters', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      await caller.list({
        page: 1,
        limit: 20,
        search: 'test',
        accountId: TEST_UUIDS.account1,
        department: 'Engineering',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(prismaMock.contact.findMany).toHaveBeenCalled();
    });

    it('should enforce pagination limits', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      await expect(caller.list({ page: 0 })).rejects.toThrow();
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });
  });

  describe('update - Contract', () => {
    it('should require id for update', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // @ts-expect-error - Testing contract
      await expect(caller.update({ title: 'New Title' })).rejects.toThrow();
    });

    it('should accept partial updates', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ title: 'Updated Title' }),
      });

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ title: 'Updated Title' }),
      });

      const result = await caller.update({
        id: TEST_UUIDS.contact1,
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should validate accountId on update', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Account not found: ${TEST_UUIDS.nonExistent}` },
      });

      try {
        await caller.update({
          id: TEST_UUIDS.contact1,
          accountId: TEST_UUIDS.nonExistent,
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('delete - Contract', () => {
    it('should return success response', async () => {
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

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('id');
      expect(result.success).toBe(true);
    });

    it('should throw PRECONDITION_FAILED if has opportunities', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 3 },
      } as any);

      try {
        await caller.delete({ id: TEST_UUIDS.contact1 });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('PRECONDITION_FAILED');
      }
    });
  });

  describe('linkToAccount - Contract', () => {
    it('should require contactId and accountId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // @ts-expect-error - Testing contract
      await expect(caller.linkToAccount({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow();
    });

    it('should return updated contact with accountId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ accountId: TEST_UUIDS.account1 }),
      });

      const result = await caller.linkToAccount({
        contactId: TEST_UUIDS.contact1,
        accountId: TEST_UUIDS.account1,
      });

      expect(result.accountId).toBe(TEST_UUIDS.account1);
    });
  });

  describe('unlinkFromAccount - Contract', () => {
    it('should return contact with null accountId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ accountId: undefined, hasAccount: false }),
      });

      const result = await caller.unlinkFromAccount({
        contactId: TEST_UUIDS.contact1,
      });

      expect(result.accountId).toBeNull();
    });

    it('should throw BAD_REQUEST if not linked', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact is not associated with any account' },
      });

      try {
        await caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('search - Contract', () => {
    it('should return search response with performance metrics', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.search({ query: 'test' });

      const parseResult = contactSearchResponseSchema.safeParse(result);
      expect(parseResult.success).toBe(true);

      expect(result).toHaveProperty('contacts');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('meetsKpi');
      expect(result).toHaveProperty('performanceTarget');
    });

    it('should accept limit parameter', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test', limit: 10 });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('should accept includeAccount parameter', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test', includeAccount: true });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            account: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('stats - Contract', () => {
    it('should return stats with correct structure', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.getContactStatistics = vi.fn().mockResolvedValue({
        total: 50,
        withAccount: 35,
        withoutAccount: 15,
        convertedFromLeads: 10,
        byDepartment: { Engineering: 20 },
      });

      const result = await caller.stats();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byDepartment');
      expect(result).toHaveProperty('withAccounts');
      expect(result).toHaveProperty('withoutAccounts');
      expect(typeof result.total).toBe('number');
    });
  });
});
