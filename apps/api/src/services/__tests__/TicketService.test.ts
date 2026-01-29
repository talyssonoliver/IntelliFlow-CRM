/**
 * TicketService Tests
 *
 * Tests for support ticket operations including:
 * - SLA calculation and tracking
 * - CRUD operations
 * - Statistics and aggregations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketService } from '../TicketService';
import type { PrismaClient, Ticket, TicketStatus, TicketPriority } from '@intelliflow/db';

// Create a type for our mock Prisma client
type MockPrismaClient = {
  ticket: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
  };
  ticketActivity: {
    create: ReturnType<typeof vi.fn>;
  };
  sLAPolicy: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

describe('TicketService', () => {
  let service: TicketService;
  let mockPrisma: MockPrismaClient;

  const mockSLAPolicy = {
    id: 'sla-1',
    name: 'Standard SLA',
    criticalResponseMinutes: 15,
    criticalResolutionMinutes: 120,
    highResponseMinutes: 60,
    highResolutionMinutes: 480,
    mediumResponseMinutes: 240,
    mediumResolutionMinutes: 1440,
    lowResponseMinutes: 480,
    lowResolutionMinutes: 2880,
  };

  const createMockTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
    id: 'ticket-1',
    ticketNumber: 'T-00001',
    subject: 'Test Ticket',
    description: 'Test description',
    status: 'OPEN' as TicketStatus,
    priority: 'MEDIUM' as TicketPriority,
    slaStatus: 'ON_TRACK',
    contactName: 'John Doe',
    contactEmail: 'john@example.com',
    contactId: null,
    assigneeId: null,
    slaPolicyId: 'sla-1',
    tenantId: 'tenant-1',
    slaResponseDue: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
    slaResolutionDue: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    slaBreachedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:00:00Z'));

    mockPrisma = {
      ticket: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
      },
      ticketActivity: {
        create: vi.fn(),
      },
      sLAPolicy: {
        findUnique: vi.fn(),
      },
    };

    service = new TicketService(mockPrisma as unknown as PrismaClient);
  });

  // ============================================
  // calculateSLAStatus Tests
  // ============================================

  describe('calculateSLAStatus', () => {
    it('should return BREACHED if slaBreachedAt is set', () => {
      const ticket = createMockTicket({
        slaBreachedAt: new Date('2025-01-14T10:00:00Z'),
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('BREACHED');
    });

    it('should return MET if ticket is resolved', () => {
      const ticket = createMockTicket({
        resolvedAt: new Date('2025-01-14T10:00:00Z'),
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('MET');
    });

    it('should return BREACHED if response SLA is past due and no first response', () => {
      const ticket = createMockTicket({
        slaResponseDue: new Date('2025-01-15T09:00:00Z'), // 1 hour ago
        firstResponseAt: null,
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('BREACHED');
    });

    it('should return AT_RISK if response SLA is within 1 hour and no first response', () => {
      const ticket = createMockTicket({
        slaResponseDue: new Date('2025-01-15T10:30:00Z'), // 30 minutes from now
        firstResponseAt: null,
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('AT_RISK');
    });

    it('should return BREACHED if resolution SLA is past due', () => {
      const ticket = createMockTicket({
        slaResponseDue: null,
        slaResolutionDue: new Date('2025-01-15T09:00:00Z'), // 1 hour ago
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('BREACHED');
    });

    it('should return AT_RISK if resolution SLA is within 2 hours', () => {
      const ticket = createMockTicket({
        slaResponseDue: null,
        slaResolutionDue: new Date('2025-01-15T11:30:00Z'), // 1.5 hours from now
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('AT_RISK');
    });

    it('should return ON_TRACK when all SLAs are healthy', () => {
      const ticket = createMockTicket({
        slaResponseDue: new Date('2025-01-15T14:00:00Z'), // 4 hours from now
        slaResolutionDue: new Date('2025-01-16T10:00:00Z'), // 24 hours from now
        firstResponseAt: null,
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('ON_TRACK');
    });

    it('should skip response SLA check if first response already made', () => {
      const ticket = createMockTicket({
        slaResponseDue: new Date('2025-01-15T09:00:00Z'), // Would be breached
        firstResponseAt: new Date('2025-01-15T08:00:00Z'), // But response was made
        slaResolutionDue: new Date('2025-01-16T10:00:00Z'), // Resolution still healthy
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('ON_TRACK');
    });

    it('should return ON_TRACK when no SLA deadlines set', () => {
      const ticket = createMockTicket({
        slaResponseDue: null,
        slaResolutionDue: null,
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('ON_TRACK');
    });

    it('should prioritize slaBreachedAt over resolvedAt', () => {
      const ticket = createMockTicket({
        slaBreachedAt: new Date('2025-01-14T10:00:00Z'),
        resolvedAt: new Date('2025-01-14T12:00:00Z'),
      });

      const result = service.calculateSLAStatus(ticket);
      expect(result).toBe('BREACHED');
    });
  });

  // ============================================
  // findMany Tests
  // ============================================

  describe('findMany', () => {
    it('should return tickets with pagination', async () => {
      const mockTickets = [createMockTicket(), createMockTicket({ id: 'ticket-2' })];
      mockPrisma.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrisma.ticket.count.mockResolvedValue(10);

      const result = await service.findMany({
        tenantId: 'tenant-1',
        limit: 2,
        offset: 0,
      });

      expect(result.tickets).toHaveLength(2);
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
      expect(result.tickets[0].slaStatus).toBeDefined();
    });

    it('should apply status filter', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findMany({
        tenantId: 'tenant-1',
        status: 'OPEN' as TicketStatus,
      });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'OPEN',
          }),
        })
      );
    });

    it('should apply priority filter', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findMany({
        tenantId: 'tenant-1',
        priority: 'HIGH' as TicketPriority,
      });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: 'HIGH',
          }),
        })
      );
    });

    it('should apply assignedToId filter', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findMany({
        tenantId: 'tenant-1',
        assignedToId: 'user-1',
      });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assigneeId: 'user-1',
          }),
        })
      );
    });

    it('should use default limit of 20', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findMany({ tenantId: 'tenant-1' });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
        })
      );
    });

    it('should include related data', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await service.findMany({ tenantId: 'tenant-1' });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            slaPolicy: true,
            attachments: true,
          }),
        })
      );
    });

    it('should return hasMore false when all results fetched', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([createMockTicket()]);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const result = await service.findMany({
        tenantId: 'tenant-1',
        limit: 20,
        offset: 0,
      });

      expect(result.hasMore).toBe(false);
    });
  });

  // ============================================
  // findById Tests
  // ============================================

  describe('findById', () => {
    it('should return ticket with SLA status', async () => {
      const mockTicket = createMockTicket();
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);

      const result = await service.findById('ticket-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('ticket-1');
      expect(result?.slaStatus).toBeDefined();
    });

    it('should return null if ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should include related data', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(createMockTicket());

      await service.findById('ticket-1');

      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            slaPolicy: true,
            activities: expect.any(Object),
            attachments: true,
            nextSteps: expect.any(Object),
          }),
        })
      );
    });

    it('should filter next steps to uncompleted only', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(createMockTicket());

      await service.findById('ticket-1');

      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            nextSteps: expect.objectContaining({
              where: { completed: false },
            }),
          }),
        })
      );
    });
  });

  // ============================================
  // create Tests
  // ============================================

  describe('create', () => {
    it('should create ticket with SLA times based on priority', async () => {
      mockPrisma.ticket.count.mockResolvedValue(5);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket());
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      const result = await service.create({
        subject: 'New Ticket',
        priority: 'MEDIUM' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketNumber: 'T-00006',
            subject: 'New Ticket',
            priority: 'MEDIUM',
            status: 'OPEN',
            slaStatus: 'ON_TRACK',
          }),
        })
      );
    });

    it('should throw error if SLA policy not found', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          subject: 'New Ticket',
          priority: 'MEDIUM' as TicketPriority,
          contactName: 'John Doe',
          contactEmail: 'john@example.com',
          slaPolicyId: 'non-existent',
          tenantId: 'tenant-1',
        })
      ).rejects.toThrow('SLA policy not found');
    });

    it('should calculate SLA response time for CRITICAL priority', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket({ priority: 'CRITICAL' as TicketPriority }));
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.create({
        subject: 'Critical Issue',
        priority: 'CRITICAL' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // CRITICAL response: 15 minutes from now
            slaResponseDue: new Date('2025-01-15T10:15:00.000Z'),
            // CRITICAL resolution: 120 minutes from now
            slaResolutionDue: new Date('2025-01-15T12:00:00.000Z'),
          }),
        })
      );
    });

    it('should calculate SLA response time for HIGH priority', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket({ priority: 'HIGH' as TicketPriority }));
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.create({
        subject: 'High Priority Issue',
        priority: 'HIGH' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // HIGH response: 60 minutes from now
            slaResponseDue: new Date('2025-01-15T11:00:00.000Z'),
            // HIGH resolution: 480 minutes from now
            slaResolutionDue: new Date('2025-01-15T18:00:00.000Z'),
          }),
        })
      );
    });

    it('should calculate SLA response time for LOW priority', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket({ priority: 'LOW' as TicketPriority }));
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.create({
        subject: 'Low Priority Issue',
        priority: 'LOW' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // LOW response: 480 minutes (8 hours) from now
            slaResponseDue: new Date('2025-01-15T18:00:00.000Z'),
            // LOW resolution: 2880 minutes (48 hours) from now
            slaResolutionDue: new Date('2025-01-17T10:00:00.000Z'),
          }),
        })
      );
    });

    it('should create initial activity', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket());
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.create({
        subject: 'New Ticket',
        priority: 'MEDIUM' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'SYSTEM_EVENT',
            content: 'Ticket created',
            authorName: 'System',
          }),
        })
      );
    });

    it('should include optional fields when provided', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket());
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.create({
        subject: 'New Ticket',
        description: 'Detailed description',
        priority: 'MEDIUM' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        contactId: 'contact-1',
        assigneeId: 'user-1',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Detailed description',
            contactId: 'contact-1',
            assigneeId: 'user-1',
          }),
        })
      );
    });

    it('should generate correct ticket number', async () => {
      mockPrisma.ticket.count.mockResolvedValue(99);
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockSLAPolicy);
      mockPrisma.ticket.create.mockResolvedValue(createMockTicket({ ticketNumber: 'T-00100' }));
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.create({
        subject: 'New Ticket',
        priority: 'MEDIUM' as TicketPriority,
        contactName: 'John Doe',
        contactEmail: 'john@example.com',
        slaPolicyId: 'sla-1',
        tenantId: 'tenant-1',
      });

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketNumber: 'T-00100',
          }),
        })
      );
    });
  });

  // ============================================
  // update Tests
  // ============================================

  describe('update', () => {
    it('should update ticket and return with SLA status', async () => {
      const mockTicket = createMockTicket();
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);

      const result = await service.update('ticket-1', {
        subject: 'Updated Subject',
      });

      expect(result).toBeDefined();
      expect(result.slaStatus).toBeDefined();
    });

    it('should set resolvedAt when status is RESOLVED', async () => {
      const mockTicket = createMockTicket({ status: 'RESOLVED' as TicketStatus });
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.update('ticket-1', {
        status: 'RESOLVED' as TicketStatus,
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolvedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should set closedAt when status is CLOSED', async () => {
      const mockTicket = createMockTicket({ status: 'CLOSED' as TicketStatus });
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.update('ticket-1', {
        status: 'CLOSED' as TicketStatus,
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CLOSED',
            closedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should create activity when status changes', async () => {
      const mockTicket = createMockTicket({ status: 'IN_PROGRESS' as TicketStatus });
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.update('ticket-1', {
        status: 'IN_PROGRESS' as TicketStatus,
      });

      expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'STATUS_CHANGE',
            content: 'Status changed to IN_PROGRESS',
          }),
        })
      );
    });

    it('should not create activity when status is not changed', async () => {
      const mockTicket = createMockTicket();
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);

      await service.update('ticket-1', {
        subject: 'New Subject',
      });

      expect(mockPrisma.ticketActivity.create).not.toHaveBeenCalled();
    });

    it('should update multiple fields at once', async () => {
      const mockTicket = createMockTicket();
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);

      await service.update('ticket-1', {
        subject: 'Updated Subject',
        description: 'Updated Description',
        priority: 'HIGH' as TicketPriority,
        assigneeId: 'user-1',
      });

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subject: 'Updated Subject',
            description: 'Updated Description',
            priority: 'HIGH',
            assigneeId: 'user-1',
          }),
        })
      );
    });
  });

  // ============================================
  // delete Tests
  // ============================================

  describe('delete', () => {
    it('should delete ticket by id', async () => {
      mockPrisma.ticket.delete.mockResolvedValue({});

      await service.delete('ticket-1');

      expect(mockPrisma.ticket.delete).toHaveBeenCalledWith({
        where: { id: 'ticket-1' },
      });
    });
  });

  // ============================================
  // getStats Tests
  // ============================================

  describe('getStats', () => {
    it('should return ticket statistics', async () => {
      mockPrisma.ticket.count.mockResolvedValueOnce(50); // total
      mockPrisma.ticket.groupBy
        .mockResolvedValueOnce([
          { status: 'OPEN', _count: 20 },
          { status: 'IN_PROGRESS', _count: 15 },
          { status: 'RESOLVED', _count: 10 },
          { status: 'CLOSED', _count: 5 },
        ])
        .mockResolvedValueOnce([
          { priority: 'CRITICAL', _count: 5 },
          { priority: 'HIGH', _count: 10 },
          { priority: 'MEDIUM', _count: 25 },
          { priority: 'LOW', _count: 10 },
        ]);
      mockPrisma.ticket.count.mockResolvedValueOnce(3); // breached
      mockPrisma.ticket.findMany.mockResolvedValueOnce([
        { createdAt: new Date('2025-01-15T09:00:00Z'), firstResponseAt: new Date('2025-01-15T09:30:00Z') },
        { createdAt: new Date('2025-01-15T08:00:00Z'), firstResponseAt: new Date('2025-01-15T08:45:00Z') },
      ]);

      const result = await service.getStats('tenant-1');

      expect(result.total).toBe(50);
      expect(result.byStatus.OPEN).toBe(20);
      expect(result.byStatus.IN_PROGRESS).toBe(15);
      expect(result.byPriority.CRITICAL).toBe(5);
      expect(result.byPriority.HIGH).toBe(10);
      expect(result.slaBreached).toBe(3);
      expect(result.avgResponseTime).toBe(38); // Average of 30 and 45 minutes
    });

    it('should return zero avg response time when no tickets have responses', async () => {
      mockPrisma.ticket.count.mockResolvedValueOnce(10);
      mockPrisma.ticket.groupBy
        .mockResolvedValueOnce([{ status: 'OPEN', _count: 10 }])
        .mockResolvedValueOnce([{ priority: 'MEDIUM', _count: 10 }]);
      mockPrisma.ticket.count.mockResolvedValueOnce(0);
      mockPrisma.ticket.findMany.mockResolvedValueOnce([]); // No tickets with first response

      const result = await service.getStats('tenant-1');

      expect(result.avgResponseTime).toBe(0);
    });

    it('should filter by tenantId', async () => {
      mockPrisma.ticket.count.mockResolvedValueOnce(0);
      mockPrisma.ticket.groupBy.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValueOnce(0);
      mockPrisma.ticket.findMany.mockResolvedValueOnce([]);

      await service.getStats('tenant-1');

      expect(mockPrisma.ticket.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
          }),
        })
      );
    });
  });

  // ============================================
  // addResponse Tests
  // ============================================

  describe('addResponse', () => {
    it('should add response and create activity', async () => {
      const mockTicket = createMockTicket();
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.addResponse('ticket-1', 'Response content', 'Agent Name', 'Support');

      expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ticketId: 'ticket-1',
            type: 'AGENT_REPLY',
            content: 'Response content',
            authorName: 'Agent Name',
            authorRole: 'Support',
            channel: 'PORTAL',
          }),
        })
      );
    });

    it('should throw error if ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      await expect(
        service.addResponse('non-existent', 'Response', 'Agent', 'Support')
      ).rejects.toThrow('Ticket not found');
    });

    it('should set firstResponseAt if this is the first response', async () => {
      const mockTicket = createMockTicket({ firstResponseAt: null });
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticketActivity.create.mockResolvedValue({});
      mockPrisma.ticket.update.mockResolvedValue(mockTicket);

      await service.addResponse('ticket-1', 'First response', 'Agent Name', 'Support');

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ticket-1' },
          data: { firstResponseAt: expect.any(Date) },
        })
      );
    });

    it('should not update firstResponseAt if already set', async () => {
      const mockTicket = createMockTicket({
        firstResponseAt: new Date('2025-01-14T10:00:00Z'),
      });
      mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket);
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await service.addResponse('ticket-1', 'Another response', 'Agent Name', 'Support');

      expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    });
  });
});
