import { PrismaClient } from '@intelliflow/db';
import type {
  TicketRepository,
  TicketDTO,
  TicketFilters,
  TicketQueryOptions,
  TicketListResult,
  CreateTicketData,
  UpdateTicketData,
  TicketStats,
  CreateActivityData,
  SLAPolicyDTO,
} from '@intelliflow/application';
import type { TicketStatus, TicketPriority } from '@intelliflow/domain';

/**
 * Prisma Ticket Repository
 * Implements TicketRepository port using Prisma ORM
 */
export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(
    filters: TicketFilters,
    options: TicketQueryOptions = {}
  ): Promise<TicketListResult> {
    const {
      limit = 20,
      offset = 0,
      orderBy = [
        { field: 'priority', direction: 'desc' },
        { field: 'createdAt', direction: 'desc' },
      ],
      includeActivities = true,
      includeAttachments = true,
      includeSLAPolicy = true,
      activitiesLimit = 5,
    } = options;

    const where = this.buildWhereClause(filters);

    const prismaOrderBy = orderBy.map((o) => ({
      [o.field]: o.direction,
    }));

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: prismaOrderBy,
        include: {
          slaPolicy: includeSLAPolicy,
          activities: includeActivities
            ? {
                take: activitiesLimit,
                orderBy: { timestamp: 'desc' },
              }
            : false,
          attachments: includeAttachments,
        },
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => this.toDTO(t)),
      total,
      hasMore: offset + limit < total,
    };
  }

  async findById(
    id: string,
    options: TicketQueryOptions = {}
  ): Promise<TicketDTO | null> {
    const {
      includeActivities = true,
      includeAttachments = true,
      includeNextSteps = true,
      includeSLAPolicy = true,
    } = options;

    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        slaPolicy: includeSLAPolicy,
        activities: includeActivities
          ? {
              orderBy: { timestamp: 'desc' },
            }
          : false,
        attachments: includeAttachments,
        nextSteps: includeNextSteps
          ? {
              where: { completed: false },
              orderBy: { createdAt: 'asc' },
            }
          : false,
      },
    });

    if (!ticket) return null;
    return this.toDTO(ticket);
  }

  async findByIdSimple(id: string): Promise<TicketDTO | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
    });

    if (!ticket) return null;
    return this.toDTO(ticket);
  }

  async create(data: CreateTicketData): Promise<TicketDTO> {
    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber: data.ticketNumber,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactId: data.contactId,
        assigneeId: data.assigneeId,
        slaPolicyId: data.slaPolicyId,
        tenantId: data.tenantId,
        slaResponseDue: data.slaResponseDue,
        slaResolutionDue: data.slaResolutionDue,
        status: data.status,
        slaStatus: data.slaStatus,
      },
      include: {
        slaPolicy: true,
      },
    });

    return this.toDTO(ticket);
  }

  async update(id: string, data: UpdateTicketData): Promise<TicketDTO> {
    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        subject: data.subject,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assigneeId: data.assigneeId,
        resolvedAt: data.resolvedAt,
        closedAt: data.closedAt,
        firstResponseAt: data.firstResponseAt,
        slaBreachedAt: data.slaBreachedAt,
        slaStatus: data.slaStatus,
      },
      include: {
        slaPolicy: true,
      },
    });

    return this.toDTO(ticket);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.ticket.delete({
      where: { id },
    });
  }

  async getNextTicketNumber(): Promise<string> {
    const count = await this.prisma.ticket.count();
    return `T-${String(count + 1).padStart(5, '0')}`;
  }

  async getSLAPolicy(id: string): Promise<SLAPolicyDTO | null> {
    const policy = await this.prisma.sLAPolicy.findUnique({
      where: { id },
    });

    if (!policy) return null;

    return {
      id: policy.id,
      name: policy.name,
      criticalResponseMinutes: policy.criticalResponseMinutes,
      criticalResolutionMinutes: policy.criticalResolutionMinutes,
      highResponseMinutes: policy.highResponseMinutes,
      highResolutionMinutes: policy.highResolutionMinutes,
      mediumResponseMinutes: policy.mediumResponseMinutes,
      mediumResolutionMinutes: policy.mediumResolutionMinutes,
      lowResponseMinutes: policy.lowResponseMinutes,
      lowResolutionMinutes: policy.lowResolutionMinutes,
    };
  }

  async getStats(tenantId: string): Promise<TicketStats> {
    const where = { tenantId };

    const [total, byStatus, byPriority, breachedCount, avgResponseTime] =
      await Promise.all([
        this.prisma.ticket.count({ where }),
        this.prisma.ticket.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where,
          _count: true,
        }),
        this.prisma.ticket.count({
          where: {
            ...where,
            slaBreachedAt: { not: null },
          },
        }),
        this.getAverageResponseTime(tenantId),
      ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status as TicketStatus] = item._count;
          return acc;
        },
        {} as Record<TicketStatus, number>
      ),
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority as TicketPriority] = item._count;
          return acc;
        },
        {} as Record<TicketPriority, number>
      ),
      slaBreached: breachedCount,
      avgResponseTimeMinutes: avgResponseTime,
    };
  }

  async createActivity(data: CreateActivityData): Promise<void> {
    // Fetch tenantId from the parent ticket
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: data.ticketId },
      select: { tenantId: true },
    });

    if (!ticket) {
      throw new Error(`Ticket not found: ${data.ticketId}`);
    }

    await this.prisma.ticketActivity.create({
      data: {
        ticketId: data.ticketId,
        type: data.type,
        content: data.content,
        authorName: data.authorName,
        authorRole: data.authorRole,
        channel: data.channel,
        isInternal: data.isInternal ?? false,
        tenantId: ticket.tenantId,
      },
    });
  }

  async count(filters: TicketFilters): Promise<number> {
    const where = this.buildWhereClause(filters);
    return this.prisma.ticket.count({ where });
  }

  async getAverageResponseTime(tenantId: string): Promise<number> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        firstResponseAt: { not: null },
      },
      select: {
        createdAt: true,
        firstResponseAt: true,
      },
    });

    if (tickets.length === 0) return 0;

    const totalResponseTime = tickets.reduce((sum, ticket) => {
      const responseTime =
        ticket.firstResponseAt!.getTime() - ticket.createdAt.getTime();
      return sum + responseTime;
    }, 0);

    const avgMs = totalResponseTime / tickets.length;
    return Math.round(avgMs / (1000 * 60)); // Convert to minutes
  }

  async findBreachingSLA(tenantId: string): Promise<TicketDTO[]> {
    const now = new Date();

    const tickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        OR: [
          { slaBreachedAt: { not: null } },
          {
            slaResolutionDue: { lt: now },
          },
          {
            firstResponseAt: null,
            slaResponseDue: { lt: now },
          },
        ],
      },
      include: {
        slaPolicy: true,
      },
      orderBy: { slaResolutionDue: 'asc' },
    });

    return tickets.map((t) => this.toDTO(t));
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private buildWhereClause(filters: TicketFilters): Record<string, unknown> {
    const where: Record<string, unknown> = {
      tenantId: filters.tenantId,
    };

    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.slaStatus) where.slaStatus = filters.slaStatus;
    if (filters.contactId) where.contactId = filters.contactId;

    return where;
  }

  private toDTO(record: Record<string, unknown>): TicketDTO {
    return {
      id: record.id as string,
      ticketNumber: record.ticketNumber as string,
      subject: record.subject as string,
      description: record.description as string | null,
      status: record.status as TicketStatus,
      priority: record.priority as TicketPriority,
      tenantId: record.tenantId as string,
      slaPolicyId: record.slaPolicyId as string,
      slaPolicy: record.slaPolicy
        ? {
            id: (record.slaPolicy as Record<string, unknown>).id as string,
            name: (record.slaPolicy as Record<string, unknown>).name as string,
            criticalResponseMinutes: (
              record.slaPolicy as Record<string, unknown>
            ).criticalResponseMinutes as number,
            criticalResolutionMinutes: (
              record.slaPolicy as Record<string, unknown>
            ).criticalResolutionMinutes as number,
            highResponseMinutes: (record.slaPolicy as Record<string, unknown>)
              .highResponseMinutes as number,
            highResolutionMinutes: (record.slaPolicy as Record<string, unknown>)
              .highResolutionMinutes as number,
            mediumResponseMinutes: (
              record.slaPolicy as Record<string, unknown>
            ).mediumResponseMinutes as number,
            mediumResolutionMinutes: (
              record.slaPolicy as Record<string, unknown>
            ).mediumResolutionMinutes as number,
            lowResponseMinutes: (record.slaPolicy as Record<string, unknown>)
              .lowResponseMinutes as number,
            lowResolutionMinutes: (record.slaPolicy as Record<string, unknown>)
              .lowResolutionMinutes as number,
          }
        : undefined,
      slaResponseDue: record.slaResponseDue as Date | null,
      slaResolutionDue: record.slaResolutionDue as Date | null,
      slaStatus: record.slaStatus as import('@intelliflow/domain').SLAStatus,
      slaBreachedAt: record.slaBreachedAt as Date | null,
      firstResponseAt: record.firstResponseAt as Date | null,
      resolvedAt: record.resolvedAt as Date | null,
      contactId: record.contactId as string | null,
      contactName: record.contactName as string,
      contactEmail: record.contactEmail as string,
      assigneeId: record.assigneeId as string | null,
      createdAt: record.createdAt as Date,
      updatedAt: record.updatedAt as Date,
      closedAt: record.closedAt as Date | null,
      activities: Array.isArray(record.activities)
        ? record.activities.map((a: Record<string, unknown>) => ({
            id: a.id as string,
            type: a.type as string,
            content: a.content as string,
            timestamp: a.timestamp as Date,
            isInternal: a.isInternal as boolean,
            authorName: a.authorName as string,
            authorRole: a.authorRole as string | null,
            channel: a.channel as string,
          }))
        : undefined,
      attachments: Array.isArray(record.attachments)
        ? record.attachments.map((a: Record<string, unknown>) => ({
            id: a.id as string,
            name: a.name as string,
            size: a.size as string,
            fileType: a.fileType as string,
            url: a.url as string | null,
            uploadedAt: a.uploadedAt as Date,
          }))
        : undefined,
      nextSteps: Array.isArray(record.nextSteps)
        ? record.nextSteps.map((n: Record<string, unknown>) => ({
            id: n.id as string,
            title: n.title as string,
            dueDate: n.dueDate as string,
            completed: n.completed as boolean,
          }))
        : undefined,
    };
  }
}
