/**
 * Contact Router Additional Tests
 *
 * Supplementary tests to improve coverage for contact.router.ts.
 * Covers uncovered branches: service null check, error paths in create/update/delete,
 * linkToAccount CONFLICT/BAD_REQUEST, unlinkFromAccount generic error,
 * linkToLead FORBIDDEN/BAD_REQUEST, filterOptions, bulkEmail, bulkExport, bulkDelete,
 * list with ownerId/status filters, search slow query warning, and getTimeline cursor/sort.
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { contactRouter } from '../contact.router';
import {
  prismaMock,
  createTestContext,
  mockContact,
  mockUser,
  mockAccount,
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
  streetAddress: null,
  city: null,
  zipCode: null,
  company: null,
  linkedInUrl: null,
  contactType: null,
  tags: [],
  contactNotes: null,
  lastContactedAt: null, // IFC-192
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  getDomainEvents: () => [],
  clearDomainEvents: () => {},
  ...overrides,
});

describe('Contact Router - Additional Coverage', () => {
  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('getContactService null check', () => {
    it('should throw INTERNAL_SERVER_ERROR when contact service is null', async () => {
      const ctx = createTestContext();
      // Remove the contact service
      ctx.services = { ...ctx.services, contact: undefined } as any;
      const caller = contactRouter.createCaller(ctx);

      await expect(
        caller.create({ email: 'test@example.com', firstName: 'Test', lastName: 'User' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Contact service not available',
        })
      );
    });

    it('should still return stats when service is null (IFC-252: stats bypasses service)', async () => {
      const ctx = createTestContext();
      ctx.services = { ...ctx.services, contact: undefined } as any;
      const caller = contactRouter.createCaller(ctx);

      // IFC-252: stats uses prismaWithTenant directly, not ContactService
      prismaMock.contact.count.mockResolvedValue(0);
      (prismaMock.contact.groupBy as any).mockResolvedValue([] as any);

      const result = await caller.stats();
      expect(result.total).toBe(0);
    });
  });

  describe('create - generic BAD_REQUEST error path', () => {
    it('should throw BAD_REQUEST for generic service failure', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.createContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid input data' },
      });

      await expect(
        caller.create({ email: 'bad@example.com', firstName: 'Test', lastName: 'User' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Invalid input data',
        })
      );
    });
  });

  describe('update - disassociate from account (accountId null)', () => {
    it('should disassociate contact from account when accountId is null', async () => {
      const updatedContact = createMockDomainContact({
        accountId: null,
        hasAccount: false,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
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
        accountId: null,
      });

      expect(result.accountId).toBeNull();
      expect(ctx.services!.contact!.disassociateFromAccount).toHaveBeenCalledWith(
        TEST_UUIDS.contact1,
        expect.any(String)
      );
    });

    it('should ignore "not associated" error when disassociating', async () => {
      const contact = createMockDomainContact({ accountId: null, hasAccount: false });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact is not associated with any account' },
      });

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: contact,
      });

      const result = await caller.update({
        id: TEST_UUIDS.contact1,
        accountId: null,
      });

      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when disassociating from non-existent contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact not found' },
      });

      await expect(caller.update({ id: TEST_UUIDS.nonExistent, accountId: null })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw BAD_REQUEST for generic disassociate error', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Database constraint violation' },
      });

      await expect(caller.update({ id: TEST_UUIDS.contact1, accountId: null })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
        })
      );
    });
  });

  describe('update - associate with new account', () => {
    it('should associate contact with new account', async () => {
      const updatedContact = createMockDomainContact({
        accountId: TEST_UUIDS.account2,
        hasAccount: true,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
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
        accountId: TEST_UUIDS.account2,
      });

      expect(ctx.services!.contact!.associateWithAccount).toHaveBeenCalledWith(
        TEST_UUIDS.contact1,
        TEST_UUIDS.account2,
        expect.any(String),
        expect.any(String)
      );
    });

    it('should throw when associate with account fails', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Account not found' },
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

  describe('update - getContactById failure after update', () => {
    it('should throw NOT_FOUND when getContactById fails after successful update', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.updateContactInfo = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact(),
      });

      ctx.services!.contact!.getContactById = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact not found after update' },
      });

      await expect(
        caller.update({ id: TEST_UUIDS.contact1, firstName: 'Updated' })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });
  });

  describe('delete - service failure error paths', () => {
    it('should throw NOT_FOUND when delete service returns not found', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 0 },
      } as any);

      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact not found' },
      });

      await expect(caller.delete({ id: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw BAD_REQUEST for generic delete failure', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 0 },
      } as any);

      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Cannot delete contact with active integrations' },
      });

      await expect(caller.delete({ id: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
        })
      );
    });
  });

  describe('linkToAccount - CONFLICT and BAD_REQUEST paths', () => {
    it('should throw CONFLICT when contact is already associated', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact is already associated with this account' },
      });

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.contact1, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
        })
      );
    });

    it('should throw BAD_REQUEST for generic linkToAccount error', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.associateWithAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid account type for this contact' },
      });

      await expect(
        caller.linkToAccount({ contactId: TEST_UUIDS.contact1, accountId: TEST_UUIDS.account1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Invalid account type for this contact',
        })
      );
    });
  });

  describe('unlinkFromAccount - generic BAD_REQUEST path', () => {
    it('should throw BAD_REQUEST for generic unlinkFromAccount error', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.disassociateFromAccount = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Cannot unlink while deal is active' },
      });

      await expect(caller.unlinkFromAccount({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Cannot unlink while deal is active',
        })
      );
    });
  });

  describe('linkToLead - FORBIDDEN and BAD_REQUEST paths', () => {
    it('should throw FORBIDDEN when lead is from different tenant', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact and lead must belong to the same tenant' },
      });

      await expect(
        caller.linkToLead({ contactId: TEST_UUIDS.contact1, leadId: TEST_UUIDS.lead1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FORBIDDEN',
        })
      );
    });

    it('should throw BAD_REQUEST for generic linkToLead error', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid lead status for linking' },
      });

      await expect(
        caller.linkToLead({ contactId: TEST_UUIDS.contact1, leadId: TEST_UUIDS.lead1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Invalid lead status for linking',
        })
      );
    });

    it('should throw CONFLICT on Unique constraint violation', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Unique constraint failed' },
      });

      await expect(
        caller.linkToLead({ contactId: TEST_UUIDS.contact1, leadId: TEST_UUIDS.lead1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'CONFLICT',
        })
      );
    });
  });

  describe('unlinkFromLead - BAD_REQUEST path', () => {
    it('should throw NOT_FOUND when contact is not found', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.unlinkFromLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact not found' },
      });

      await expect(caller.unlinkFromLead({ contactId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw BAD_REQUEST for generic unlinkFromLead error', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.unlinkFromLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Cannot unlink: active conversion in progress' },
      });

      await expect(caller.unlinkFromLead({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: 'Cannot unlink: active conversion in progress',
        })
      );
    });
  });

  describe('filterOptions', () => {
    it('should return filter options with no input', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // groupBy called concurrently: distinguish by 'by' field
      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department')) {
          return Promise.resolve([
            { department: 'Engineering', _count: 10 },
            { department: 'Sales', _count: 5 },
            { department: null, _count: 2 },
          ]);
        }
        if (args.by?.includes('accountId')) {
          return Promise.resolve([
            { accountId: TEST_UUIDS.account1, _count: 8 },
            { accountId: null, _count: 3 },
          ]);
        }
        return Promise.resolve([]);
      });

      prismaMock.account.findMany.mockResolvedValue([
        { id: TEST_UUIDS.account1, name: 'Acme Corp' },
      ] as any);

      const result = await caller.filterOptions();

      expect(result.departments).toHaveLength(2);
      expect(result.departments[0]).toEqual({
        value: 'Engineering',
        label: 'Engineering',
        count: 10,
      });
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0]).toEqual({
        value: TEST_UUIDS.account1,
        label: 'Acme Corp',
        count: 8,
      });
    });

    it('should apply search filter', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockResolvedValue([]);

      const result = await caller.filterOptions({ search: 'John' });

      expect(result.departments).toHaveLength(0);
      expect(result.accounts).toHaveLength(0);
    });

    it('should apply accountId and department filters', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department'))
          return Promise.resolve([{ department: 'Engineering', _count: 3 }]);
        if (args.by?.includes('accountId'))
          return Promise.resolve([{ accountId: TEST_UUIDS.account1, _count: 3 }]);
        return Promise.resolve([]);
      });

      prismaMock.account.findMany.mockResolvedValue([
        { id: TEST_UUIDS.account1, name: 'TechCorp' },
      ] as any);

      const result = await caller.filterOptions({
        accountId: TEST_UUIDS.account1,
        department: 'Engineering',
      });

      expect(result.departments).toHaveLength(1);
      expect(result.accounts).toHaveLength(1);
    });

    it('should handle accounts with no name mapping', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department')) return Promise.resolve([]);
        if (args.by?.includes('accountId'))
          return Promise.resolve([{ accountId: TEST_UUIDS.account1, _count: 5 }]);
        return Promise.resolve([]);
      });

      // Account not found in DB - should fallback to accountId
      prismaMock.account.findMany.mockResolvedValue([]);

      const result = await caller.filterOptions();

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].label).toBe(TEST_UUIDS.account1);
    });

    it('should handle empty account ids list', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockResolvedValue([]); // No accounts with non-null accountId

      const result = await caller.filterOptions();

      expect(result.accounts).toHaveLength(0);
      // account.findMany should not be called when there are no accountIds
      expect(prismaMock.account.findMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkEmail', () => {
    it('should return emails and mailto URL for valid contacts', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([
        { id: TEST_UUIDS.contact1, email: 'jane@example.com' },
        { id: TEST_UUIDS.contact2, email: 'john@example.com' },
      ] as any);

      const result = await caller.bulkEmail({
        ids: [TEST_UUIDS.contact1, TEST_UUIDS.contact2],
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
      expect(result.emails).toEqual(['jane@example.com', 'john@example.com']);
      expect(result.mailtoUrl).toBe('mailto:jane@example.com,john@example.com');
    });

    it('should handle missing contacts in bulk email', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([
        { id: TEST_UUIDS.contact1, email: 'jane@example.com' },
      ] as any);

      const result = await caller.bulkEmail({
        ids: [TEST_UUIDS.contact1, TEST_UUIDS.nonExistent],
      });

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        id: TEST_UUIDS.nonExistent,
        error: 'Contact not found',
      });
    });
  });

  describe('bulkExport', () => {
    it('should export contacts as CSV', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.contact1,
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          title: 'CTO',
          phone: '+1234567891',
          department: 'Engineering',
          account: { name: 'TechCorp' },
        },
      ] as any);

      const result = await caller.bulkExport({
        ids: [TEST_UUIDS.contact1],
        format: 'csv',
      });

      expect(result.successful).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.data).toContain('Email,First Name,Last Name');
      expect(result.data).toContain('jane@example.com');
      expect(result.data).toContain('TechCorp');
    });

    it('should export contacts as JSON', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      const contactData = {
        id: TEST_UUIDS.contact1,
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        title: 'CTO',
        phone: null,
        department: null,
        account: null,
      };

      prismaMock.contact.findMany.mockResolvedValue([contactData] as any);

      const result = await caller.bulkExport({
        ids: [TEST_UUIDS.contact1],
        format: 'json',
      });

      expect(result.count).toBe(1);
      const parsed = JSON.parse(result.data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].email).toBe('jane@example.com');
    });

    it('should handle missing contacts in bulk export', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.bulkExport({
        ids: [TEST_UUIDS.nonExistent],
        format: 'csv',
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.count).toBe(0);
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple contacts successfully', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // bulkDelete calls findUnique sequentially in a for loop — use mockImplementation
      // to return different contacts based on the id in the where clause
      (prismaMock.contact.findUnique as any).mockImplementation(
        (args: { where: { id: string } }) => {
          const contactMap: Record<string, unknown> = {
            [TEST_UUIDS.contact1]: {
              ...mockContact,
              id: TEST_UUIDS.contact1,
              _count: { opportunities: 0 },
            },
            [TEST_UUIDS.contact2]: {
              ...mockContact,
              id: TEST_UUIDS.contact2,
              _count: { opportunities: 0 },
            },
          };
          return Promise.resolve(contactMap[args.where.id] ?? null);
        }
      );

      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: undefined,
      });

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.contact1, TEST_UUIDS.contact2],
      });

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.totalProcessed).toBe(2);
    });

    it('should handle not found contacts in bulk delete', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue(null);

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.nonExistent],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Contact not found');
    });

    it('should skip contacts with opportunities', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 2 },
      } as any);

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.contact1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain('2 opportunities');
    });

    it('should handle service delete failure in bulk', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        _count: { opportunities: 0 },
      } as any);

      ctx.services!.contact!.deleteContact = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Cannot delete: has active integrations' },
      });

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.contact1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Cannot delete: has active integrations');
    });

    it('should handle thrown exceptions during bulk delete', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.contact1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Database error');
    });

    it('should handle non-Error thrown exceptions during bulk delete', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockRejectedValue('string error');

      const result = await caller.bulkDelete({
        ids: [TEST_UUIDS.contact1],
      });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toBe('Unknown error');
    });
  });

  describe('list - additional filters', () => {
    it('should filter by status', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      await caller.list({ status: 'ACTIVE' });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
          }),
        })
      );
    });

    it('should filter by ownerId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      await caller.list({ ownerId: TEST_UUIDS.user1 });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: TEST_UUIDS.user1,
          }),
        })
      );
    });

    it('should support custom sort ordering', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      await caller.list({ sortBy: 'email', sortOrder: 'asc' });

      expect(prismaMock.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { email: 'asc' },
        })
      );
    });

    it('should return hasMore=true when there are more records', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      const contacts = Array.from({ length: 5 }, (_, i) => ({
        ...mockContact,
        id: `contact-${i}`,
        owner: mockUser,
        account: mockAccount,
        _count: { opportunities: 0, tasks: 0 },
      }));

      prismaMock.contact.findMany.mockResolvedValue(contacts as any);
      prismaMock.contact.count.mockResolvedValue(100);

      const result = await caller.list({ page: 1, limit: 5 });

      expect(result.hasMore).toBe(true);
    });
  });

  describe('getTimeline - additional coverage', () => {
    it('should handle invalid cursor gracefully', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.$queryRaw.mockResolvedValue([]);

      // Pass an invalid base64 cursor
      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        cursor: 'invalid-cursor!!!',
      });

      expect(result.events).toBeDefined();
    });

    it('should sort events in ascending order', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Older task',
          description: null,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: null,
          createdAt: new Date('2024-01-10'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
        {
          id: 'task-2',
          contactId: TEST_UUIDS.contact1,
          title: 'Newer task',
          description: null,
          status: 'PENDING',
          priority: 'MEDIUM',
          dueDate: null,
          createdAt: new Date('2024-01-20'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        sortOrder: 'asc',
      });

      expect(result.events.length).toBeGreaterThan(0);
      // In ascending order, older task should come first
      if (result.events.length >= 2) {
        expect(result.events[0].timestamp.getTime()).toBeLessThanOrEqual(
          result.events[1].timestamp.getTime()
        );
      }
    });

    it('should include notes in timeline', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([]);
      prismaMock.$queryRaw.mockResolvedValue([
        {
          id: 'note-1',
          content: 'Test note content',
          createdAt: new Date('2024-01-15'),
        },
      ]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('note');
      expect(result.events[0].description).toBe('Test note content');
    });

    it('should generate nextCursor when there are more events', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      // Return more tasks than the limit
      const tasks = Array.from({ length: 3 }, (_, i) => ({
        id: `task-${i}`,
        contactId: TEST_UUIDS.contact1,
        title: `Task ${i}`,
        description: null,
        status: 'PENDING',
        priority: 'HIGH',
        dueDate: null,
        createdAt: new Date(`2024-01-${10 + i}`),
        owner: { id: TEST_UUIDS.user1, name: 'User' },
      }));

      prismaMock.task.findMany.mockResolvedValue(tasks as any);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 2,
      });

      expect(result.nextCursor).not.toBeNull();
      // Verify cursor is valid base64
      const decoded = Buffer.from(result.nextCursor!, 'base64').toString('utf-8');
      expect(decoded).toContain(':');
    });

    it('should handle task with null owner name', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Task with null owner name',
          description: 'Some desc',
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: new Date('2024-02-01'),
          createdAt: new Date('2024-01-15'),
          owner: { id: TEST_UUIDS.user1, name: null },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].actor?.name).toBe('Unknown');
    });
  });

  // IFC-254 R-10: sortBy enum validation
  describe('sortBy validation (R-10)', () => {
    it('should reject invalid sortBy value with BAD_REQUEST', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Set up mocks so call would succeed if schema passes
      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      // Should be rejected by Zod enum validation, not pass through
      const result = caller.list({ sortBy: 'password' } as any);
      await expect(result).rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });

    it('should reject SQL-injection-like sortBy with BAD_REQUEST', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      const result = caller.list({ sortBy: '1;DROP TABLE contacts' } as any);
      await expect(result).rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });

    it('should reject empty string sortBy with BAD_REQUEST', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);
      prismaMock.contact.count.mockResolvedValue(0);

      const result = caller.list({ sortBy: '' } as any);
      await expect(result).rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    });

    it('should accept all valid sortBy enum values', async () => {
      const validSortFields = [
        'createdAt',
        'updatedAt',
        'firstName',
        'lastName',
        'email',
        'status',
        'company',
        'department',
        'lastContactedAt',
      ];

      for (const sortBy of validSortFields) {
        const ctx = createTestContext();
        const caller = contactRouter.createCaller(ctx);

        prismaMock.contact.findMany.mockResolvedValue([]);
        prismaMock.contact.count.mockResolvedValue(0);

        // Should not throw
        await expect(caller.list({ sortBy } as any)).resolves.toBeDefined();
      }
    });
  });

  // IFC-254 R-12: filterOptions status support
  describe('filterOptions status support (R-12)', () => {
    it('should apply status filter to WHERE condition', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation(
        (args: { by: string[]; where?: Record<string, unknown> }) => {
          if (args.by?.includes('department'))
            return Promise.resolve([{ department: 'Engineering', _count: 3 }]);
          if (args.by?.includes('accountId')) return Promise.resolve([]);
          if (args.by?.includes('status'))
            return Promise.resolve([{ status: 'ACTIVE', _count: 5 }]);
          return Promise.resolve([]);
        }
      );

      const result = await caller.filterOptions({ status: ['ACTIVE'] });

      // Verify groupBy was called with status filter in where clause
      const groupByCalls = (prismaMock.contact.groupBy as any).mock.calls;
      const deptCall = groupByCalls.find((c: any) => c[0].by?.includes('department'));
      expect(deptCall?.[0]?.where?.status).toEqual({ in: ['ACTIVE'] });
    });

    it('should apply multiple status values in filter', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department')) return Promise.resolve([]);
        if (args.by?.includes('accountId')) return Promise.resolve([]);
        if (args.by?.includes('status'))
          return Promise.resolve([
            { status: 'ACTIVE', _count: 5 },
            { status: 'INACTIVE', _count: 2 },
          ]);
        return Promise.resolve([]);
      });

      const result = await caller.filterOptions({ status: ['ACTIVE', 'INACTIVE'] });

      const groupByCalls = (prismaMock.contact.groupBy as any).mock.calls;
      const deptCall = groupByCalls.find((c: any) => c[0].by?.includes('department'));
      expect(deptCall?.[0]?.where?.status).toEqual({ in: ['ACTIVE', 'INACTIVE'] });
    });

    it('should apply status and department filters combined', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department'))
          return Promise.resolve([{ department: 'Engineering', _count: 2 }]);
        if (args.by?.includes('accountId')) return Promise.resolve([]);
        if (args.by?.includes('status')) return Promise.resolve([{ status: 'ACTIVE', _count: 2 }]);
        return Promise.resolve([]);
      });

      const result = await caller.filterOptions({
        status: ['ACTIVE'],
        department: 'Engineering',
      });

      const groupByCalls = (prismaMock.contact.groupBy as any).mock.calls;
      const deptCall = groupByCalls.find((c: any) => c[0].by?.includes('department'));
      expect(deptCall?.[0]?.where?.status).toEqual({ in: ['ACTIVE'] });
      expect(deptCall?.[0]?.where?.department).toBeDefined();
    });

    it('should return statuses array in filterOptions response', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department')) return Promise.resolve([]);
        if (args.by?.includes('accountId')) return Promise.resolve([]);
        if (args.by?.includes('status'))
          return Promise.resolve([
            { status: 'ACTIVE', _count: 10 },
            { status: 'INACTIVE', _count: 3 },
            { status: 'PROSPECT', _count: 7 },
          ]);
        return Promise.resolve([]);
      });

      const result = await caller.filterOptions();

      expect(result).toHaveProperty('statuses');
      expect((result as any).statuses).toHaveLength(3);
      expect((result as any).statuses[0]).toEqual({
        value: 'ACTIVE',
        label: 'ACTIVE',
        count: 10,
      });
    });
  });

  // IFC-192: logActivity tests
  describe('logActivity', () => {
    const setupLogActivityMocks = (
      ctx: ReturnType<typeof createTestContext>,
      overrides?: { lastContactedAt?: Date | null }
    ) => {
      const contactedAt = overrides?.lastContactedAt ?? new Date();
      const updatedRecord = { ...mockContact, lastContactedAt: contactedAt, updatedAt: new Date() };

      prismaMock.contact.findUnique.mockResolvedValue({ ...mockContact } as any);
      (prismaMock as any).$transaction = vi.fn().mockImplementation(async (fn: any) => {
        return await fn(prismaMock);
      });
      prismaMock.contactActivity.create.mockResolvedValue({} as any);
      // tx.contact.update returns the Prisma record (used as the authoritative result)
      prismaMock.contact.update.mockResolvedValue(updatedRecord as any);

      // recordInteraction is called post-transaction for domain event emission
      ctx.services!.contact!.recordInteraction = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ lastContactedAt: contactedAt }),
      });

      return { updatedRecord, contactedAt };
    };

    it('should log EMAIL activity and return updated contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      setupLogActivityMocks(ctx);

      const result = await caller.logActivity({
        contactId: TEST_UUIDS.contact1,
        type: 'EMAIL',
        title: 'Follow-up email sent',
      });

      expect(result.id).toBe(TEST_UUIDS.contact1);
      expect(prismaMock.contactActivity.create).toHaveBeenCalled();
    });

    it('should log CALL activity successfully', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      setupLogActivityMocks(ctx);

      const result = await caller.logActivity({
        contactId: TEST_UUIDS.contact1,
        type: 'CALL',
        title: 'Discovery call',
        description: 'Discussed requirements',
      });

      expect(result.id).toBe(TEST_UUIDS.contact1);
    });

    it('should log MEETING activity successfully', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      setupLogActivityMocks(ctx);

      const result = await caller.logActivity({
        contactId: TEST_UUIDS.contact1,
        type: 'MEETING',
        title: 'Quarterly review',
      });

      expect(result.id).toBe(TEST_UUIDS.contact1);
    });

    it('should return NOT_FOUND for non-existent contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.logActivity({
          contactId: TEST_UUIDS.nonExistent,
          type: 'EMAIL',
          title: 'Test',
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should wrap activity creation and contact update in same transaction', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({ ...mockContact } as any);
      const txMock = vi.fn().mockImplementation(async (fn: any) => {
        return await fn(prismaMock);
      });
      // Explicitly reset any prior $transaction assignment before setting our spy
      delete (prismaMock as any).$transaction;
      (prismaMock as any).$transaction = txMock;
      prismaMock.contactActivity.create.mockResolvedValue({} as any);
      prismaMock.contact.update.mockResolvedValue({
        ...mockContact,
        lastContactedAt: new Date(),
      } as any);

      ctx.services!.contact!.recordInteraction = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: createMockDomainContact({ lastContactedAt: new Date() }),
      });

      await caller.logActivity({
        contactId: TEST_UUIDS.contact1,
        type: 'EMAIL',
        title: 'Test email',
      });

      // Both contactActivity.create AND contact.update happen inside the transaction
      expect(txMock).toHaveBeenCalled();
      expect(prismaMock.contactActivity.create).toHaveBeenCalled();
      expect(prismaMock.contact.update).toHaveBeenCalled();
    });

    it('should return updated contact data with lastContactedAt', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);
      const contactedAt = new Date('2026-02-27T12:00:00Z');
      setupLogActivityMocks(ctx, { lastContactedAt: contactedAt });

      const result = await caller.logActivity({
        contactId: TEST_UUIDS.contact1,
        type: 'CALL',
        title: 'Follow-up',
      });

      expect(result.lastContactedAt).toEqual(contactedAt);
    });
  });
});
