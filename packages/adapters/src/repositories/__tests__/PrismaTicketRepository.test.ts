/**
 * PrismaTicketRepository Tests
 *
 * Tests for the Prisma-based ticket repository implementation.
 * Covers all public methods: findMany, findById, findByIdSimple, create,
 * update, delete, getNextTicketNumber, getSLAPolicy, getStats,
 * createActivity, count, getAverageResponseTime, findBreachingSLA.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaTicketRepository } from '../PrismaTicketRepository';

// Mock Prisma client
const createMockPrisma = () => ({
  ticket: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
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
});

type MockPrisma = ReturnType<typeof createMockPrisma>;

// Helper to create a mock ticket record from Prisma
function createMockTicketRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-001',
    ticketNumber: 'T-00001',
    subject: 'Test Ticket',
    description: 'A test ticket description',
    status: 'OPEN',
    priority: 'MEDIUM',
    tenantId: 'tenant-123',
    slaPolicyId: 'sla-001',
    slaPolicy: {
      id: 'sla-001',
      name: 'Standard SLA',
      criticalResponseMinutes: 15,
      criticalResolutionMinutes: 120,
      highResponseMinutes: 30,
      highResolutionMinutes: 240,
      mediumResponseMinutes: 60,
      mediumResolutionMinutes: 480,
      lowResponseMinutes: 120,
      lowResolutionMinutes: 960,
    },
    slaResponseDue: new Date('2026-02-06T12:00:00Z'),
    slaResolutionDue: new Date('2026-02-07T12:00:00Z'),
    slaStatus: 'WITHIN_SLA',
    slaBreachedAt: null,
    firstResponseAt: null,
    resolvedAt: null,
    contactId: 'contact-123',
    contactName: 'Jane Doe',
    contactEmail: 'jane@example.com',
    assigneeId: 'user-456',
    createdAt: new Date('2026-02-05T10:00:00Z'),
    updatedAt: new Date('2026-02-05T10:00:00Z'),
    closedAt: null,
    activities: [
      {
        id: 'activity-001',
        type: 'NOTE',
        content: 'Ticket created',
        timestamp: new Date('2026-02-05T10:00:00Z'),
        isInternal: false,
        authorName: 'System',
        authorRole: null,
        channel: 'SYSTEM',
      },
    ],
    attachments: [
      {
        id: 'attach-001',
        name: 'screenshot.png',
        size: '2048',
        fileType: 'image/png',
        url: 'https://storage.example.com/screenshot.png',
        uploadedAt: new Date('2026-02-05T10:00:00Z'),
      },
    ],
    nextSteps: [
      {
        id: 'step-001',
        title: 'Follow up with customer',
        dueDate: '2026-02-06',
        completed: false,
      },
    ],
    ...overrides,
  };
}

describe('PrismaTicketRepository', () => {
  let repo: PrismaTicketRepository;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    repo = new PrismaTicketRepository(mockPrisma as any);
  });

  // ============================================
  // findMany
  // ============================================
  describe('findMany()', () => {
    it('should return paginated tickets with default options', async () => {
      const mockTickets = [createMockTicketRecord()];
      mockPrisma.ticket.findMany.mockResolvedValue(mockTickets);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const result = await repo.findMany({ tenantId: 'tenant-123' });

      expect(result.tickets).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);

      // Check default pagination
      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
        })
      );
    });

    it('should apply custom pagination options', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(50);

      const result = await repo.findMany(
        { tenantId: 'tenant-123' },
        { limit: 10, offset: 20 }
      );

      expect(result.hasMore).toBe(true);
      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
    });

    it('should apply default orderBy (priority desc, createdAt desc)', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany({ tenantId: 'tenant-123' });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        })
      );
    });

    it('should apply custom orderBy', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany(
        { tenantId: 'tenant-123' },
        { orderBy: [{ field: 'createdAt', direction: 'asc' }] }
      );

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: 'asc' }],
        })
      );
    });

    it('should include activities with limit by default', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany({ tenantId: 'tenant-123' });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            activities: {
              take: 5,
              orderBy: { timestamp: 'desc' },
            },
            attachments: true,
            slaPolicy: true,
          }),
        })
      );
    });

    it('should disable includes when options are false', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany(
        { tenantId: 'tenant-123' },
        {
          includeActivities: false,
          includeAttachments: false,
          includeSLAPolicy: false,
        }
      );

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            activities: false,
            attachments: false,
            slaPolicy: false,
          }),
        })
      );
    });

    it('should respect custom activitiesLimit', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany(
        { tenantId: 'tenant-123' },
        { activitiesLimit: 10 }
      );

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            activities: {
              take: 10,
              orderBy: { timestamp: 'desc' },
            },
          }),
        })
      );
    });

    it('should build where clause with all filters', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany({
        tenantId: 'tenant-123',
        status: 'OPEN',
        priority: 'HIGH',
        assigneeId: 'user-456',
        slaStatus: 'BREACHED',
        contactId: 'contact-789',
      });

      const expectedWhere = {
        tenantId: 'tenant-123',
        status: 'OPEN',
        priority: 'HIGH',
        assigneeId: 'user-456',
        slaStatus: 'BREACHED',
        contactId: 'contact-789',
      };

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere })
      );
      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });

    it('should only include tenantId in where clause when no other filters provided', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.ticket.count.mockResolvedValue(0);

      await repo.findMany({ tenantId: 'tenant-123' });

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-123' },
        })
      );
    });

    it('should correctly map ticket DTO with all fields', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findMany.mockResolvedValue([record]);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const result = await repo.findMany({ tenantId: 'tenant-123' });
      const ticket = result.tickets[0];

      expect(ticket.id).toBe('ticket-001');
      expect(ticket.ticketNumber).toBe('T-00001');
      expect(ticket.subject).toBe('Test Ticket');
      expect(ticket.description).toBe('A test ticket description');
      expect(ticket.status).toBe('OPEN');
      expect(ticket.priority).toBe('MEDIUM');
      expect(ticket.tenantId).toBe('tenant-123');
      expect(ticket.contactName).toBe('Jane Doe');
      expect(ticket.contactEmail).toBe('jane@example.com');
      expect(ticket.assigneeId).toBe('user-456');
      expect(ticket.slaPolicy).toBeDefined();
      expect(ticket.slaPolicy!.name).toBe('Standard SLA');
      expect(ticket.activities).toHaveLength(1);
      expect(ticket.attachments).toHaveLength(1);
      expect(ticket.nextSteps).toHaveLength(1);
    });

    it('should handle ticket without slaPolicy', async () => {
      const record = createMockTicketRecord({ slaPolicy: undefined });
      mockPrisma.ticket.findMany.mockResolvedValue([record]);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const result = await repo.findMany({ tenantId: 'tenant-123' });
      const ticket = result.tickets[0];

      expect(ticket.slaPolicy).toBeUndefined();
    });

    it('should handle ticket without activities and attachments', async () => {
      const record = createMockTicketRecord({
        activities: undefined,
        attachments: undefined,
        nextSteps: undefined,
      });
      mockPrisma.ticket.findMany.mockResolvedValue([record]);
      mockPrisma.ticket.count.mockResolvedValue(1);

      const result = await repo.findMany({ tenantId: 'tenant-123' });
      const ticket = result.tickets[0];

      expect(ticket.activities).toBeUndefined();
      expect(ticket.attachments).toBeUndefined();
      expect(ticket.nextSteps).toBeUndefined();
    });

    it('should calculate hasMore correctly when there are more records', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([createMockTicketRecord()]);
      mockPrisma.ticket.count.mockResolvedValue(100);

      const result = await repo.findMany(
        { tenantId: 'tenant-123' },
        { limit: 20, offset: 0 }
      );

      expect(result.hasMore).toBe(true);
    });

    it('should calculate hasMore correctly when at the end', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([createMockTicketRecord()]);
      mockPrisma.ticket.count.mockResolvedValue(21);

      const result = await repo.findMany(
        { tenantId: 'tenant-123' },
        { limit: 20, offset: 20 }
      );

      expect(result.hasMore).toBe(false);
    });
  });

  // ============================================
  // findById
  // ============================================
  describe('findById()', () => {
    it('should return ticket DTO when found', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ticket-001');
      expect(result!.subject).toBe('Test Ticket');
    });

    it('should return null when not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      const result = await repo.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should include all relations by default', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(createMockTicketRecord());

      await repo.findById('ticket-001');

      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith({
        where: { id: 'ticket-001' },
        include: {
          slaPolicy: true,
          activities: {
            orderBy: { timestamp: 'desc' },
          },
          attachments: true,
          nextSteps: {
            where: { completed: false },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });

    it('should disable relations when options are false', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(createMockTicketRecord());

      await repo.findById('ticket-001', {
        includeActivities: false,
        includeAttachments: false,
        includeNextSteps: false,
        includeSLAPolicy: false,
      });

      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith({
        where: { id: 'ticket-001' },
        include: {
          slaPolicy: false,
          activities: false,
          attachments: false,
          nextSteps: false,
        },
      });
    });

    it('should correctly map activity fields', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');
      const activity = result!.activities![0];

      expect(activity.id).toBe('activity-001');
      expect(activity.type).toBe('NOTE');
      expect(activity.content).toBe('Ticket created');
      expect(activity.isInternal).toBe(false);
      expect(activity.authorName).toBe('System');
      expect(activity.channel).toBe('SYSTEM');
    });

    it('should correctly map attachment fields', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');
      const attachment = result!.attachments![0];

      expect(attachment.id).toBe('attach-001');
      expect(attachment.name).toBe('screenshot.png');
      expect(attachment.size).toBe('2048');
      expect(attachment.fileType).toBe('image/png');
      expect(attachment.url).toBe('https://storage.example.com/screenshot.png');
    });

    it('should correctly map nextSteps fields', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');
      const step = result!.nextSteps![0];

      expect(step.id).toBe('step-001');
      expect(step.title).toBe('Follow up with customer');
      expect(step.dueDate).toBe('2026-02-06');
      expect(step.completed).toBe(false);
    });
  });

  // ============================================
  // findByIdSimple
  // ============================================
  describe('findByIdSimple()', () => {
    it('should return ticket without relations when found', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findByIdSimple('ticket-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('ticket-001');
      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith({
        where: { id: 'ticket-001' },
      });
    });

    it('should return null when not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      const result = await repo.findByIdSimple('non-existent');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // create
  // ============================================
  describe('create()', () => {
    it('should create a ticket with all fields', async () => {
      const createData = {
        ticketNumber: 'T-00002',
        subject: 'New Ticket',
        description: 'A new ticket',
        priority: 'HIGH' as const,
        contactName: 'John Smith',
        contactEmail: 'john@example.com',
        contactId: 'contact-001',
        assigneeId: 'user-001',
        slaPolicyId: 'sla-001',
        tenantId: 'tenant-123',
        slaResponseDue: new Date('2026-02-06T12:00:00Z'),
        slaResolutionDue: new Date('2026-02-07T12:00:00Z'),
        status: 'OPEN' as const,
        slaStatus: 'WITHIN_SLA' as const,
      };

      const createdRecord = createMockTicketRecord({
        id: 'ticket-new',
        ...createData,
      });
      mockPrisma.ticket.create.mockResolvedValue(createdRecord);

      const result = await repo.create(createData);

      expect(mockPrisma.ticket.create).toHaveBeenCalledWith({
        data: {
          ticketNumber: 'T-00002',
          subject: 'New Ticket',
          description: 'A new ticket',
          priority: 'HIGH',
          contactName: 'John Smith',
          contactEmail: 'john@example.com',
          contactId: 'contact-001',
          assigneeId: 'user-001',
          slaPolicyId: 'sla-001',
          tenantId: 'tenant-123',
          slaResponseDue: createData.slaResponseDue,
          slaResolutionDue: createData.slaResolutionDue,
          status: 'OPEN',
          slaStatus: 'WITHIN_SLA',
        },
        include: {
          slaPolicy: true,
        },
      });

      expect(result.subject).toBe('New Ticket');
    });
  });

  // ============================================
  // update
  // ============================================
  describe('update()', () => {
    it('should update a ticket with provided fields', async () => {
      const updateData = {
        subject: 'Updated Subject',
        status: 'IN_PROGRESS' as const,
        priority: 'HIGH' as const,
        assigneeId: 'user-789',
      };

      const updatedRecord = createMockTicketRecord({
        ...updateData,
      });
      mockPrisma.ticket.update.mockResolvedValue(updatedRecord);

      const result = await repo.update('ticket-001', updateData);

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-001' },
        data: {
          subject: 'Updated Subject',
          description: undefined,
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          assigneeId: 'user-789',
          resolvedAt: undefined,
          closedAt: undefined,
          firstResponseAt: undefined,
          slaBreachedAt: undefined,
          slaStatus: undefined,
        },
        include: {
          slaPolicy: true,
        },
      });

      expect(result).toBeDefined();
    });

    it('should update SLA-related fields', async () => {
      const now = new Date();
      const updateData = {
        resolvedAt: now,
        firstResponseAt: now,
        slaBreachedAt: now,
        slaStatus: 'BREACHED' as const,
        closedAt: now,
      };

      mockPrisma.ticket.update.mockResolvedValue(createMockTicketRecord(updateData));

      await repo.update('ticket-001', updateData);

      expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolvedAt: now,
            firstResponseAt: now,
            slaBreachedAt: now,
            slaStatus: 'BREACHED',
            closedAt: now,
          }),
        })
      );
    });
  });

  // ============================================
  // delete
  // ============================================
  describe('delete()', () => {
    it('should delete a ticket by id', async () => {
      mockPrisma.ticket.delete.mockResolvedValue({});

      await repo.delete('ticket-001');

      expect(mockPrisma.ticket.delete).toHaveBeenCalledWith({
        where: { id: 'ticket-001' },
      });
    });

    it('should propagate Prisma errors', async () => {
      mockPrisma.ticket.delete.mockRejectedValue(new Error('Record not found'));

      await expect(repo.delete('non-existent')).rejects.toThrow('Record not found');
    });
  });

  // ============================================
  // getNextTicketNumber
  // ============================================
  describe('getNextTicketNumber()', () => {
    it('should return T-00001 when no tickets exist', async () => {
      mockPrisma.ticket.count.mockResolvedValue(0);

      const result = await repo.getNextTicketNumber();

      expect(result).toBe('T-00001');
    });

    it('should return incremented ticket number', async () => {
      mockPrisma.ticket.count.mockResolvedValue(42);

      const result = await repo.getNextTicketNumber();

      expect(result).toBe('T-00043');
    });

    it('should pad the number with zeros', async () => {
      mockPrisma.ticket.count.mockResolvedValue(9);

      const result = await repo.getNextTicketNumber();

      expect(result).toBe('T-00010');
    });

    it('should handle large ticket counts', async () => {
      mockPrisma.ticket.count.mockResolvedValue(99999);

      const result = await repo.getNextTicketNumber();

      expect(result).toBe('T-100000');
    });
  });

  // ============================================
  // getSLAPolicy
  // ============================================
  describe('getSLAPolicy()', () => {
    it('should return SLA policy when found', async () => {
      const mockPolicy = {
        id: 'sla-001',
        name: 'Standard SLA',
        criticalResponseMinutes: 15,
        criticalResolutionMinutes: 120,
        highResponseMinutes: 30,
        highResolutionMinutes: 240,
        mediumResponseMinutes: 60,
        mediumResolutionMinutes: 480,
        lowResponseMinutes: 120,
        lowResolutionMinutes: 960,
      };

      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(mockPolicy);

      const result = await repo.getSLAPolicy('sla-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('sla-001');
      expect(result!.name).toBe('Standard SLA');
      expect(result!.criticalResponseMinutes).toBe(15);
      expect(result!.criticalResolutionMinutes).toBe(120);
      expect(result!.highResponseMinutes).toBe(30);
      expect(result!.highResolutionMinutes).toBe(240);
      expect(result!.mediumResponseMinutes).toBe(60);
      expect(result!.mediumResolutionMinutes).toBe(480);
      expect(result!.lowResponseMinutes).toBe(120);
      expect(result!.lowResolutionMinutes).toBe(960);

      expect(mockPrisma.sLAPolicy.findUnique).toHaveBeenCalledWith({
        where: { id: 'sla-001' },
      });
    });

    it('should return null when SLA policy not found', async () => {
      mockPrisma.sLAPolicy.findUnique.mockResolvedValue(null);

      const result = await repo.getSLAPolicy('non-existent');

      expect(result).toBeNull();
    });
  });

  // ============================================
  // getStats
  // ============================================
  describe('getStats()', () => {
    it('should return ticket stats aggregated by status and priority', async () => {
      mockPrisma.ticket.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(5); // breached

      mockPrisma.ticket.groupBy
        .mockResolvedValueOnce([
          { status: 'OPEN', _count: 20 },
          { status: 'IN_PROGRESS', _count: 15 },
          { status: 'RESOLVED', _count: 10 },
          { status: 'CLOSED', _count: 5 },
        ])
        .mockResolvedValueOnce([
          { priority: 'HIGH', _count: 10 },
          { priority: 'MEDIUM', _count: 25 },
          { priority: 'LOW', _count: 15 },
        ]);

      // Mock getAverageResponseTime (called internally via findMany)
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      const result = await repo.getStats('tenant-123');

      expect(result.total).toBe(50);
      expect(result.byStatus).toEqual({
        OPEN: 20,
        IN_PROGRESS: 15,
        RESOLVED: 10,
        CLOSED: 5,
      });
      expect(result.byPriority).toEqual({
        HIGH: 10,
        MEDIUM: 25,
        LOW: 15,
      });
      expect(result.slaBreached).toBe(5);
      expect(result.avgResponseTimeMinutes).toBe(0); // No tickets with response time
    });

    it('should call count with breached SLA filter', async () => {
      mockPrisma.ticket.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3);

      mockPrisma.ticket.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockPrisma.ticket.findMany.mockResolvedValue([]);

      await repo.getStats('tenant-123');

      // Second count call should check for breached SLA
      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          slaBreachedAt: { not: null },
        },
      });
    });
  });

  // ============================================
  // createActivity
  // ============================================
  describe('createActivity()', () => {
    it('should create a ticket activity', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        tenantId: 'tenant-123',
      });
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await repo.createActivity({
        ticketId: 'ticket-001',
        type: 'NOTE',
        content: 'A note on the ticket',
        authorName: 'Agent Smith',
        authorRole: 'SUPPORT',
        channel: 'EMAIL',
        isInternal: true,
      });

      expect(mockPrisma.ticket.findUnique).toHaveBeenCalledWith({
        where: { id: 'ticket-001' },
        select: { tenantId: true },
      });

      expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith({
        data: {
          ticketId: 'ticket-001',
          type: 'NOTE',
          content: 'A note on the ticket',
          authorName: 'Agent Smith',
          authorRole: 'SUPPORT',
          channel: 'EMAIL',
          isInternal: true,
          tenantId: 'tenant-123',
        },
      });
    });

    it('should default isInternal to false when not provided', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({
        tenantId: 'tenant-123',
      });
      mockPrisma.ticketActivity.create.mockResolvedValue({});

      await repo.createActivity({
        ticketId: 'ticket-001',
        type: 'REPLY',
        content: 'Public reply',
        authorName: 'Agent Smith',
        authorRole: null,
        channel: 'WEB',
      } as any);

      expect(mockPrisma.ticketActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isInternal: false,
        }),
      });
    });

    it('should throw when ticket not found', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      await expect(
        repo.createActivity({
          ticketId: 'non-existent',
          type: 'NOTE',
          content: 'test',
          authorName: 'Agent',
          authorRole: 'SUPPORT',
          channel: 'EMAIL',
        } as any)
      ).rejects.toThrow('Ticket not found: non-existent');
    });
  });

  // ============================================
  // count
  // ============================================
  describe('count()', () => {
    it('should return count based on filters', async () => {
      mockPrisma.ticket.count.mockResolvedValue(42);

      const result = await repo.count({
        tenantId: 'tenant-123',
        status: 'OPEN',
      });

      expect(result).toBe(42);
      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          status: 'OPEN',
        },
      });
    });

    it('should count with only tenantId', async () => {
      mockPrisma.ticket.count.mockResolvedValue(100);

      const result = await repo.count({ tenantId: 'tenant-123' });

      expect(result).toBe(100);
      expect(mockPrisma.ticket.count).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
      });
    });
  });

  // ============================================
  // getAverageResponseTime
  // ============================================
  describe('getAverageResponseTime()', () => {
    it('should return 0 when no tickets have response times', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      const result = await repo.getAverageResponseTime('tenant-123');

      expect(result).toBe(0);
    });

    it('should calculate average response time in minutes', async () => {
      const createdAt = new Date('2026-02-05T10:00:00Z');
      const firstResponseAt = new Date('2026-02-05T10:30:00Z'); // 30 min later

      mockPrisma.ticket.findMany.mockResolvedValue([
        { createdAt, firstResponseAt },
      ]);

      const result = await repo.getAverageResponseTime('tenant-123');

      expect(result).toBe(30);
    });

    it('should average multiple response times', async () => {
      const now = new Date('2026-02-05T10:00:00Z');

      mockPrisma.ticket.findMany.mockResolvedValue([
        {
          createdAt: now,
          firstResponseAt: new Date(now.getTime() + 60 * 60 * 1000), // 60 min
        },
        {
          createdAt: now,
          firstResponseAt: new Date(now.getTime() + 30 * 60 * 1000), // 30 min
        },
      ]);

      const result = await repo.getAverageResponseTime('tenant-123');

      expect(result).toBe(45); // (60 + 30) / 2
    });

    it('should query with correct where clause', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      await repo.getAverageResponseTime('tenant-123');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          firstResponseAt: { not: null },
        },
        select: {
          createdAt: true,
          firstResponseAt: true,
        },
      });
    });
  });

  // ============================================
  // findBreachingSLA
  // ============================================
  describe('findBreachingSLA()', () => {
    it('should return tickets breaching SLA', async () => {
      const breachingTickets = [
        createMockTicketRecord({
          id: 'ticket-breach',
          slaBreachedAt: new Date(),
        }),
      ];
      mockPrisma.ticket.findMany.mockResolvedValue(breachingTickets);

      const result = await repo.findBreachingSLA('tenant-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ticket-breach');
    });

    it('should query with correct breach conditions', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      await repo.findBreachingSLA('tenant-123');

      const call = mockPrisma.ticket.findMany.mock.calls[0][0];
      expect(call.where.tenantId).toBe('tenant-123');
      expect(call.where.status).toEqual({ notIn: ['RESOLVED', 'CLOSED'] });
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(3);

      // First condition: already breached
      expect(call.where.OR[0]).toEqual({
        slaBreachedAt: { not: null },
      });

      // Second condition: resolution overdue
      expect(call.where.OR[1]).toEqual({
        slaResolutionDue: { lt: expect.any(Date) },
      });

      // Third condition: response overdue (no first response yet)
      expect(call.where.OR[2]).toEqual({
        firstResponseAt: null,
        slaResponseDue: { lt: expect.any(Date) },
      });
    });

    it('should order results by slaResolutionDue ascending', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      await repo.findBreachingSLA('tenant-123');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { slaResolutionDue: 'asc' },
        })
      );
    });

    it('should include SLA policy', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      await repo.findBreachingSLA('tenant-123');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { slaPolicy: true },
        })
      );
    });

    it('should return empty array when no breaches found', async () => {
      mockPrisma.ticket.findMany.mockResolvedValue([]);

      const result = await repo.findBreachingSLA('tenant-123');

      expect(result).toEqual([]);
    });
  });

  // ============================================
  // toDTO mapping edge cases
  // ============================================
  describe('toDTO mapping', () => {
    it('should handle null description', async () => {
      const record = createMockTicketRecord({ description: null });
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');

      expect(result!.description).toBeNull();
    });

    it('should handle null contactId', async () => {
      const record = createMockTicketRecord({ contactId: null });
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');

      expect(result!.contactId).toBeNull();
    });

    it('should handle null assigneeId', async () => {
      const record = createMockTicketRecord({ assigneeId: null });
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');

      expect(result!.assigneeId).toBeNull();
    });

    it('should handle null SLA dates', async () => {
      const record = createMockTicketRecord({
        slaResponseDue: null,
        slaResolutionDue: null,
        slaBreachedAt: null,
        firstResponseAt: null,
        resolvedAt: null,
        closedAt: null,
      });
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');

      expect(result!.slaResponseDue).toBeNull();
      expect(result!.slaResolutionDue).toBeNull();
      expect(result!.slaBreachedAt).toBeNull();
      expect(result!.firstResponseAt).toBeNull();
      expect(result!.resolvedAt).toBeNull();
      expect(result!.closedAt).toBeNull();
    });

    it('should map SLA policy with all minute fields', async () => {
      const record = createMockTicketRecord();
      mockPrisma.ticket.findUnique.mockResolvedValue(record);

      const result = await repo.findById('ticket-001');
      const policy = result!.slaPolicy!;

      expect(policy.criticalResponseMinutes).toBe(15);
      expect(policy.criticalResolutionMinutes).toBe(120);
      expect(policy.highResponseMinutes).toBe(30);
      expect(policy.highResolutionMinutes).toBe(240);
      expect(policy.mediumResponseMinutes).toBe(60);
      expect(policy.mediumResolutionMinutes).toBe(480);
      expect(policy.lowResponseMinutes).toBe(120);
      expect(policy.lowResolutionMinutes).toBe(960);
    });
  });
});
