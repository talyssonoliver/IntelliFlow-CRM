/**
 * Ticket Stats/Sort Router Tests (IFC-206)
 *
 * Tests that the stats endpoint accepts timeWindow input and returns bySLAStatus,
 * and that the list endpoint passes sortBy/sortOrder to the service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ticketRouter } from '../ticket.router';
import type { UserSession } from '../../../context';
import type { TenantContext } from '../../../security/tenant-context';

const TENANT_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_UUID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const mockTenant = {
  id: TENANT_UUID,
  slug: 'default',
  name: 'Default Tenant',
};

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

describe('ticketRouter - stats and sort (IFC-206)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    mockTicketService.findMany.mockResolvedValue({ tickets: [], total: 0, hasMore: false });
    mockTicketService.getStats.mockResolvedValue({
      total: 10,
      byStatus: { OPEN: 5, IN_PROGRESS: 3, RESOLVED: 2 },
      byPriority: { CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 3 },
      bySLAStatus: { ON_TRACK: 4, AT_RISK: 2, BREACHED: 1, MET: 2, PAUSED: 1 },
      slaBreached: 1,
      resolvedToday: 2,
      avgResponseTime: 24,
    });
  });

  // Stats with SLA breakdown
  it('stats returns bySLAStatus from service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    const result = await caller.stats({});

    expect(result.bySLAStatus).toEqual({
      ON_TRACK: 4,
      AT_RISK: 2,
      BREACHED: 1,
      MET: 2,
      PAUSED: 1,
    });
  });

  it('stats without input calls getStats with default timeWindow', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.stats({});

    expect(mockTicketService.getStats).toHaveBeenCalledWith(TENANT_UUID, 'all');
  });

  // Stats with time window
  it('stats with timeWindow 24h passes timeWindow to service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.stats({ timeWindow: '24h' });

    expect(mockTicketService.getStats).toHaveBeenCalledWith(TENANT_UUID, '24h');
  });

  it('stats with timeWindow 7d passes timeWindow to service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.stats({ timeWindow: '7d' });

    expect(mockTicketService.getStats).toHaveBeenCalledWith(TENANT_UUID, '7d');
  });

  it('stats with timeWindow all passes timeWindow to service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.stats({ timeWindow: 'all' });

    expect(mockTicketService.getStats).toHaveBeenCalledWith(TENANT_UUID, 'all');
  });

  // List with sort
  it('list with sortBy updatedAt passes sortBy to service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.list({ sortBy: 'updatedAt' });

    expect(mockTicketService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'updatedAt',
      })
    );
  });

  it('list with sortBy priority and sortOrder asc passes both to service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.list({ sortBy: 'priority', sortOrder: 'asc' });

    expect(mockTicketService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'priority',
        sortOrder: 'asc',
      })
    );
  });

  it('list without sortBy passes default createdAt to service', async () => {
    const caller = ticketRouter.createCaller(
      createMockContext() as unknown as Parameters<typeof ticketRouter.createCaller>[0]
    );

    await caller.list({});

    expect(mockTicketService.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: 'createdAt',
      })
    );
  });
});
