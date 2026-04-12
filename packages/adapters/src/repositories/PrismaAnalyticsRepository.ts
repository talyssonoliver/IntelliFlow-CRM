import { PrismaClient, Prisma, AuditAction } from '@intelliflow/db';
import type {
  AnalyticsRepository,
  OpportunityGroupByResult,
  LeadGroupByResult,
  DateRangeQuery,
  ActivityItem,
} from '@intelliflow/application';

/**
 * Prisma Analytics Repository
 * Implements AnalyticsRepository port using Prisma ORM
 * Handles complex aggregation queries for dashboard metrics
 */
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDealsWonByMonth(tenantId: string, months: number): Promise<OpportunityGroupByResult[]> {
    const monthsAgo = new Date();
    monthsAgo.setUTCMonth(monthsAgo.getUTCMonth() - months);

    const result = await this.prisma.opportunity.groupBy({
      by: ['closedAt'],
      where: {
        tenantId,
        stage: 'CLOSED_WON',
        closedAt: {
          gte: monthsAgo,
        },
      },
      _count: true,
      _sum: {
        value: true,
      },
    });

    return result.map((r) => ({
      closedAt: r.closedAt,
      _count: r._count,
      _sum: {
        value: r._sum.value ? Number(r._sum.value) : null,
      },
    }));
  }

  async getMonthlyRevenue(tenantId: string, dateRange: DateRangeQuery): Promise<number> {
    const result = await this.prisma.opportunity.aggregate({
      where: {
        tenantId,
        stage: 'CLOSED_WON',
        closedAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
      _sum: {
        value: true,
      },
    });

    return result._sum.value ? Number(result._sum.value) : 0;
  }

  async countLeadsInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number> {
    return this.prisma.lead.count({
      where: {
        tenantId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });
  }

  async countOpportunitiesInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number> {
    return this.prisma.opportunity.count({
      where: {
        tenantId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });
  }

  async countContactsInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number> {
    return this.prisma.contact.count({
      where: {
        tenantId,
        createdAt: {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        },
      },
    });
  }

  async getLeadsBySource(tenantId: string): Promise<LeadGroupByResult[]> {
    const result = await this.prisma.lead.groupBy({
      by: ['source'],
      where: {
        tenantId,
      },
      _count: true,
    });

    return result.map((r) => ({
      source: r.source,
      _count: r._count,
    }));
  }

  async getRecentAuditLogs(
    tenantId: string,
    limit: number,
    actions?: string[]
  ): Promise<ActivityItem[]> {
    const activities = await this.prisma.auditLogEntry.findMany({
      where: {
        tenantId,
        ...(actions && actions.length > 0
          ? {
              action: {
                in: actions as AuditAction[],
              },
            }
          : {}),
      },
      include: {
        user: { select: { name: true } },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });

    return activities.map((activity) => ({
      id: activity.id,
      action: activity.action,
      eventType: activity.eventType,
      icon: this.getIconForAction(activity.action),
      description: this.getDescriptionForAction(activity.action, activity.metadata),
      actorName: activity.user?.name ?? null,
      createdAt: activity.timestamp,
      metadata:
        typeof activity.metadata === 'object' && activity.metadata !== null
          ? (activity.metadata as Record<string, unknown>)
          : {},
    }));
  }

  async countTotalLeads(tenantId: string): Promise<number> {
    return this.prisma.lead.count({
      where: {
        tenantId,
      },
    });
  }

  async countLeadsThisMonth(tenantId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return this.prisma.lead.count({
      where: {
        tenantId,
        createdAt: {
          gte: startOfMonth,
        },
      },
    });
  }

  // ============================================
  // IFC-190: Sales Metrics
  // ============================================

  async countClosedWonInRange(
    tenantId: string,
    dateRange: DateRangeQuery,
    ownerId?: string
  ): Promise<number> {
    return this.prisma.opportunity.count({
      where: {
        tenantId,
        stage: 'CLOSED_WON',
        closedAt: { gte: dateRange.startDate, lte: dateRange.endDate },
        ...(ownerId ? { ownerId } : {}),
      },
    });
  }

  async countClosedLostInRange(
    tenantId: string,
    dateRange: DateRangeQuery,
    ownerId?: string
  ): Promise<number> {
    return this.prisma.opportunity.count({
      where: {
        tenantId,
        stage: 'CLOSED_LOST',
        closedAt: { gte: dateRange.startDate, lte: dateRange.endDate },
        ...(ownerId ? { ownerId } : {}),
      },
    });
  }

  async getPipelineValue(
    tenantId: string,
    dateRange: DateRangeQuery,
    ownerId?: string
  ): Promise<number> {
    const result = await this.prisma.opportunity.aggregate({
      where: {
        tenantId,
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
        createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
        ...(ownerId ? { ownerId } : {}),
      },
      _sum: { value: true },
    });
    return result._sum.value ? Number(result._sum.value) : 0;
  }

  async getAvgSalesCycleLength(
    tenantId: string,
    dateRange: DateRangeQuery,
    ownerId?: string
  ): Promise<number | null> {
    const ownerFilter = ownerId ? Prisma.sql` AND "ownerId" = ${ownerId}` : Prisma.empty;

    const result = await this.prisma.$queryRaw<Array<{ avg_days: number | null }>>(
      Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 86400) as avg_days
        FROM "Opportunity"
        WHERE "tenantId" = ${tenantId}
          AND stage = 'CLOSED_WON'
          AND "closedAt" IS NOT NULL
          AND "closedAt" >= ${dateRange.startDate}
          AND "closedAt" <= ${dateRange.endDate}${ownerFilter}`
    );

    const avgDays = result[0]?.avg_days;
    return avgDays == null ? null : Math.round(avgDays * 10) / 10;
  }

  async getRevenueInRange(
    tenantId: string,
    dateRange: DateRangeQuery,
    ownerId?: string
  ): Promise<number> {
    const result = await this.prisma.opportunity.aggregate({
      where: {
        tenantId,
        stage: 'CLOSED_WON',
        closedAt: { gte: dateRange.startDate, lte: dateRange.endDate },
        ...(ownerId ? { ownerId } : {}),
      },
      _sum: { value: true },
    });
    return result._sum.value ? Number(result._sum.value) : 0;
  }

  // ============================================
  // IFC-190: Lead Metrics
  // ============================================

  async getLeadsBySourceInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<LeadGroupByResult[]> {
    const result = await this.prisma.lead.groupBy({
      by: ['source'],
      where: {
        tenantId,
        createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
      },
      _count: true,
    });
    return result.map((r) => ({ source: r.source, _count: r._count }));
  }

  async getLeadsByStatus(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<Array<{ status: string; _count: number }>> {
    const result = await this.prisma.lead.groupBy({
      by: ['status'],
      where: {
        tenantId,
        createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
      },
      _count: true,
    });
    return result.map((r) => ({ status: r.status, _count: r._count }));
  }

  async countConvertedLeadsInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number> {
    return this.prisma.lead.count({
      where: {
        tenantId,
        status: 'CONVERTED',
        createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
      },
    });
  }

  // ============================================
  // IFC-190: Conversion Funnel
  // ============================================

  async getOpportunitiesByStageInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<Array<{ stage: string; _count: number; _sum: { value: number | null } }>> {
    const result = await this.prisma.opportunity.groupBy({
      by: ['stage'],
      where: {
        tenantId,
        createdAt: { gte: dateRange.startDate, lte: dateRange.endDate },
      },
      _count: true,
      _sum: { value: true },
    });
    return result.map((r) => ({
      stage: r.stage,
      _count: r._count,
      _sum: { value: r._sum.value ? Number(r._sum.value) : null },
    }));
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getIconForAction(action: string): string {
    const iconMap: Record<string, string> = {
      CREATE: 'add_circle',
      QUALIFY: 'check_circle',
      CONVERT: 'swap_horiz',
      UPDATE: 'edit',
      DELETE: 'delete',
      'lead.created': 'person_add',
      'lead.qualified': 'check_circle',
      'lead.converted': 'swap_horiz',
      'opportunity.created': 'handshake',
      'opportunity.won': 'celebration',
      'contact.created': 'contacts',
      'task.completed': 'task_alt',
    };

    return iconMap[action] || 'event';
  }

  private getDescriptionForAction(action: string, metadata: unknown): string {
    try {
      const data =
        typeof metadata === 'string'
          ? JSON.parse(metadata)
          : (metadata as Record<string, unknown>) || {};

      switch (action) {
        case 'CREATE':
          return `New ${data.resourceType || 'item'}: ${data.name || 'Unknown'}`;
        case 'QUALIFY':
          return `Qualified: ${data.name || 'Unknown'}`;
        case 'CONVERT':
          return `Converted: ${data.name || 'Unknown'}`;
        case 'UPDATE':
          return `Updated: ${data.name || 'Unknown'}`;
        case 'lead.created':
          return `New lead: ${data.name || 'Unknown'}`;
        case 'lead.qualified':
          return `Lead qualified: ${data.name || 'Unknown'}`;
        case 'lead.converted':
          return `Lead converted to contact: ${data.name || 'Unknown'}`;
        case 'opportunity.created':
          return `New deal: ${data.name || 'Unknown'}`;
        case 'opportunity.won':
          return `Deal won: ${data.name || 'Unknown'} ($${data.value || 0})`;
        case 'contact.created':
          return `New contact: ${data.name || 'Unknown'}`;
        case 'task.completed':
          return `Task completed: ${data.title || 'Unknown'}`;
        default:
          return action;
      }
    } catch {
      return action;
    }
  }
}
