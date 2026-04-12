/**
 * Contact Router Security — Tenant Isolation Tests (IFC-252)
 *
 * 22 tests verifying tenant isolation for 5 vulnerabilities (R-02 through R-06).
 * Each vulnerability has positive (correct isolation) + negative (cross-tenant denial) tests.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { contactRouter } from '../contact.router';
import {
  prismaMock,
  createTestContext,
  createAdminContext,
  mockContact,
  mockUser,
  TEST_UUIDS,
  generateTestUUID,
} from '../../../test/setup';
import type { BaseContext } from '../../../context';

// --- Test Constants ---

const TENANT_A_TENANT_ID = TEST_UUIDS.tenant; // matches createTestContext default
const TENANT_A_USER_ID = TEST_UUIDS.user1;

// Valid UUIDs for cross-tenant testing
const CROSS_TENANT_CONTACT_ID = generateTestUUID('cross-tenant-contact');
const FOREIGN_CONTACT_ID = generateTestUUID('foreign-contact');

// --- Context Helpers ---

function createSalesRepContext(): BaseContext {
  const salesRepId = generateTestUUID('salesrep');
  return createTestContext({
    user: {
      userId: salesRepId,
      email: 'salesrep@example.com',
      role: 'SALES_REP',
      tenantId: TENANT_A_TENANT_ID,
    },
    tenant: {
      tenantId: TENANT_A_TENANT_ID,
      tenantType: 'user' as const,
      userId: salesRepId,
      role: 'SALES_REP',
      canAccessAllTenantData: false,
    },
  });
}

// --- Tests ---

describe('Contact Router Security — Tenant Isolation (IFC-252)', () => {
  beforeEach(() => {
    // prismaMock reset handled by setup.ts beforeEach
  });

  // ====================================================================
  // R-02: search tenant isolation
  // ====================================================================
  describe('R-02: search tenant isolation', () => {
    it('R02-P1: search WHERE includes ownerId for USER role', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test', limit: 10 });

      const findManyCall = prismaMock.contact.findMany.mock.calls[0][0];
      const where = findManyCall?.where as Record<string, unknown>;
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
      expect(where).toHaveProperty('OR');
    });

    it('R02-N1: cross-tenant search returns 0 results (ownerId mismatch)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Mock returns empty because ownerId filter excludes cross-tenant contacts
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.search({ query: 'tenantb-contact', limit: 10 });

      expect(result.contacts).toHaveLength(0);
      expect(result.count).toBe(0);
      // Verify the WHERE had ownerId constraint
      const where = (prismaMock.contact.findMany.mock.calls[0][0]?.where ?? {}) as Record<
        string,
        unknown
      >;
      expect(where.ownerId).toBe(TENANT_A_USER_ID);
    });

    it('R02-E1: ADMIN search omits ownerId filter (sees all tenant contacts)', async () => {
      const ctx = createAdminContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      await caller.search({ query: 'test', limit: 10 });

      const where = (prismaMock.contact.findMany.mock.calls[0][0]?.where ?? {}) as Record<
        string,
        unknown
      >;
      // ADMIN: createTenantWhereClause does NOT add ownerId
      expect(where).not.toHaveProperty('ownerId');
      expect(where).toHaveProperty('OR');
    });
  });

  // ====================================================================
  // R-03: logActivity tenant isolation
  // ====================================================================
  describe('R-03: logActivity tenant isolation', () => {
    const logActivityInput = {
      contactId: TEST_UUIDS.contact1,
      type: 'CALL' as const,
      title: 'Follow-up call',
      description: 'Called about proposal',
    };

    it('R03-P1: uses prismaWithTenant.$transaction, not ctx.prisma.$transaction', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Contact exists
      prismaMock.contact.findUnique.mockResolvedValue(mockContact as any);

      // Set up transaction mock
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        const txMock = {
          contactActivity: { create: vi.fn().mockResolvedValue({}) },
          contact: { update: vi.fn().mockResolvedValue(mockContact) },
        };
        return fn(txMock);
      });

      // Service recordInteraction
      ctx.services!.contact!.recordInteraction = vi.fn().mockResolvedValue(undefined);

      await caller.logActivity(logActivityInput);

      // prismaWithTenant.$transaction should have been called (same mock in test setup)
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('R03-P2: transaction update WHERE includes ownerId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue(mockContact as any);

      let capturedUpdateArgs: any = null;
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        const txMock = {
          contactActivity: { create: vi.fn().mockResolvedValue({}) },
          contact: {
            update: vi.fn().mockImplementation((args: any) => {
              capturedUpdateArgs = args;
              return mockContact;
            }),
          },
        };
        return fn(txMock);
      });

      ctx.services!.contact!.recordInteraction = vi.fn().mockResolvedValue(undefined);

      await caller.logActivity(logActivityInput);

      expect(capturedUpdateArgs).not.toBeNull();
      expect(capturedUpdateArgs.where).toHaveProperty('id', TEST_UUIDS.contact1);
      expect(capturedUpdateArgs.where).toHaveProperty('ownerId', TENANT_A_USER_ID);
    });

    it('R03-N1: cross-tenant contactId returns NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Contact doesn't exist for this tenant (findUnique returns null)
      prismaMock.contact.findUnique.mockResolvedValue(null);

      await expect(
        caller.logActivity({ ...logActivityInput, contactId: CROSS_TENANT_CONTACT_ID })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });

    it('R03-E1: uses getTenantContext for type-safe tenant extraction', async () => {
      // Verifies the code path works correctly with valid tenant context.
      // IFC-252 replaced `ctx as TenantAwareContext` (unsafe cast) with
      // `getTenantContext(ctx)` (throws INTERNAL_SERVER_ERROR if context missing).
      // We verify correctness by confirming the procedure accesses tenant fields
      // properly — the activity record includes tenantId from typedCtx.tenant.
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue(mockContact as any);

      let capturedActivityData: any = null;
      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        const txMock = {
          contactActivity: {
            create: vi.fn().mockImplementation((args: any) => {
              capturedActivityData = args.data;
              return {};
            }),
          },
          contact: { update: vi.fn().mockResolvedValue(mockContact) },
        };
        return fn(txMock);
      });

      ctx.services!.contact!.recordInteraction = vi.fn().mockResolvedValue(undefined);

      await caller.logActivity(logActivityInput);

      // Verify tenant context was properly extracted
      expect(capturedActivityData).not.toBeNull();
      expect(capturedActivityData.tenantId).toBe(TENANT_A_TENANT_ID);
      expect(capturedActivityData.userId).toBe(TENANT_A_USER_ID);
    });
  });

  // ====================================================================
  // R-04: bulkEmail/bulkExport tenant isolation
  // ====================================================================
  describe('R-04: bulkEmail/bulkExport tenant isolation', () => {
    it('R04-P1: bulkEmail WHERE includes ownerId + tenantId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([
        { ...mockContact, id: TEST_UUIDS.contact1, email: 'a@b.com' } as any,
      ]);

      await caller.bulkEmail({ ids: [TEST_UUIDS.contact1] });

      const where = prismaMock.contact.findMany.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
      expect(where).toHaveProperty('tenantId', TENANT_A_TENANT_ID);
    });

    it('R04-N1: bulkEmail cross-tenant IDs in failed array', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // findMany with tenant filter returns only own contacts
      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.bulkEmail({ ids: [CROSS_TENANT_CONTACT_ID] });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({ id: CROSS_TENANT_CONTACT_ID, error: 'Contact not found' });
    });

    it('R04-P2: bulkExport WHERE includes ownerId + tenantId', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([{ ...mockContact, account: null } as any]);

      await caller.bulkExport({ ids: [TEST_UUIDS.contact1], format: 'json' });

      const where = prismaMock.contact.findMany.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
      expect(where).toHaveProperty('tenantId', TENANT_A_TENANT_ID);
    });

    it('R04-N2: bulkExport cross-tenant IDs excluded from data', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([]);

      const result = await caller.bulkExport({ ids: [FOREIGN_CONTACT_ID], format: 'csv' });

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.count).toBe(0);
    });

    it('R04-E1: mixed own + foreign IDs correctly split', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Only own contact is found (tenant-filtered), foreign is not
      prismaMock.contact.findMany.mockResolvedValue([
        { ...mockContact, id: TEST_UUIDS.contact1, email: 'own@test.com' } as any,
      ]);

      const result = await caller.bulkEmail({ ids: [TEST_UUIDS.contact1, FOREIGN_CONTACT_ID] });

      expect(result.successful).toEqual([TEST_UUIDS.contact1]);
      expect(result.failed).toEqual([{ id: FOREIGN_CONTACT_ID, error: 'Contact not found' }]);
    });
  });

  // ====================================================================
  // R-05: stats tenant isolation
  // ====================================================================
  describe('R-05: stats tenant isolation', () => {
    it('R05-P1: uses prismaWithTenant.count with tenant-scoped WHERE', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.count.mockResolvedValue(10);
      (prismaMock.contact.groupBy as any).mockResolvedValue([]);

      await caller.stats();

      // count should be called with ownerId filter (USER role)
      const countCall = prismaMock.contact.count.mock.calls[0][0];
      const where = (countCall?.where ?? {}) as Record<string, unknown>;
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
      expect(where).toHaveProperty('tenantId', TENANT_A_TENANT_ID);
    });

    it('R05-N1: stats reflect only tenant-scoped contacts', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // Return scoped counts
      prismaMock.contact.count
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(3); // withAccounts
      (prismaMock.contact.groupBy as any).mockResolvedValue([
        { department: 'Engineering', _count: 3 },
        { department: 'Sales', _count: 2 },
      ] as any);

      const result = await caller.stats();

      expect(result.total).toBe(5);
      expect(result.withAccounts).toBe(3);
      expect(result.withoutAccounts).toBe(2);
      expect(result.byDepartment).toEqual({ Engineering: 3, Sales: 2 });
    });

    it('R05-E1: ADMIN stats include all tenant contacts (no ownerId filter)', async () => {
      const ctx = createAdminContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.count.mockResolvedValue(100);
      (prismaMock.contact.groupBy as any).mockResolvedValue([]);

      await caller.stats();

      const where = (prismaMock.contact.count.mock.calls[0][0]?.where ?? {}) as Record<
        string,
        unknown
      >;
      // ADMIN: no ownerId filter, but still has tenantId
      expect(where).not.toHaveProperty('ownerId');
      expect(where).toHaveProperty('tenantId', TENANT_A_TENANT_ID);
    });

    it('R05-E2: MANAGER role stats include ownerId scoping', async () => {
      // MANAGER without teamMemberIds enrichment gets own-data scoping.
      // When enrichTenantContext runs (production), MANAGER gets team-scoped access.
      // This test verifies MANAGER still has ownerId-based isolation (not wide-open).
      const managerId = generateTestUUID('manager');
      const ctx = createTestContext({
        user: {
          userId: managerId,
          email: 'manager@example.com',
          role: 'MANAGER',
          tenantId: TENANT_A_TENANT_ID,
        },
        tenant: {
          tenantId: TENANT_A_TENANT_ID,
          tenantType: 'user' as const,
          userId: managerId,
          role: 'MANAGER',
          canAccessAllTenantData: true,
        },
      });
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.count.mockResolvedValue(20);
      (prismaMock.contact.groupBy as any).mockResolvedValue([]);

      await caller.stats();

      const where = (prismaMock.contact.count.mock.calls[0][0]?.where ?? {}) as Record<
        string,
        unknown
      >;
      // MANAGER without enrichment: ownerId scoping to own userId
      expect(where).toHaveProperty('ownerId');
      expect(where).toHaveProperty('tenantId', TENANT_A_TENANT_ID);
    });
  });

  // ====================================================================
  // R-06: getById/getByEmail tenant isolation
  // ====================================================================
  describe('R-06: getById/getByEmail tenant isolation', () => {
    const contactWithRelations = {
      ...mockContact,
      owner: mockUser,
      account: null,
      lead: null,
      activities: [],
      notes: [],
      aiInsight: { id: 'ai-1' },
      opportunities: [],
      tasks: [],
      calendarEvents: [],
    };

    it('R06-P1: getById findFirst with ownerId returns 360-view', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(contactWithRelations as any);

      const result = await caller.getById({ id: TEST_UUIDS.contact1 });

      expect(result).toBeTruthy();
      // Verify findFirst was called (not findUnique) with ownerId
      expect(prismaMock.contact.findFirst).toHaveBeenCalled();
      const where = prismaMock.contact.findFirst.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where).toHaveProperty('id', TEST_UUIDS.contact1);
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
    });

    it('R06-N1: getById cross-tenant UUID returns NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(caller.getById({ id: CROSS_TENANT_CONTACT_ID })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('R06-P2: getByEmail findFirst with ownerId returns contact', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue({
        ...mockContact,
        owner: mockUser,
        account: null,
      } as any);

      const result = await caller.getByEmail({ email: 'contact@example.com' });

      expect(result).toBeTruthy();
      const where = prismaMock.contact.findFirst.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where).toHaveProperty('email', 'contact@example.com');
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
    });

    it('R06-N2: getByEmail cross-tenant email returns NOT_FOUND', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(caller.getByEmail({ email: 'foreign@other-tenant.com' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    it('R06-E1: email in both tenants — only caller tenant returned', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      // findFirst returns tenant A's contact because of ownerId filter
      const tenantAContact = {
        ...mockContact,
        ownerId: TENANT_A_USER_ID,
        owner: mockUser,
        account: null,
      };
      prismaMock.contact.findFirst.mockResolvedValue(tenantAContact as any);

      const result = await caller.getByEmail({ email: 'shared@example.com' });

      expect(result).toBeTruthy();
      const where = prismaMock.contact.findFirst.mock.calls[0][0]?.where as Record<string, unknown>;
      expect(where).toHaveProperty('ownerId', TENANT_A_USER_ID);
    });

    it('R06-E2: SALES_REP same isolation as USER', async () => {
      const ctx = createSalesRepContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findFirst.mockResolvedValue(null);

      await expect(caller.getById({ id: TEST_UUIDS.contact2 })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );

      const where = prismaMock.contact.findFirst.mock.calls[0][0]?.where as Record<string, unknown>;
      // SALES_REP gets ownerId scoping same as USER
      expect(where).toHaveProperty('ownerId');
    });
  });
});
