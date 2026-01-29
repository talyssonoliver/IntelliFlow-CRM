/**
 * Ticket Router Tests
 *
 * Tests for support ticket management endpoints including CRUD,
 * bulk operations, and SLA tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { ticketRouter } from '../ticket.router';
import type { UserSession } from '../../../context';
import type { TenantContext } from '../../../security/tenant-context';

// Valid UUIDs for testing
const TICKET_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TENANT_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const USER_UUID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const SLA_UUID = 'd4e5f6a7-b8c9-0123-def0-234567890123';

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
  create: vi.fn().mockResolvedValue(mockTicket),
  findById: vi.fn().mockResolvedValue(mockTicket),
  findMany: vi.fn().mockResolvedValue({
    tickets: [mockTicket],
    total: 1,
    hasMore: false,
  }),
  update: vi.fn().mockResolvedValue(mockTicket),
  delete: vi.fn().mockResolvedValue(true),
  getStats: vi.fn().mockResolvedValue({
    total: 10,
    open: 5,
    inProgress: 3,
    resolved: 2,
    byPriority: { CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 3 },
    avgResolutionTime: 24,
  }),
  addResponse: vi.fn().mockResolvedValue(true),
};

// Mock Prisma
const mockPrisma = {
  tenant: {
    findUnique: vi.fn().mockResolvedValue(mockTenant),
  },
  ticket: {
    groupBy: vi.fn().mockResolvedValue([
      { status: 'OPEN', _count: 5 },
      { status: 'IN_PROGRESS', _count: 3 },
    ]),
  },
};

describe('ticketRouter', () => {
  // Create complete tenant context
  const createTenantContext = (): TenantContext => ({
    tenantId: TENANT_UUID,
    tenantType: 'user',
    userId: USER_UUID,
    role: 'USER',
    canAccessAllTenantData: false,
  });

  // Create mock context with complete tenant
  const createMockContext = () => {
    const tenantContext = createTenantContext();
    return {
      prisma: mockPrisma,
      prismaWithTenant: mockPrisma, // Required by TenantAwareContext
      services: {
        ticket: mockTicketService,
      },
      user: {
        userId: USER_UUID,
        email: 'test@example.com',
        role: 'USER',
        tenantId: TENANT_UUID,
      } as UserSession,
      tenant: tenantContext, // Complete TenantContext object
      req: {
        headers: {
          'x-tenant-id': TENANT_UUID,
        },
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish default mock values after clearing
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
    mockTicketService.create.mockResolvedValue(mockTicket);
    mockTicketService.findById.mockResolvedValue(mockTicket);
    mockTicketService.findMany.mockResolvedValue({
      tickets: [mockTicket],
      total: 1,
      hasMore: false,
    });
    mockTicketService.update.mockResolvedValue(mockTicket);
    mockTicketService.delete.mockResolvedValue(true);
    mockTicketService.getStats.mockResolvedValue({
      total: 10,
      open: 5,
      inProgress: 3,
      resolved: 2,
      byPriority: { CRITICAL: 1, HIGH: 2, MEDIUM: 4, LOW: 3 },
      avgResolutionTime: 24,
    });
    mockTicketService.addResponse.mockResolvedValue(true);
  });

  // ============================================
  // Create Tests
  // ============================================

  describe('create', () => {
    const validCreateInput = {
      subject: 'New Ticket',
      description: 'Test description',
      priority: 'MEDIUM' as const,
      contactName: 'John Doe',
      contactEmail: 'john@example.com',
      slaPolicyId: SLA_UUID,
    };

    it('should create a new ticket', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.create(validCreateInput);

      expect(result).toEqual(mockTicket);
      expect(mockTicketService.create).toHaveBeenCalledWith({
        ...validCreateInput,
        tenantId: TENANT_UUID,
      });
    });

    it('should throw error when service fails', async () => {
      mockTicketService.create.mockRejectedValueOnce(new Error('Creation failed'));

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await expect(caller.create(validCreateInput)).rejects.toThrow(TRPCError);
    });

    it('should throw error when ticket service is not available', async () => {
      const mockContext = {
        ...createMockContext(),
        services: {},
      };
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await expect(caller.create(validCreateInput)).rejects.toThrow(/Ticket service not available/);
    });
  });

  // ============================================
  // GetById Tests
  // ============================================

  describe('getById', () => {
    it('should return ticket by ID', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.getById({ id: TICKET_UUID });

      expect(result).toEqual(mockTicket);
      expect(mockTicketService.findById).toHaveBeenCalledWith(TICKET_UUID);
    });

    it('should throw NOT_FOUND when ticket does not exist', async () => {
      mockTicketService.findById.mockResolvedValueOnce(null);

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const nonExistentUuid = 'e5f6a7b8-c9d0-1234-ef01-345678901234';
      await expect(caller.getById({ id: nonExistentUuid })).rejects.toThrow(/Ticket not found/);
    });
  });

  // ============================================
  // List Tests
  // ============================================

  describe('list', () => {
    it('should return paginated tickets', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.list({
        page: 1,
        limit: 20,
      });

      expect(result.tickets).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by status', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await caller.list({
        status: 'OPEN',
      });

      expect(mockTicketService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'OPEN',
        })
      );
    });

    it('should filter by priority', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await caller.list({
        priority: 'HIGH',
      });

      expect(mockTicketService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'HIGH',
        })
      );
    });

    it('should filter by assignee', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const assigneeUuid = 'f6a7b8c9-d0e1-2345-f012-456789012345';
      await caller.list({
        assignedToId: assigneeUuid,
      });

      expect(mockTicketService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedToId: assigneeUuid,
        })
      );
    });

    it('should use default pagination values', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await caller.list({});

      expect(mockTicketService.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 0,
        })
      );
    });
  });

  // ============================================
  // Update Tests
  // ============================================

  describe('update', () => {
    it('should update ticket', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.update({
        id: TICKET_UUID,
        subject: 'Updated Subject',
        status: 'IN_PROGRESS',
      });

      expect(result).toEqual(mockTicket);
      expect(mockTicketService.update).toHaveBeenCalledWith(TICKET_UUID, {
        subject: 'Updated Subject',
        status: 'IN_PROGRESS',
        description: undefined,
        priority: undefined,
        assigneeId: undefined,
      });
    });

    it('should throw error when update fails', async () => {
      mockTicketService.update.mockRejectedValueOnce(new Error('Update failed'));

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await expect(
        caller.update({
          id: TICKET_UUID,
          subject: 'Updated Subject',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // Delete Tests
  // ============================================

  describe('delete', () => {
    it('should delete ticket', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.delete({ id: TICKET_UUID });

      expect(result.success).toBe(true);
      expect(mockTicketService.delete).toHaveBeenCalledWith(TICKET_UUID);
    });

    it('should throw error when delete fails', async () => {
      mockTicketService.delete.mockRejectedValueOnce(new Error('Delete failed'));

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await expect(caller.delete({ id: TICKET_UUID })).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // Stats Tests
  // ============================================

  describe('stats', () => {
    it('should return ticket statistics', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.stats();

      expect(result.total).toBe(10);
      expect(result.open).toBe(5);
      expect(result.inProgress).toBe(3);
      expect(result.resolved).toBe(2);
      expect(result.byPriority).toBeDefined();
      expect(mockTicketService.getStats).toHaveBeenCalledWith(TENANT_UUID);
    });
  });

  // ============================================
  // Add Response Tests
  // ============================================

  describe('addResponse', () => {
    it('should add response to ticket', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.addResponse({
        ticketId: TICKET_UUID,
        content: 'This is a response',
        authorName: 'Test User',
        authorRole: 'AGENT',
      });

      expect(result.success).toBe(true);
      expect(mockTicketService.addResponse).toHaveBeenCalledWith(
        TICKET_UUID,
        'This is a response',
        'Test User',
        'AGENT'
      );
    });

    it('should throw error when adding response fails', async () => {
      mockTicketService.addResponse.mockRejectedValueOnce(new Error('Failed to add response'));

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await expect(
        caller.addResponse({
          ticketId: TICKET_UUID,
          content: 'This is a response',
          authorName: 'Test User',
          authorRole: 'AGENT',
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  // ============================================
  // Bulk Operations Tests
  // ============================================

  describe('bulkAssign', () => {
    it('should bulk assign tickets', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.bulkAssign({
        ticketIds: ['ticket_1', 'ticket_2', 'ticket_3'],
        assigneeId: 'user_456',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(3);
      expect(mockTicketService.update).toHaveBeenCalledTimes(3);
    });

    it('should continue on partial failures', async () => {
      mockTicketService.update
        .mockResolvedValueOnce(mockTicket)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockTicket);

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.bulkAssign({
        ticketIds: ['ticket_1', 'ticket_2', 'ticket_3'],
        assigneeId: 'user_456',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2); // Only 2 succeeded
    });
  });

  describe('bulkUpdateStatus', () => {
    it('should bulk update ticket status', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.bulkUpdateStatus({
        ticketIds: ['ticket_1', 'ticket_2'],
        status: 'IN_PROGRESS',
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(mockTicketService.update).toHaveBeenCalledWith('ticket_1', { status: 'IN_PROGRESS' });
      expect(mockTicketService.update).toHaveBeenCalledWith('ticket_2', { status: 'IN_PROGRESS' });
    });
  });

  describe('bulkResolve', () => {
    it('should bulk resolve tickets', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.bulkResolve({
        ticketIds: ['ticket_1', 'ticket_2'],
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(mockTicketService.update).toHaveBeenCalledWith('ticket_1', { status: 'RESOLVED' });
    });
  });

  describe('bulkEscalate', () => {
    it('should bulk escalate tickets to critical priority', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.bulkEscalate({
        ticketIds: ['ticket_1', 'ticket_2'],
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(mockTicketService.update).toHaveBeenCalledWith('ticket_1', { priority: 'CRITICAL' });
    });
  });

  describe('bulkClose', () => {
    it('should bulk close tickets', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.bulkClose({
        ticketIds: ['ticket_1', 'ticket_2'],
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(2);
      expect(mockTicketService.update).toHaveBeenCalledWith('ticket_1', { status: 'CLOSED' });
    });
  });

  // ============================================
  // Filter Options Tests
  // ============================================

  describe('filterOptions', () => {
    beforeEach(() => {
      // Set up groupBy mock for filter options
      mockPrisma.ticket.groupBy
        .mockResolvedValueOnce([
          { status: 'OPEN', _count: 5 },
          { status: 'IN_PROGRESS', _count: 3 },
        ])
        .mockResolvedValueOnce([
          { priority: 'HIGH', _count: 4 },
          { priority: 'MEDIUM', _count: 6 },
        ])
        .mockResolvedValueOnce([
          { slaStatus: 'ON_TRACK', _count: 8 },
          { slaStatus: 'AT_RISK', _count: 2 },
        ]);
    });

    it('should return filter options with counts', async () => {
      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      const result = await caller.filterOptions();

      expect(result.statuses).toHaveLength(2);
      expect(result.priorities).toHaveLength(2);
      expect(result.slaStatuses).toHaveLength(2);
      expect(result.statuses[0]).toHaveProperty('count');
    });

    it('should apply current filters to count queries', async () => {
      // Reset and reconfigure mock for this specific test
      mockPrisma.ticket.groupBy
        .mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await caller.filterOptions({
        status: 'OPEN',
        priority: 'HIGH',
      });

      expect(mockPrisma.ticket.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'OPEN',
            priority: 'HIGH',
          }),
        })
      );
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('error handling', () => {
    it('should throw when default tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      const mockContext = createMockContext();
      const caller = ticketRouter.createCaller(mockContext as Parameters<typeof ticketRouter.createCaller>[0]);

      await expect(caller.stats()).rejects.toThrow(/Default tenant not found/);
    });
  });
});
