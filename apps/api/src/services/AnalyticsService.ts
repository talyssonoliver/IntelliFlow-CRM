// eslint-disable-next-line no-restricted-imports -- Analytics service uses Prisma directly for read-only aggregations
import type { PrismaClient } from '@intelliflow/db';

/**
 * Analytics Service
 *
 * Provides aggregated analytics and metrics for dashboard widgets:
 * - Deals won trends
 * - Growth metrics (revenue, leads, deals, contacts)
 * - Traffic source distribution
 * - Recent activity feed
 */
export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get deals won trend for the last N months
   */
  async getDealsWonTrend(tenantId: string, months: number = 6) {
    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - months);

    const opportunities = await this.prisma.opportunity.groupBy({
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

    // Group by month
    const monthlyData = new Map<string, { count: number; revenue: number }>();

    for (const opp of opportunities) {
      if (!opp.closedAt) continue;

      const date = new Date(opp.closedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = monthlyData.get(monthKey) || { count: 0, revenue: 0 };
      monthlyData.set(monthKey, {
        count: existing.count + opp._count,
        revenue: existing.revenue + Number(opp._sum.value ?? 0),
      });
    }

    // Fill in missing months with zeros
    const result: Array<{ month: string; value: number; revenue: number }> = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });

      const data = monthlyData.get(monthKey) || { count: 0, revenue: 0 };

      result.push({
        month: monthLabel,
        value: data.count,
        revenue: data.revenue,
      });
    }

    return result;
  }

  /**
   * Get growth trends for a specific metric
   */
  async getGrowthTrend(
    tenantId: string,
    metric: 'revenue' | 'leads' | 'deals' | 'contacts',
    months: number = 12
  ) {
    const result: Array<{ month: string; value: number; yoyChange?: number }> = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);

      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthLabel = date.toLocaleDateString('en-US', { month: 'short' });

      let value = 0;
      let revenueData;

      switch (metric) {
        case 'revenue':
          revenueData = await this.prisma.opportunity.aggregate({
            where: {
              tenantId,
              stage: 'CLOSED_WON',
              closedAt: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
            _sum: {
              value: true,
            },
          });
          value = Number(revenueData._sum.value ?? 0);
          break;

        case 'leads':
          value = await this.prisma.lead.count({
            where: {
              tenantId,
              createdAt: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
          });
          break;

        case 'deals':
          value = await this.prisma.opportunity.count({
            where: {
              tenantId,
              createdAt: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
          });
          break;

        case 'contacts':
          value = await this.prisma.contact.count({
            where: {
              tenantId,
              createdAt: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
          });
          break;
      }

      // Normalize to 0-100 scale for display
      result.push({
        month: monthLabel,
        value: Math.min(100, Math.round((value / 100) * 100)), // Simplified normalization
      });
    }

    // Calculate YoY change for the latest month if we have data from a year ago
    if (result.length >= 12) {
      const latest = result.at(-1)!;
      const yearAgo = result.at(-13) || result.at(0)!;
      const yoyChange = yearAgo.value > 0
        ? Math.round(((latest.value - yearAgo.value) / yearAgo.value) * 100 * 10) / 10
        : 0;
      latest.yoyChange = yoyChange;
    }

    return result;
  }

  /**
   * Get traffic source distribution (lead sources)
   */
  async getTrafficSources(tenantId: string) {
    const leadsBySource = await this.prisma.lead.groupBy({
      by: ['source'],
      where: {
        tenantId,
      },
      _count: true,
    });

    const total = leadsBySource.reduce((sum: number, item: any) => sum + item._count, 0);

    if (total === 0) {
      return [];
    }

    // Map source to color
    const sourceColors: Record<string, string> = {
      WEBSITE: 'bg-ds-primary',
      REFERRAL: 'bg-emerald-500',
      SOCIAL: 'bg-violet-500',
      EMAIL: 'bg-amber-500',
      COLD_CALL: 'bg-blue-500',
      EVENT: 'bg-pink-500',
      OTHER: 'bg-gray-500',
    };

    return leadsBySource
      .map((item: any) => ({
        name: item.source.charAt(0) + item.source.slice(1).toLowerCase().replace('_', ' '),
        percentage: Math.round((item._count / total) * 100),
        color: sourceColors[item.source] || 'bg-gray-500',
      }))
      .sort((a: any, b: any) => b.percentage - a.percentage);
  }

  /**
   * Get recent activity feed
   */
  async getRecentActivity(tenantId: string, limit: number = 10) {
    // Get recent activities from AuditLogEntry
    const activities = await this.prisma.auditLogEntry.findMany({
      where: {
        tenantId,
        action: {
          in: [
            'CREATE',
            'QUALIFY',
            'CONVERT',
            'UPDATE',
          ],
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });

    // Map to activity format
    return activities.map((activity: any) => ({
      id: activity.id,
      icon: this.getIconForAction(activity.action),
      description: this.getDescriptionForAction(activity.action, activity.metadata),
      createdAt: activity.timestamp,
    }));
  }

  /**
   * Get icon for activity type
   */
  private getIconForAction(action: string): string {
    const iconMap: Record<string, string> = {
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

  /**
   * Get human-readable description for activity
   */
  private getDescriptionForAction(action: string, metadata: any): string {
    try {
      const data = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

      switch (action) {
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
    } catch (error) {
      console.error('[AnalyticsService] Failed to parse activity metadata:', error);
      return action;
    }
  }

  /**
   * Get lead statistics for dashboard widget
   */
  async getLeadStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, newThisMonth] = await Promise.all([
      this.prisma.lead.count({
        where: {
          tenantId,
        },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          createdAt: {
            gte: startOfMonth,
          },
        },
      }),
    ]);

    return {
      total,
      newThisMonth,
    };
  }
}
