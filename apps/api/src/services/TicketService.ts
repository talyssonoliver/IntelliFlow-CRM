import type {
  PrismaClient,
  Ticket,
  TicketStatus,
  TicketPriority,
  SLAStatus,
} from '@intelliflow/db';

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
   * Map user role to a human-friendly assignee title.
   */
  private getAssigneeTitle(role?: string | null): string {
    switch (role) {
      case 'ADMIN':
        return 'Support Admin';
      case 'MANAGER':
        return 'Support Manager';
      case 'SALES_REP':
        return 'Support Specialist';
      case 'USER':
      default:
        return 'Support Agent';
    }
  }

  /**
   * Batch-load assignee profiles for tickets.
   */
  private async getAssigneeProfiles(assigneeIds: string[]): Promise<
    Map<
      string,
      {
        name: string | null;
        title: string;
        avatar: string | null;
      }
    >
  > {
    if (assigneeIds.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: {
        id: true,
        name: true,
        role: true,
        avatarUrl: true,
      },
    });

    return new Map(
      users.map((user) => [
        user.id,
        {
          name: user.name ?? null,
          title: this.getAssigneeTitle(user.role),
          avatar: user.avatarUrl ?? null,
        },
      ])
    );
  }

  /**
   * Attach assignee display metadata to a ticket payload.
   */
  private withAssigneeMetadata<T extends { assigneeId: string | null }>(
    ticket: T,
    profiles: Map<string, { name: string | null; title: string; avatar: string | null }>
  ): T & {
    assigneeName: string | null;
    assigneeTitle: string | null;
    assigneeAvatar: string | null;
  } {
    const profile = ticket.assigneeId ? profiles.get(ticket.assigneeId) : undefined;
    return {
      ...ticket,
      assigneeName: profile?.name ?? null,
      assigneeTitle: profile?.title ?? null,
      assigneeAvatar: profile?.avatar ?? null,
    };
  }

  /**
   * Calculate SLA status for a ticket
   */
  calculateSLAStatus(ticket: Ticket): SLAStatus {
    const now = new Date();
    const hasSLADue = Boolean(ticket.slaResponseDue || ticket.slaResolutionDue);

    // Guard against malformed data: breach timestamp without any SLA deadline.
    if (ticket.slaBreachedAt && hasSLADue) {
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
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    tenantId: string;
  }) {
    const {
      status,
      priority,
      assignedToId,
      search,
      sortBy,
      sortOrder,
      limit = 20,
      offset = 0,
      tenantId,
    } = params;

    const where: any = {
      tenantId,
    };

    if (search) {
      // Find assignees whose name matches the search term
      const matchingAssignees = await this.prisma.user.findMany({
        where: {
          tenantId,
          name: { contains: search, mode: 'insensitive' },
        },
        select: { id: true },
      });
      const matchingAssigneeIds = matchingAssignees.map((u) => u.id);

      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        ...(matchingAssigneeIds.length > 0 ? [{ assigneeId: { in: matchingAssigneeIds } }] : []),
      ];
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedToId) where.assigneeId = assignedToId;

    const orderBy = sortBy
      ? [{ [sortBy]: sortOrder || 'desc' } as Record<string, 'asc' | 'desc'>]
      : [{ createdAt: 'desc' as const }];

    const tickets = await this.prisma.ticket.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy,
      include: {
        slaPolicy: true,
        activities: {
          take: 5,
          orderBy: { timestamp: 'desc' },
        },
        attachments: true,
      },
    });

    // Resolve assignee display metadata in one query for all returned tickets
    const assigneeIds = [
      ...new Set(tickets.map((ticket) => ticket.assigneeId).filter((id): id is string => !!id)),
    ];
    const assigneeProfiles = await this.getAssigneeProfiles(assigneeIds);

    // Calculate SLA status for each ticket and attach assignee metadata
    const ticketsWithSLA = tickets.map((ticket: Ticket) =>
      this.withAssigneeMetadata(
        {
          ...ticket,
          slaStatus: this.calculateSLAStatus(ticket),
        },
        assigneeProfiles
      )
    );

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
        relatedTickets: {
          orderBy: { similarity: 'desc' },
        },
        aiInsight: true,
      },
    });

    if (!ticket) {
      return null;
    }

    const assigneeProfiles = await this.getAssigneeProfiles(
      ticket.assigneeId ? [ticket.assigneeId] : []
    );

    return this.withAssigneeMetadata(
      {
        ...ticket,
        slaStatus: this.calculateSLAStatus(ticket),
      },
      assigneeProfiles
    );
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
        case 'CRITICAL':
          return slaPolicy.criticalResponseMinutes;
        case 'HIGH':
          return slaPolicy.highResponseMinutes;
        case 'MEDIUM':
          return slaPolicy.mediumResponseMinutes;
        case 'LOW':
          return slaPolicy.lowResponseMinutes;
      }
    };

    const getResolutionMinutes = (priority: TicketPriority) => {
      switch (priority) {
        case 'CRITICAL':
          return slaPolicy.criticalResolutionMinutes;
        case 'HIGH':
          return slaPolicy.highResolutionMinutes;
        case 'MEDIUM':
          return slaPolicy.mediumResolutionMinutes;
        case 'LOW':
          return slaPolicy.lowResolutionMinutes;
      }
    };

    const slaResponseDue = new Date(now.getTime() + getResponseMinutes(data.priority) * 60 * 1000);
    const slaResolutionDue = new Date(
      now.getTime() + getResolutionMinutes(data.priority) * 60 * 1000
    );

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
        tenantId: data.tenantId,
        type: 'SYSTEM_EVENT',
        content: 'Ticket created',
        authorName: 'System',
        authorRole: 'System',
        channel: 'PORTAL',
      },
    });

    // Generate default next steps based on priority
    const defaultNextSteps = this.getDefaultNextSteps(data.priority);
    if (defaultNextSteps.length > 0) {
      await this.prisma.ticketNextStep.createMany({
        data: defaultNextSteps.map((step) => ({
          ticketId: ticket.id,
          title: step.title,
          dueDateLabel: step.dueDateLabel,
          completed: false,
          tenantId: data.tenantId,
        })),
      });
    }

    // Find and link related tickets (non-blocking, best-effort)
    this.findAndLinkRelatedTickets({
      id: ticket.id,
      subject: data.subject,
      tenantId: data.tenantId,
    }).catch(() => {});

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
          tenantId: ticket.tenantId,
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
   * Delete a ticket (hard delete) — blocked for resolved/closed/archived tickets
   */
  async delete(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!ticket) {
      throw new Error(`Ticket not found: ${id}`);
    }

    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      throw new Error(
        'Cannot delete resolved or closed tickets. Use archive instead to remove from active views.'
      );
    }

    if (ticket.status === 'ARCHIVED') {
      throw new Error('Cannot delete archived tickets. They are kept for audit purposes.');
    }

    await this.prisma.ticket.delete({
      where: { id },
    });
  }

  /**
   * Archive a resolved or closed ticket (soft removal from active views)
   */
  async archive(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!ticket) {
      throw new Error(`Ticket not found: ${id}`);
    }

    if (ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED') {
      throw new Error('Only resolved or closed tickets can be archived.');
    }

    return this.prisma.ticket.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  /**
   * Get ticket statistics
   */
  async getStats(tenantId: string, timeWindow?: string) {
    const where: any = {
      tenantId,
    };

    // Apply time window filter
    if (timeWindow && timeWindow !== 'all') {
      const now = new Date();
      const ms: Record<string, number> = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      if (ms[timeWindow]) {
        where.createdAt = { gte: new Date(now.getTime() - ms[timeWindow]) };
      }
    }

    // Start of today (midnight UTC)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      total,
      byStatus,
      byPriority,
      bySLAStatusRaw,
      breachedTickets,
      resolvedToday,
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

      // By SLA status
      this.prisma.ticket.groupBy({
        by: ['slaStatus'],
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

      // Resolved today
      this.prisma.ticket.count({
        where: {
          ...where,
          resolvedAt: { gte: todayStart },
        },
      }),

      // Average response time
      this.getAverageResponseTime(where),
    ]);

    // Zero-fill all 5 SLA statuses
    const bySLAStatus: Record<string, number> = {
      ON_TRACK: 0,
      AT_RISK: 0,
      BREACHED: 0,
      MET: 0,
      PAUSED: 0,
    };
    bySLAStatusRaw.forEach((item: any) => {
      bySLAStatus[item.slaStatus] = item._count;
    });

    return {
      total,
      byStatus: byStatus.reduce(
        (acc: Record<string, number>, item: any) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      byPriority: byPriority.reduce(
        (acc: Record<string, number>, item: any) => {
          acc[item.priority] = item._count;
          return acc;
        },
        {} as Record<string, number>
      ),
      bySLAStatus,
      slaBreached: breachedTickets,
      resolvedToday,
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
      const responseTime = ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime();
      return sum + responseTime;
    }, 0);

    const avgMs = totalResponseTime / tickets.length;
    return Math.round(avgMs / (1000 * 60)); // Convert to minutes
  }

  /**
   * Get default next steps based on ticket priority
   */
  private getDefaultNextSteps(priority: TicketPriority): { title: string; dueDateLabel: string }[] {
    const base: { title: string; dueDateLabel: string }[] = [
      {
        title: 'Review ticket details and confirm category',
        dueDateLabel: 'Due Today',
      },
      {
        title: 'Send initial acknowledgement to customer',
        dueDateLabel: 'Due Today',
      },
    ];

    if (priority === 'CRITICAL' || priority === 'HIGH') {
      return [
        ...base,
        {
          title: 'Escalate to senior support if unresolved',
          dueDateLabel: priority === 'CRITICAL' ? 'Due in 1 hour' : 'Due Today',
        },
        {
          title: 'Update customer with resolution progress',
          dueDateLabel: 'Tomorrow',
        },
      ];
    }

    return [
      ...base,
      {
        title: 'Investigate root cause and document findings',
        dueDateLabel: 'Tomorrow',
      },
    ];
  }

  /**
   * Find and link related tickets by subject word overlap
   */
  private async findAndLinkRelatedTickets(ticket: {
    id: string;
    subject: string;
    tenantId: string;
  }) {
    try {
      const recentTickets = await this.prisma.ticket.findMany({
        where: {
          tenantId: ticket.tenantId,
          id: { not: ticket.id },
          status: { notIn: ['ARCHIVED'] },
        },
        select: { id: true, subject: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const subjectWords = new Set(
        ticket.subject
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
      if (subjectWords.size === 0) return;

      const matches: {
        id: string;
        subject: string;
        status: string;
        similarity: number;
      }[] = [];

      for (const other of recentTickets) {
        const otherWords = other.subject
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        if (otherWords.length === 0) continue;
        const overlap = otherWords.filter((w) => subjectWords.has(w)).length;
        const similarity = Math.round(
          (overlap / Math.max(subjectWords.size, otherWords.length)) * 100
        );
        if (similarity >= 30) {
          matches.push({
            id: other.id,
            subject: other.subject,
            status: other.status,
            similarity,
          });
        }
      }

      if (matches.length === 0) return;

      const topMatches = [...matches].sort((a, b) => b.similarity - a.similarity).slice(0, 5);

      await this.prisma.relatedTicket.createMany({
        data: topMatches.map((m) => ({
          ticketId: ticket.id,
          relatedId: m.id,
          relatedSubject: m.subject,
          relatedStatus: m.status as TicketStatus,
          similarity: m.similarity,
          tenantId: ticket.tenantId,
        })),
        skipDuplicates: true,
      });
    } catch {
      // Best-effort: don't fail ticket creation if relation linking fails
    }
  }

  /**
   * Add a response to a ticket
   */
  async addResponse(ticketId: string, content: string, authorName: string, authorRole: string) {
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
        tenantId: ticket.tenantId,
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
