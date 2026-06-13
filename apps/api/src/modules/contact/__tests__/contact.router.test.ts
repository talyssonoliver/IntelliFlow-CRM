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

// Stub BullMQ to prevent real Redis connections in unit tests.
// Without this, the scoreWithAI fire-and-forget block attempts an IORedis
// connection on Linux CI (no Redis available), emitting async errors that
// Vitest catches as unhandled rejections and attributes to the running test.
vi.mock('../../../lib/load-bullmq', () => ({
  loadBullMQ: vi.fn(async () => ({
    Queue: class MockQueue {
      add = vi.fn().mockResolvedValue({ id: 'job-stub' });
      close = vi.fn().mockResolvedValue(undefined);
    },
    QueueEvents: class MockQueueEvents {
      close = vi.fn().mockResolvedValue(undefined);
    },
  })),
}));
import {
  prismaMock,
  createTestContext,
  mockContact,
  mockAccount,
  mockUser,
  mockLead,
  mockOpportunity,
  mockTask,
  mockServices,
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
  lastContactedAt: null, // IFC-192
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
    // IFC-256: base 360-view relations (aiInsight present → normal return path)
    const baseRelations = (overrides: Record<string, unknown> = {}) => ({
      ...mockContact,
      owner: mockUser,
      account: mockAccount,
      lead: mockLead,
      opportunities: [mockOpportunity],
      tasks: [mockTask],
      activities: [],
      notes: [],
      aiInsight: { id: 'ai-1' },
      calendarEvents: [],
      ...overrides,
    });

    const sampleTicket = {
      id: 'tk-1',
      ticketNumber: 'T-00001',
      subject: 'Integration API question',
      status: 'RESOLVED',
      priority: 'MEDIUM',
      createdAt: new Date('2025-01-10T09:00:00Z'),
      resolvedAt: null,
    };
    // Raw CaseDocument row as returned by prisma; getById maps it to the view shape.
    const sampleCaseDocument = {
      id: 'doc-1',
      title: 'Enterprise License Proposal',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(2_400_000),
      documentType: 'CONTRACT',
      createdAt: new Date('2025-01-09T09:00:00Z'),
    };

    it('should return contact with related data including tickets and documents', async () => {
      const contactWithRelations = baseRelations();
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // IFC-252: findFirst with tenant WHERE (no service pre-flight)
      prismaMock.contact.findFirst.mockResolvedValue(contactWithRelations as any);
      // IFC-256: tickets via TicketService, documents via prisma
      (mockServices.ticket.listByContact as any).mockResolvedValue([sampleTicket]);
      (mockServices.ticket.countByContact as any).mockResolvedValue(23);
      (prismaMock.caseDocument.findMany as any).mockResolvedValue([sampleCaseDocument]);
      (prismaMock.caseDocument.count as any).mockResolvedValue(50);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result).toMatchObject(contactWithRelations);
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].ticketNumber).toBe('T-00001');
      expect(result.documents).toHaveLength(1);
      // CaseDocument row mapped to the view shape (title→name, sizeBytes→number)
      expect(result.documents[0].name).toBe('Enterprise License Proposal');
      expect(result.documents[0].fileSize).toBe(2_400_000);
      // badge counts reflect the true totals, not the capped list lengths
      expect(result.ticketCount).toBe(23);
      expect(result.documentCount).toBe(50);
    });

    // IFC-265 (T-07): activities + notes were always seeded as empty arrays in
    // getById tests; assert they are surfaced with populated, ordered data.
    it('surfaces populated activities and notes from the getById relations', async () => {
      const sampleActivities = [
        {
          id: 'act-1',
          type: 'EMAIL',
          title: 'Sent proposal',
          createdAt: new Date('2025-02-02T10:00:00Z'),
        },
        {
          id: 'act-2',
          type: 'CALL',
          title: 'Intro call',
          createdAt: new Date('2025-02-01T10:00:00Z'),
        },
      ];
      const sampleNotes = [
        {
          id: 'note-1',
          content: 'Prefers afternoon meetings',
          author: 'rep@example.com',
          createdAt: new Date('2025-02-03T10:00:00Z'),
        },
      ];
      const contactWithRelations = baseRelations({
        activities: sampleActivities,
        notes: sampleNotes,
      });
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(contactWithRelations as any);
      (mockServices.ticket.listByContact as any).mockResolvedValue([]);
      (prismaMock.caseDocument.findMany as any).mockResolvedValue([]);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result.activities).toHaveLength(2);
      expect(result.activities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'act-1', title: 'Sent proposal' }),
          expect.objectContaining({ id: 'act-2', title: 'Intro call' }),
        ])
      );
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0]).toEqual(
        expect.objectContaining({ id: 'note-1', content: 'Prefers afternoon meetings' })
      );
    });

    it('returns empty tickets and documents arrays when the contact has none', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(baseRelations() as any);
      (mockServices.ticket.listByContact as any).mockResolvedValue([]);
      (prismaMock.caseDocument.findMany as any).mockResolvedValue([]);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result.tickets).toEqual([]);
      expect(result.documents).toEqual([]);
    });

    it('scopes the tickets/documents queries to tenant + contact and excludes deleted documents', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(baseRelations() as any);
      (mockServices.ticket.listByContact as any).mockResolvedValue([]);
      (prismaMock.caseDocument.findMany as any).mockResolvedValue([]);

      await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(mockServices.ticket.listByContact).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TEST_UUIDS.tenant,
          contactId: TEST_UUIDS.contact1,
        })
      );
      expect(prismaMock.caseDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
            relatedContactId: TEST_UUIDS.contact1,
            deletedAt: null,
            isLatestVersion: true,
          }),
        })
      );
      // documents are ACL-filtered: the viewer must be the creator or hold an ACL
      const docWhere = (prismaMock.caseDocument.findMany as any).mock.calls[0][0].where;
      expect(docWhere.OR).toEqual(
        expect.arrayContaining([
          { createdBy: TEST_UUIDS.user1 },
          expect.objectContaining({
            acl: { some: expect.objectContaining({ principalId: TEST_UUIDS.user1 }) },
          }),
        ])
      );
      // counts use the same tenant/contact scope (true totals for the badges)
      expect(mockServices.ticket.countByContact).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TEST_UUIDS.tenant, contactId: TEST_UUIDS.contact1 })
      );
      expect(prismaMock.caseDocument.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_UUIDS.tenant,
            relatedContactId: TEST_UUIDS.contact1,
            deletedAt: null,
            isLatestVersion: true,
          }),
        })
      );
    });

    it('degrades to empty tickets and a zero ticket count when the service is unavailable', async () => {
      const ctx = createTestContext({
        services: { ...mockServices, ticket: undefined } as any,
      });
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(baseRelations() as any);
      (prismaMock.caseDocument.findMany as any).mockResolvedValue([]);
      (prismaMock.caseDocument.count as any).mockResolvedValue(0);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result.tickets).toEqual([]);
      expect(result.ticketCount).toBe(0);
    });

    it('includes tickets and documents on the derived-insight path (no DB insight)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // aiInsight null → getById derives a synthetic insight (separate return path)
      prismaMock.contact.findFirst.mockResolvedValue(baseRelations({ aiInsight: null }) as any);
      (mockServices.ticket.listByContact as any).mockResolvedValue([sampleTicket]);
      (prismaMock.caseDocument.findMany as any).mockResolvedValue([sampleCaseDocument]);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result.aiInsight).toBeTruthy();
      expect(result.tickets).toHaveLength(1);
      expect(result.documents).toHaveLength(1);
    });

    it('should throw NOT_FOUND for non-existent contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // IFC-252: findFirst returns null → NOT_FOUND
      prismaMock.contact.findFirst.mockResolvedValue(null);

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

      // IFC-252: findFirst with tenant WHERE (no service pre-flight)
      prismaMock.contact.findFirst.mockResolvedValue(contactWithRelations as any);

      const result = await caller.getByEmail({ email: 'contact@example.com' });

      expect(result!.email).toBe('contact@example.com');
    });

    it('should throw NOT_FOUND for non-existent email', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // IFC-252: findFirst returns null → NOT_FOUND
      prismaMock.contact.findFirst.mockResolvedValue(null);

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

      // IFC-252: stats now uses prismaWithTenant directly
      prismaMock.contact.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(35); // withAccounts
      (prismaMock.contact.groupBy as any).mockResolvedValue([
        { department: 'Engineering', _count: 20 },
        { department: 'Sales', _count: 15 },
      ] as any);

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

      prismaMock.contact.count.mockResolvedValue(0);
      (prismaMock.contact.groupBy as any).mockResolvedValue([] as any);

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

  /**
   * IFC-184: linkToLead tests
   */
  describe('linkToLead', () => {
    it('should link contact to lead successfully', async () => {
      const linkedContact = createMockDomainContact({
        leadId: TEST_UUIDS.lead1,
        hasLinkedLead: true,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: linkedContact,
      });

      const result = await caller.linkToLead({
        contactId: TEST_UUIDS.contact1,
        leadId: TEST_UUIDS.lead1,
      });

      expect(result.leadId).toBe(TEST_UUIDS.lead1);
      expect(ctx.services!.contact!.linkToLead).toHaveBeenCalledWith(
        TEST_UUIDS.contact1,
        TEST_UUIDS.lead1,
        expect.any(String)
      );
    });

    it('should throw NOT_FOUND if contact does not exist', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Contact not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(
        caller.linkToLead({ contactId: TEST_UUIDS.nonExistent, leadId: TEST_UUIDS.lead1 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw NOT_FOUND if lead does not exist', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: `Lead not found: ${TEST_UUIDS.nonExistent}` },
      });

      await expect(
        caller.linkToLead({ contactId: TEST_UUIDS.contact1, leadId: TEST_UUIDS.nonExistent })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
        })
      );
    });

    it('should throw CONFLICT if contact already linked to different lead', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.linkToLead = vi.fn().mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Contact is already linked to lead other-lead-id' },
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

  /**
   * IFC-184: unlinkFromLead tests
   */
  describe('unlinkFromLead', () => {
    it('should unlink contact from lead successfully', async () => {
      const unlinkedContact = createMockDomainContact({
        leadId: null,
        hasLinkedLead: false,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.unlinkFromLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: unlinkedContact,
      });

      const result = await caller.unlinkFromLead({ contactId: TEST_UUIDS.contact1 });

      expect(result.leadId).toBeNull();
    });

    it('should be idempotent - return success if already unlinked', async () => {
      const unlinkedContact = createMockDomainContact({
        leadId: null,
        hasLinkedLead: false,
      });

      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      ctx.services!.contact!.unlinkFromLead = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: unlinkedContact,
      });

      const result = await caller.unlinkFromLead({ contactId: TEST_UUIDS.contact1 });

      expect(result.leadId).toBeNull();
    });
  });

  /**
   * IFC-184: getTimeline tests
   */
  describe('getTimeline', () => {
    it('should return timeline events for contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Mock contact exists
      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      // Mock tasks (cast to any - Prisma mock doesn't type include/select relations)
      prismaMock.task.findMany.mockResolvedValue([
        {
          ...mockTask,
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Follow up',
          createdAt: new Date('2024-01-15'),
          owner: { id: TEST_UUIDS.user1, name: 'Test User' },
        } as any,
      ]);

      // Mock notes query (returns empty as it's a raw query)
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 20,
      });

      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.nextCursor).toBeDefined();
      expect(result.totalCount).toBeDefined();
    });

    it('should throw NOT_FOUND if contact does not exist', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.getTimeline({ contactId: TEST_UUIDS.nonExistent })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: 'Contact not found',
        })
      );
    });

    it('should return empty events for contact with no timeline data', async () => {
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

      const result = await caller.getTimeline({ contactId: TEST_UUIDS.contact1 });

      expect(result.events).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
      expect(result.totalCount).toBe(0);
    });

    it('should support pagination with cursor', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      // First page (cast to any - Prisma mock doesn't type include/select relations)
      prismaMock.task.findMany.mockResolvedValue([
        {
          ...mockTask,
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          createdAt: new Date('2024-01-15'),
          owner: { id: TEST_UUIDS.user1, name: 'Test User' },
        } as any,
      ]);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 1,
      });

      expect(result.events.length).toBeLessThanOrEqual(1);
    });

    it('should filter by date range', async () => {
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

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
      });

      expect(result.events).toBeDefined();
      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: TEST_UUIDS.contact1,
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should meet <1000ms KPI target', async () => {
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

      const result = await caller.getTimeline({ contactId: TEST_UUIDS.contact1 });

      expect(result.meetsKpi).toBe(true);
      expect(result.durationMs).toBeLessThan(1000);
    });
  });

  describe('scoreWithAI', () => {
    it('T-006: should derive insights and upsert ContactAIInsight', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        lastContactedAt: new Date('2026-03-10'),
        createdAt: new Date('2026-01-01'),
        title: 'VP Sales',
        department: 'Revenue',
        status: 'ACTIVE',
        lead: { score: 80 },
        opportunities: [{ value: 50000, stage: 'NEGOTIATION' }],
        tenantId: TEST_UUIDS.tenant,
      } as any);

      const mockInsight = {
        id: 'insight-1',
        contactId: TEST_UUIDS.contact1,
        tenantId: TEST_UUIDS.tenant,
        conversionProbability: 0.7,
        lifetimeValue: 50000,
        churnRisk: 'LOW',
        engagementScore: 85,
        sentiment: 'POSITIVE',
        sentimentTrend: 'IMPROVING',
        nextBestAction: 'Schedule follow-up meeting',
        recommendations: ['Follow up this week'],
        lastEngagementDays: 2,
      };

      prismaMock.contactAIInsight.upsert.mockResolvedValue(mockInsight as any);

      const result = await caller.scoreWithAI({ contactId: TEST_UUIDS.contact1 });

      expect(prismaMock.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEST_UUIDS.contact1 },
        })
      );
      expect(prismaMock.contactAIInsight.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contactId: TEST_UUIDS.contact1 },
          create: expect.objectContaining({ contactId: TEST_UUIDS.contact1 }),
          update: expect.objectContaining({ conversionProbability: expect.any(Number) }),
        })
      );
      expect(result).toEqual(mockInsight);
    });

    it('T-007: should throw NOT_FOUND for missing contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(caller.scoreWithAI({ contactId: TEST_UUIDS.contact1 })).rejects.toThrow(
        TRPCError
      );

      await expect(caller.scoreWithAI({ contactId: TEST_UUIDS.contact1 })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
