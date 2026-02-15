/**
 * Ticket Router - Performance Tracking Tests (IFC-207)
 *
 * Verifies queryDurationMs field is present in ticket list and stats
 * endpoint responses, following the performance.now() pattern from
 * timeline.router.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ticketRouter } from '../ticket.router';
import type { UserSession } from '../../../context';
import type { TenantContext } from '../../../security/tenant-context';

// Valid UUIDs for testing
const TICKET_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TENANT_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_UUID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// Mock ticket data
const mockTicket = {
  id: TICKET_UUID,
  subject: 'Test Ticket',
  description: 'Test description',
  status: 'OPEN',
  priority: 'MEDIUM',
  tenantId: TENANT_UUID,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignedToId: null,
  contactId: null,
  slaStatus: 'ON_TRACK',
  responses: [],
};

const mockTenant = {
  id: TENANT_UUID,
  slug: 'default',
  name: 'Default Tenant',
};

// Mock ticket service
const mockTicketService = {
  create: vi.fn(),
  findById: vi.fn(),
  findMany: vi.fn().mockResolvedValue({
    tickets: [mockTicket],
    total: 1,
    hasMore: false,
  }),
  update: vi.fn(),
  delete: vi.fn(),
  getStats: vi.fn().mockResolvedValue({
    total: 10,
    byStatus: { OPEN: 5, IN_PROGRESS: 3, RESOLVED: 2 },
    byPriority: { CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 3 },
    bySLAStatus: { ON_TRACK: 6, AT_RISK: 3, BREACHED: 1 },
    slaBreached: 1,
    resolvedToday: 2,
    avgResponseTime: 24,
  }),
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

describe('Ticket Router - Performance Tracking (IFC-207)', () => {
  const createTenantContext = (): TenantContext => ({
    tenantId: TENANT_UUID,
    tenantType: 'user',
    userId: USER_UUID,
    role: 'USER',
    canAccessAllTenantData: false,
  });

  const createMockContext = () => {
    const tenantContext = createTenantContext();
    return {
      prisma: mockPrisma,
      prismaWithTenant: mockPrisma,
      services: {
        ticket: mockTicketService,
      },
      user: {
        userId: USER_UUID,
        email: 'test@example.com',
        role: 'USER',
        tenantId: TENANT_UUID,
      } as UserSession,
      tenant: tenantContext,
      req: {
        headers: {
          'x-tenant-id': TENANT_UUID,
        },
      },
    };
  };

  const createCaller = () => {
    const ctx = createMockContext();
    return ticketRouter.createCaller(ctx as never);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    mockTicketService.findMany.mockResolvedValue({
      tickets: [mockTicket],
      total: 1,
      hasMore: false,
    });
    mockTicketService.getStats.mockResolvedValue({
      total: 10,
      byStatus: { OPEN: 5, IN_PROGRESS: 3, RESOLVED: 2 },
      byPriority: { CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 3 },
      bySLAStatus: { ON_TRACK: 6, AT_RISK: 3, BREACHED: 1 },
      slaBreached: 1,
      resolvedToday: 2,
      avgResponseTime: 24,
    });
  });

  describe('list endpoint', () => {
    it('should include queryDurationMs in response', async () => {
      const caller = createCaller();
      const result = await caller.list({});
      expect(result).toHaveProperty('queryDurationMs');
    });

    it('should return queryDurationMs as number >= 0', async () => {
      const caller = createCaller();
      const result = await caller.list({});
      expect(result.queryDurationMs).toBeTypeOf('number');
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return queryDurationMs with filters applied', async () => {
      const caller = createCaller();
      const result = await caller.list({ status: 'OPEN', priority: 'HIGH' });
      expect(result.queryDurationMs).toBeTypeOf('number');
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return queryDurationMs with sorting', async () => {
      const caller = createCaller();
      const result = await caller.list({ sortBy: 'priority' });
      expect(result.queryDurationMs).toBeTypeOf('number');
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should meet timing overhead threshold (< 50ms mocked)', async () => {
      const caller = createCaller();
      const result = await caller.list({});
      expect(result.queryDurationMs).toBeLessThan(50);
    });
  });

  describe('stats endpoint', () => {
    it('should include queryDurationMs in response', async () => {
      const caller = createCaller();
      const result = await caller.stats({});
      expect(result).toHaveProperty('queryDurationMs');
    });

    it('should return queryDurationMs as number >= 0', async () => {
      const caller = createCaller();
      const result = await caller.stats({});
      expect(result.queryDurationMs).toBeTypeOf('number');
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return queryDurationMs with timeWindow filter', async () => {
      const caller = createCaller();
      const result = await caller.stats({ timeWindow: '7d' });
      expect(result.queryDurationMs).toBeTypeOf('number');
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should meet timing overhead threshold (< 50ms mocked)', async () => {
      const caller = createCaller();
      const result = await caller.stats({});
      expect(result.queryDurationMs).toBeLessThan(50);
    });
  });
});
