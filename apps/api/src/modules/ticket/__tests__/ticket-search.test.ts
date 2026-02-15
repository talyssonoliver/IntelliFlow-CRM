/**
 * Ticket Search Router Tests (IFC-205)
 *
 * Tests that the ticket list endpoint correctly passes search
 * parameters to TicketService.findMany().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ticketRouter } from '../ticket.router';
import type { UserSession } from '../../../context';
import type { TenantContext } from '../../../security/tenant-context';

// Valid UUIDs — same as ticket.router.test.ts
const TENANT_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_UUID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const mockTenant = {
  id: TENANT_UUID,
  slug: 'default',
  name: 'Default Tenant',
};

// Mock ticket service
const mockTicketService = {
  create: vi.fn(),
  findById: vi.fn(),
  findMany: vi.fn().mockResolvedValue({ tickets: [], total: 0, hasMore: false }),
  update: vi.fn(),
  delete: vi.fn(),
  getStats: vi.fn(),
  addResponse: vi.fn(),
  archive: vi.fn(),
};

// Mock Prisma
const mockPrisma = {
  tenant: {
    findUnique: vi.fn().mockResolvedValue(mockTenant),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  ticket: {
    groupBy: vi.fn().mockResolvedValue([]),
  },
};

const createMockContext = () => ({
  prisma: mockPrisma,
  prismaWithTenant: mockPrisma,
  services: { ticket: mockTicketService },
  user: {
    userId: USER_UUID,
    email: 'test@example.com',
    role: 'USER',
    tenantId: TENANT_UUID,
  } as UserSession,
  tenant: {
    tenantId: TENANT_UUID,
    tenantType: 'user',
    userId: USER_UUID,
    role: 'USER',
    canAccessAllTenantData: false,
  } as TenantContext,
  req: { headers: { 'x-tenant-id': TENANT_UUID } },
});

describe('ticketRouter - search (IFC-205)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockTicketService.findMany.mockResolvedValue({
      tickets: [],
      total: 0,
      hasMore: false,
    });
  });

  it('should pass search parameter to TicketService.findMany', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.list({ search: 'login problem' });

    expect(mockTicketService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'login problem',
        tenantId: TENANT_UUID,
      })
    );
  });

  it('should combine search with pagination', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.list({ search: 'urgent', page: 2, limit: 10 });

    expect(mockTicketService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'urgent',
        limit: 10,
        offset: 10,
      })
    );
  });

  it('should handle empty search string gracefully', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await expect(caller.list({ search: '' })).resolves.toBeDefined();
  });
});
