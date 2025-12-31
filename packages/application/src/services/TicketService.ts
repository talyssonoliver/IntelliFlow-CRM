import type { PrismaClient, Ticket, TicketStatus, TicketPriority, SLAStatus } from '@intelliflow/db';

/**
 * Ticket Service
 *
 * Handles support ticket operations including:
 * - CRUD operations with validation
 * - SLA calculation and tracking
 * - Statistics and aggregations
 * - Status transitions
 */
export class TicketService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Calculate SLA status for a ticket
   */
  calculateSLAStatus(ticket: Ticket): SLAStatus {
    const now = new Date();

    // If already breached, return breached
    if (ticket.slaBreachedAt) {
      return 'BREACHED';
    }

    // If resolved, return met
    if (ticket.resolvedAt) {
      return 'MET';
    }

    // Check response SLA
    if (ticket.slaResponseDue && !ticket.firstResponseAt) {
      const timeToResponse = ticket.slaResponseDue.getTime() - now.getTime();
      const hoursToResponse = timeToResponse / (1000 * 60 * 60);

      if (timeToResponse <= 0) {
        return 'BREACHED';
      } else if (hoursToResponse <= 1) {
        return 'AT_RISK';
      }
    }

    // Check resolution SLA
    if (ticket.slaResolutionDue) {
      const timeToResolution = ticket.slaResolutionDue.getTime() - now.getTime();
      const hoursToResolution = timeToResolution / (1000 * 60 * 60);

      if (timeToResolution <= 0) {
        return 'BREACHED';
      } else if (hoursToResolution <= 2) {
        return 'AT_RISK';
      }
    }

    return 'ON_TRACK';
  }

  /**
   * Find tickets with filters and pagination
   */
  async findMany(params: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToId?: string;
    limit?: number;
    offset?: number;
    tenantId: string;
  }) {
    const {
      status,
      priority,
      assignedToId,
      limit = 20,
      offset = 0,
      tenantId,
    } = params;

    const where: any = {
      tenantId,
    };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToId) where.assigneeId = assignedToId;

    const tickets = await this.prisma.ticket.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        slaPolicy: true,
        activities: {
          take: 5,
          orderBy: { timestamp: 'desc' },
        },
        attachments: true,
      },
    });

    // Calculate SLA status for each ticket
    const ticketsWithSLA = tickets.map((ticket: Ticket) => ({
      ...ticket,
      slaStatus: this.calculateSLAStatus(ticket),
    }));

    const total = await this.prisma.ticket.count({ where });

    return {
      tickets: ticketsWithSLA,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get a single ticket by ID
   */
  async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
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

    if (!ticket) {
      return null;
    }

    return {
      ...ticket,
      slaStatus: this.calculateSLAStatus(ticket),
    };
  }

  /**
   * Create a new ticket
   */
  async create(data: {
    subject: string;
    description?: string;
    priority: TicketPriority;
    contactName: string;
    contactEmail: string;
    contactId?: string;
    assigneeId?: string;
    slaPolicyId: string;
    tenantId: string;
  }) {
    // Generate ticket number
    const ticketCount = await this.prisma.ticket.count();
    const ticketNumber = `T-${String(ticketCount + 1).padStart(5, '0')}`;

    // Get SLA policy to calculate due times
    const slaPolicy = await this.prisma.sLAPolicy.findUnique({
      where: { id: data.slaPolicyId },
    });

    if (!slaPolicy) {
      throw new Error('SLA policy not found');
    }

    const now = new Date();

    // Get SLA times based on priority
    const getResponseMinutes = (priority: TicketPriority) => {
      switch (priority) {
        case 'CRITICAL': return slaPolicy.criticalResponseMinutes;
        case 'HIGH': return slaPolicy.highResponseMinutes;
        case 'MEDIUM': return slaPolicy.mediumResponseMinutes;
        case 'LOW': return slaPolicy.lowResponseMinutes;
      }
    };

    const getResolutionMinutes = (priority: TicketPriority) => {
      switch (priority) {
        case 'CRITICAL': return slaPolicy.criticalResolutionMinutes;
        case 'HIGH': return slaPolicy.highResolutionMinutes;
        case 'MEDIUM': return slaPolicy.mediumResolutionMinutes;
        case 'LOW': return slaPolicy.lowResolutionMinutes;
      }
    };

    const slaResponseDue = new Date(now.getTime() + getResponseMinutes(data.priority) * 60 * 1000);
    const slaResolutionDue = new Date(now.getTime() + getResolutionMinutes(data.priority) * 60 * 1000);

    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactId: data.contactId,
        assigneeId: data.assigneeId,
        slaPolicyId: data.slaPolicyId,
        tenantId: data.tenantId,
        slaResponseDue,
        slaResolutionDue,
        status: 'OPEN',
        slaStatus: 'ON_TRACK',
      },
      include: {
        slaPolicy: true,
      },
    });

    // Create initial activity
    await this.prisma.ticketActivity.create({
      data: {
        ticketId: ticket.id,
        type: 'SYSTEM_EVENT',
        content: 'Ticket created',
        authorName: 'System',
        authorRole: 'System',
        channel: 'PORTAL',
      },
    });

    return {
      ...ticket,
      slaStatus: this.calculateSLAStatus(ticket),
    };
  }

  /**
   * Update a ticket
   */
  async update(
    id: string,
    data: {
      subject?: string;
      description?: string;
      status?: TicketStatus;
      priority?: TicketPriority;
      assigneeId?: string;
    }
  ) {
    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...data,
        resolvedAt: data.status === 'RESOLVED' ? new Date() : undefined,
        closedAt: data.status === 'CLOSED' ? new Date() : undefined,
      },
      include: {
        slaPolicy: true,
      },
    });

    // Log activity
    if (data.status) {
      await this.prisma.ticketActivity.create({
        data: {
          ticketId: id,
          type: 'STATUS_CHANGE',
          content: `Status changed to ${data.status}`,
          authorName: 'System',
          authorRole: 'System',
          channel: 'PORTAL',
        },
      });
    }

    return {
      ...ticket,
      slaStatus: this.calculateSLAStatus(ticket),
    };
  }

  /**
   * Delete a ticket (hard delete)
   */
  async delete(id: string) {
    await this.prisma.ticket.delete({
      where: { id },
    });
  }

  /**
   * Get ticket statistics
   */
  async getStats(tenantId: string) {
    const where: any = {
      tenantId,
    };

    const [
      total,
      byStatus,
      byPriority,
      breachedTickets,
      avgResponseTime,
    ] = await Promise.all([
      // Total tickets
      this.prisma.ticket.count({ where }),

      // By status
      this.prisma.ticket.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),

      // By priority
      this.prisma.ticket.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),

      // Breached tickets
      this.prisma.ticket.count({
        where: {
          ...where,
          slaBreachedAt: { not: null },
        },
      }),

      // Average response time
      this.getAverageResponseTime(where),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc: Record<string, number>, item: any) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byPriority: byPriority.reduce((acc: Record<string, number>, item: any) => {
        acc[item.priority] = item._count;
        return acc;
      }, {} as Record<string, number>),
      slaBreached: breachedTickets,
      avgResponseTime,
    };
  }

  /**
   * Calculate average response time in minutes
   */
  private async getAverageResponseTime(where: any): Promise<number> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        ...where,
        firstResponseAt: { not: null },
      },
      select: {
        createdAt: true,
        firstResponseAt: true,
      },
    });

    if (tickets.length === 0) return 0;

    const totalResponseTime = tickets.reduce((sum: number, ticket: any) => {
      const responseTime =
        ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime();
      return sum + responseTime;
    }, 0);

    const avgMs = totalResponseTime / tickets.length;
    return Math.round(avgMs / (1000 * 60)); // Convert to minutes
  }

  /**
   * Add a response to a ticket
   */
  async addResponse(
    ticketId: string,
    content: string,
    authorName: string,
    authorRole: string
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    // Create activity
    await this.prisma.ticketActivity.create({
      data: {
        ticketId,
        type: 'AGENT_REPLY',
        content,
        authorName,
        authorRole,
        channel: 'PORTAL',
      },
    });

    // Update first response time if this is the first response
    if (!ticket.firstResponseAt) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }
  }
}
