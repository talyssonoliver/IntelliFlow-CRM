/**
 * Contact Router Contract Tests (IFC-129)
 *
 * Verifies the tRPC API contract for contact operations:
 * - Input/output type validation
 * - Error response contracts
 * - Relationship contracts (account linking)
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
 * Contact entity contract schema
 */
const contactResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
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
  const caller = contactRouter.createCaller(createTestContext());

  describe('create - Input Contract', () => {
    it('should require email, firstName, and lastName', async () => {
      const validInput = {
        email: 'contact@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      };

      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.contact.create.mockResolvedValue({
        ...mockContact,
        ...validInput,
      });

      const result = await caller.create(validInput);

      expect(result.email).toBe(validInput.email);
      expect(result.firstName).toBe(validInput.firstName);
      expect(result.lastName).toBe(validInput.lastName);
    });

    it('should enforce email format', async () => {
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

      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.contact.create.mockResolvedValue({
        ...mockContact,
        ...inputWithOptionals,
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

      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.account.findUnique.mockResolvedValue(mockAccount);
      prismaMock.contact.create.mockResolvedValue({
        ...mockContact,
        ...input,
      });

      const result = await caller.create(input);
      expect(result.accountId).toBe(input.accountId);
    });
  });

  describe('create - Output Contract', () => {
    it('should return contact with all required fields', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.contact.create.mockResolvedValue(mockContact);

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
      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.contact.create.mockResolvedValue({
        ...mockContact,
        ownerId: TEST_UUIDS.user1,
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
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);

      try {
        await caller.create({
          email: 'existing@example.com',
          firstName: 'Test',
          lastName: 'User',
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('CONFLICT');
        expect(error.message).toContain('already exists');
      }
    });

    it('should return NOT_FOUND for invalid accountId', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);
      prismaMock.account.findUnique.mockResolvedValue(null);

      try {
        await caller.create({
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          accountId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toContain('Account');
      }
    });
  });

  describe('getById - Contract', () => {
    it('should require valid UUID', async () => {
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

      prismaMock.contact.findUnique.mockResolvedValue(contactWithRelations);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result).toHaveProperty('owner');
      expect(result).toHaveProperty('account');
    });

    it('should throw NOT_FOUND with correct code', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      try {
        await caller.getById({ id: TEST_UUIDS.nonExistent });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getByEmail - Contract', () => {
    it('should require valid email format', async () => {
      await expect(caller.getByEmail({ email: 'invalid' })).rejects.toThrow();
    });

    it('should return contact when found by email', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        owner: mockUser,
        account: mockAccount,
      });

      const result = await caller.getByEmail({ email: 'contact@example.com' });

      expect(result.email).toBe('contact@example.com');
    });

    it('should throw NOT_FOUND for non-existent email', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(null);

      try {
        await caller.getByEmail({ email: 'nonexistent@example.com' });
        fail('Should have thrown');
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
      await expect(caller.list({ page: 0 })).rejects.toThrow();
      await expect(caller.list({ limit: 0 })).rejects.toThrow();
    });
  });

  describe('update - Contract', () => {
    it('should require id for update', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.update({ title: 'New Title' })).rejects.toThrow();
    });

    it('should accept partial updates', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.contact.update.mockResolvedValue({
        ...mockContact,
        title: 'Updated Title',
      });

      const result = await caller.update({
        id: TEST_UUIDS.contact1,
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should validate accountId on update', async () => {
      prismaMock.contact.findUnique.mockResolvedValue(mockContact);
      prismaMock.account.findUnique.mockResolvedValue(null);

      try {
        await caller.update({
          id: TEST_UUIDS.contact1,
          accountId: TEST_UUIDS.nonExistent,
        });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('delete - Contract', () => {
    it('should return success response', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 0 },
      } as any);
      prismaMock.contact.delete.mockResolvedValue(mockContact);

      const result = await caller.delete({ id: TEST_UUIDS.contact1 });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('id');
      expect(result.success).toBe(true);
    });

    it('should throw PRECONDITION_FAILED if has opportunities', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 3 },
      } as any);

      try {
        await caller.delete({ id: TEST_UUIDS.contact1 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('PRECONDITION_FAILED');
      }
    });
  });

  describe('linkToAccount - Contract', () => {
    it('should require contactId and accountId', async () => {
      // @ts-expect-error - Testing contract
      await expect(caller.linkToAccount({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow();
    });

    it('should return updated contact with accountId', async () => {
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
  });

  describe('unlinkFromAccount - Contract', () => {
    it('should return contact with null accountId', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        accountId: TEST_UUIDS.account1,
      });
      prismaMock.contact.update.mockResolvedValue({
        ...mockContact,
        accountId: null,
      });

      const result = await caller.unlinkFromAccount({
        contactId: TEST_UUIDS.contact1,
      });

      expect(result.accountId).toBeNull();
    });

    it('should throw BAD_REQUEST if not linked', async () => {
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        accountId: null,
      });

      try {
        await caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('search - Contract', () => {
    it('should return search response with performance metrics', async () => {
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
      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test', limit: 10 });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('should accept includeAccount parameter', async () => {
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
      prismaMock.contact.count.mockResolvedValueOnce(50);
      vi.mocked(prismaMock.contact.groupBy).mockResolvedValue([
        { department: 'Engineering', _count: 20 },
      ] as any);
      prismaMock.contact.count.mockResolvedValueOnce(35);

      const result = await caller.stats();

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('byDepartment');
      expect(result).toHaveProperty('withAccounts');
      expect(result).toHaveProperty('withoutAccounts');
      expect(typeof result.total).toBe('number');
    });
  });
});
