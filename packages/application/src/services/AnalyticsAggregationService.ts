/**
 * Analytics Aggregation Service
 *
 * Application-layer service that provides aggregated analytics and metrics
 * for dashboard widgets and export pipelines. Uses the AnalyticsRepository
 * port (hexagonal architecture) — zero infrastructure imports.
 *
 * Migrated from apps/api/src/services/AnalyticsService.ts (IFC-200)
 * with bug fixes: N+1 queries, broken normalization, YoY off-by-one.
 */

import type {
  AnalyticsRepository,
  GrowthMetricType,
  GrowthDataPoint,
  ActivityItem,
  DateRangeQuery,
  ExtendedMetricType,
  TimeSeriesGranularity,
  ReportType,
  SalesMetricsResult,
  LeadMetricsResult,
  ConversionFunnelResult,
  FunnelStage,
  TimeSeriesPoint,
  OverviewResult,
  ExportResult,
} from '../ports/repositories/AnalyticsRepositoryPort';

import { OPPORTUNITY_STAGES } from '@intelliflow/domain';

/** Funnel stage ordering derived from domain OPPORTUNITY_STAGES */
const FUNNEL_STAGE_ORDER = [...OPPORTUNITY_STAGES];

/** Human-readable labels for funnel stages */
const FUNNEL_STAGE_LABELS: Record<string, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

/** Source color mapping for traffic source chart */
const SOURCE_COLORS: Record<string, string> = {
  WEBSITE: 'bg-ds-primary',
  REFERRAL: 'bg-emerald-500',
  SOCIAL: 'bg-violet-500',
  EMAIL: 'bg-amber-500',
  COLD_CALL: 'bg-blue-500',
  EVENT: 'bg-pink-500',
  OTHER: 'bg-gray-500',
};

/** Icon mapping for audit log actions */
const ACTION_ICONS: Record<string, string> = {
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

export class AnalyticsAggregationService {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  /** UTC start of month — avoids server-local Date constructor (ADR-044) */
  private static utcStartOfMonth(year: number, month: number): Date {
    return new Date(Date.UTC(year, month, 1));
  }

  /** UTC end of month (last millisecond) */
  private static utcEndOfMonth(year: number, month: number): Date {
    return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  }

  /** UTC month key "YYYY-MM" from a Date */
  private static utcMonthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** UTC short month label (e.g. "Mar") */
  private static utcMonthLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  }

  /**
   * Get deals won trend for the last N months.
   * Groups raw repository results by YYYY-MM month key, fills missing months with zeros.
   */
  async getDealsWonTrend(
    tenantId: string,
    months: number = 6
  ): Promise<Array<{ month: string; value: number; revenue: number }>> {
    const opportunities = await this.analyticsRepository.getDealsWonByMonth(tenantId, months);

    // Group by month key
    const monthlyData = new Map<string, { count: number; revenue: number }>();

    for (const opp of opportunities) {
      if (!opp.closedAt) continue;

      const date = new Date(opp.closedAt);
      const monthKey = AnalyticsAggregationService.utcMonthKey(date);

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
      date.setUTCMonth(date.getUTCMonth() - i);

      const monthKey = AnalyticsAggregationService.utcMonthKey(date);
      const monthLabel = AnalyticsAggregationService.utcMonthLabel(date);

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
   * Get growth trends for a specific metric.
   * Uses Promise.all for parallel monthly queries (AC-006).
   * Returns raw values without broken normalization (AC-007).
   * Correctly calculates YoY change (fixed off-by-one).
   */
  async getGrowthTrend(
    tenantId: string,
    metric: GrowthMetricType,
    months: number = 12
  ): Promise<GrowthDataPoint[]> {
    const now = new Date();

    // Build date ranges for all months
    const monthRanges: Array<{ label: string; range: DateRangeQuery }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setUTCMonth(date.getUTCMonth() - i);

      const startOfMonth = AnalyticsAggregationService.utcStartOfMonth(
        date.getUTCFullYear(),
        date.getUTCMonth()
      );
      const endOfMonth = AnalyticsAggregationService.utcEndOfMonth(
        date.getUTCFullYear(),
        date.getUTCMonth()
      );

      monthRanges.push({
        label: AnalyticsAggregationService.utcMonthLabel(date),
        range: { startDate: startOfMonth, endDate: endOfMonth },
      });
    }

    // Execute all queries in parallel (AC-006 — fixes N+1)
    const values = await Promise.all(
      monthRanges.map(({ range }) => this.getMetricValue(tenantId, metric, range))
    );

    // Build result with raw values (AC-007 — no broken normalization)
    const result: GrowthDataPoint[] = monthRanges.map(({ label }, index) => ({
      month: label,
      value: values[index],
      rawValue: values[index],
    }));

    // Calculate YoY change for the latest month (fixed off-by-one)
    if (result.length >= 12) {
      const latest = result.at(-1);
      const yearAgo = result.at(-12); // Correct index: 12 months back
      if (latest && yearAgo && yearAgo.value > 0) {
        latest.yoyChange =
          Math.round(((latest.value - yearAgo.value) / yearAgo.value) * 100 * 10) / 10;
      } else if (latest) {
        latest.yoyChange = 0;
      }
    }

    return result;
  }

  /**
   * Get traffic source distribution with percentages and colors.
   * Formats source names to title case, assigns CSS color classes.
   */
  async getTrafficSources(
    tenantId: string
  ): Promise<Array<{ name: string; percentage: number; color: string }>> {
    const leadsBySource = await this.analyticsRepository.getLeadsBySource(tenantId);

    const total = leadsBySource.reduce((sum, item) => sum + item._count, 0);

    if (total === 0) {
      return [];
    }

    return leadsBySource
      .map((item) => ({
        name: this.formatSourceName(item.source),
        percentage: Math.round((item._count / total) * 100),
        color: SOURCE_COLORS[item.source] || 'bg-gray-500',
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Get recent activity feed with icons and descriptions.
   */
  async getRecentActivity(tenantId: string, limit: number = 10): Promise<ActivityItem[]> {
    return this.analyticsRepository.getRecentAuditLogs(tenantId, limit, [
      'CREATE',
      'QUALIFY',
      'CONVERT',
      'UPDATE',
    ]);
  }

  /**
   * Get lead statistics (total + new this month).
   * Calls both repository methods in parallel.
   */
  async getLeadStats(tenantId: string): Promise<{ total: number; newThisMonth: number }> {
    const [total, newThisMonth] = await Promise.all([
      this.analyticsRepository.countTotalLeads(tenantId),
      this.analyticsRepository.countLeadsThisMonth(tenantId),
    ]);

    return { total, newThisMonth };
  }

  /**
   * Export aggregated metrics for selected metric types in a date range.
   * Returns raw values for export accuracy (no normalization).
   */
  async exportMetrics(
    tenantId: string,
    dateRange: DateRangeQuery,
    metrics: GrowthMetricType[]
  ): Promise<Array<{ month: string; metric: string; value: number }>> {
    // Build monthly date ranges within the given range
    const monthRanges = this.getMonthRangesInDateRange(dateRange);

    const results: Array<{ month: string; metric: string; value: number }> = [];

    // For each metric, query all months in parallel
    for (const metric of metrics) {
      const values = await Promise.all(
        monthRanges.map(({ range }) => this.getMetricValue(tenantId, metric, range))
      );

      for (let i = 0; i < monthRanges.length; i++) {
        results.push({
          month: monthRanges[i].label,
          metric,
          value: values[i],
        });
      }
    }

    return results;
  }

  /**
   * Export conversion funnel data for a date range.
   * Returns leads → opportunities → closedWon pipeline with conversion rates.
   */
  async exportConversionFunnel(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<{
    leads: number;
    opportunities: number;
    closedWon: number;
    conversionRate: number;
  }> {
    const [leads, opportunities] = await Promise.all([
      this.analyticsRepository.countLeadsInRange(tenantId, dateRange),
      this.analyticsRepository.countOpportunitiesInRange(tenantId, dateRange),
    ]);

    // Count closed-won opportunities via the deals won trend method.
    const dealsWon = await this.analyticsRepository.getDealsWonByMonth(
      tenantId,
      this.monthsDiff(dateRange.startDate, dateRange.endDate) + 1
    );
    const closedWonCount = dealsWon.reduce((sum, d) => sum + d._count, 0);

    const conversionRate = leads > 0 ? Math.round((closedWonCount / leads) * 100 * 10) / 10 : 0;

    return {
      leads,
      opportunities,
      closedWon: closedWonCount,
      conversionRate,
    };
  }

  // ============================================
  // IFC-190: Composite Analytics Endpoints
  // ============================================

  /**
   * Dashboard overview with 8 parallel queries.
   * Returns composite metrics: leads, revenue, opps, contacts, winRate, activity.
   */
  async getOverview(tenantId: string, dateRange?: DateRangeQuery): Promise<OverviewResult> {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const currentMonthStart = AnalyticsAggregationService.utcStartOfMonth(y, m);
    const currentMonthEnd = AnalyticsAggregationService.utcEndOfMonth(y, m);
    const prevMonthStart = AnalyticsAggregationService.utcStartOfMonth(y, m - 1);
    const prevMonthEnd = AnalyticsAggregationService.utcEndOfMonth(y, m - 1);

    const range = dateRange || { startDate: currentMonthStart, endDate: currentMonthEnd };
    const prevRange = { startDate: prevMonthStart, endDate: prevMonthEnd };

    const [
      totalLeads,
      prevLeads,
      totalRevenue,
      prevRevenue,
      openOpportunities,
      prevOpenOpportunities,
      newContacts,
      prevNewContacts,
      closedWon,
      closedLost,
      prevClosedWon,
      prevClosedLost,
      recentActivity,
    ] = await Promise.all([
      this.analyticsRepository.countLeadsInRange(tenantId, range),
      this.analyticsRepository.countLeadsInRange(tenantId, prevRange),
      this.analyticsRepository.getRevenueInRange(tenantId, range),
      this.analyticsRepository.getRevenueInRange(tenantId, prevRange),
      this.analyticsRepository.countOpportunitiesInRange(tenantId, range),
      this.analyticsRepository.countOpportunitiesInRange(tenantId, prevRange),
      this.analyticsRepository.countContactsInRange(tenantId, range),
      this.analyticsRepository.countContactsInRange(tenantId, prevRange),
      this.analyticsRepository.countClosedWonInRange(tenantId, range),
      this.analyticsRepository.countClosedLostInRange(tenantId, range),
      this.analyticsRepository.countClosedWonInRange(tenantId, prevRange),
      this.analyticsRepository.countClosedLostInRange(tenantId, prevRange),
      this.analyticsRepository.getRecentAuditLogs(tenantId, 5),
    ]);

    const totalDeals = closedWon + closedLost;
    const winRate = totalDeals > 0 ? Math.round((closedWon / totalDeals) * 100 * 10) / 10 : 0;

    const prevTotalDeals = prevClosedWon + prevClosedLost;
    const prevWinRate =
      prevTotalDeals > 0 ? Math.round((prevClosedWon / prevTotalDeals) * 100 * 10) / 10 : 0;

    return {
      totalLeads,
      leadDelta: totalLeads - prevLeads,
      totalRevenue,
      revenueDelta: totalRevenue - prevRevenue,
      openOpportunities,
      openOpportunitiesDelta: openOpportunities - prevOpenOpportunities,
      newContacts,
      newContactsDelta: newContacts - prevNewContacts,
      winRate,
      winRateDelta: Math.round((winRate - prevWinRate) * 10) / 10,
      recentActivity,
    };
  }

  /**
   * Sales KPIs with 5 parallel queries.
   * Returns pipeline value, win rate, avg deal size, avg cycle, revenue, counts.
   */
  async getSalesMetrics(
    tenantId: string,
    dateRange: DateRangeQuery,
    ownerId?: string
  ): Promise<SalesMetricsResult> {
    const [pipelineValue, closedWon, closedLost, avgSalesCycleDays, totalRevenue] =
      await Promise.all([
        this.analyticsRepository.getPipelineValue(tenantId, dateRange, ownerId),
        this.analyticsRepository.countClosedWonInRange(tenantId, dateRange, ownerId),
        this.analyticsRepository.countClosedLostInRange(tenantId, dateRange, ownerId),
        this.analyticsRepository.getAvgSalesCycleLength(tenantId, dateRange, ownerId),
        this.analyticsRepository.getRevenueInRange(tenantId, dateRange, ownerId),
      ]);

    const totalDeals = closedWon + closedLost;
    const winRate = totalDeals > 0 ? Math.round((closedWon / totalDeals) * 100 * 10) / 10 : 0;
    const avgDealSize = closedWon > 0 ? Math.round(totalRevenue / closedWon) : 0;

    return {
      pipelineValue,
      winRate,
      avgDealSize,
      avgSalesCycleDays,
      totalRevenue,
      closedWonCount: closedWon,
      closedLostCount: closedLost,
    };
  }

  /**
   * Lead pipeline metrics with 4 parallel queries.
   * Returns total, by source, by status, conversion rate.
   */
  async getLeadMetrics(tenantId: string, dateRange: DateRangeQuery): Promise<LeadMetricsResult> {
    const [total, bySourceRaw, byStatusRaw, converted] = await Promise.all([
      this.analyticsRepository.countLeadsInRange(tenantId, dateRange),
      this.analyticsRepository.getLeadsBySourceInRange(tenantId, dateRange),
      this.analyticsRepository.getLeadsByStatus(tenantId, dateRange),
      this.analyticsRepository.countConvertedLeadsInRange(tenantId, dateRange),
    ]);

    const bySource = bySourceRaw.map((s) => ({
      source: s.source,
      name: this.formatSourceName(s.source),
      count: s._count,
      percentage: total > 0 ? Math.round((s._count / total) * 100 * 10) / 10 : 0,
    }));

    const byStatus = byStatusRaw.map((s) => ({
      status: s.status,
      count: s._count,
      percentage: total > 0 ? Math.round((s._count / total) * 100 * 10) / 10 : 0,
    }));

    const conversionRate = total > 0 ? Math.round((converted / total) * 100 * 10) / 10 : 0;

    return { total, bySource, byStatus, conversionRate };
  }

  /**
   * Full 7-stage conversion funnel.
   * Zero-fills all stages from OPPORTUNITY_STAGES domain constant.
   */
  async getConversionFunnel(
    tenantId: string,
    dateRange: DateRangeQuery,
    includeLeads?: boolean
  ): Promise<ConversionFunnelResult> {
    const [stageData, totalLeads] = await Promise.all([
      this.analyticsRepository.getOpportunitiesByStageInRange(tenantId, dateRange),
      includeLeads === false
        ? Promise.resolve(0)
        : this.analyticsRepository.countLeadsInRange(tenantId, dateRange),
    ]);

    const stageMap = new Map(stageData.map((s) => [s.stage, s]));

    const stages: FunnelStage[] = FUNNEL_STAGE_ORDER.map((stage, index) => {
      const data = stageMap.get(stage);
      const count = data?._count ?? 0;
      const value = data?._sum.value ? Number(data._sum.value) : 0;

      let conversionFromPrevious: number | null = null;
      if (index > 0) {
        const prevData = stageMap.get(FUNNEL_STAGE_ORDER[index - 1]);
        const prevCount = prevData?._count ?? 0;
        conversionFromPrevious =
          prevCount > 0 ? Math.round((count / prevCount) * 100 * 10) / 10 : 0;
      }

      return {
        stage,
        label: FUNNEL_STAGE_LABELS[stage] || stage,
        count,
        value,
        conversionFromPrevious,
      };
    });

    const firstStageCount = stages[0]?.count ?? 0;
    const closedWonStage = stages.find((s) => s.stage === 'CLOSED_WON');
    const overallConversionRate =
      firstStageCount > 0 && closedWonStage
        ? Math.round((closedWonStage.count / firstStageCount) * 100 * 10) / 10
        : 0;

    return { stages, totalLeads, overallConversionRate };
  }

  /**
   * Parametric time series data.
   * Generates date buckets per granularity, queries each in parallel.
   */
  async getTimeSeriesData(
    tenantId: string,
    metric: ExtendedMetricType,
    dateRange: DateRangeQuery,
    granularity: TimeSeriesGranularity = 'month',
    ownerId?: string
  ): Promise<TimeSeriesPoint[]> {
    const buckets = this.getDateBuckets(dateRange, granularity);

    const values = await Promise.all(
      buckets.map(({ range }) => this.getExtendedMetricValue(tenantId, metric, range, ownerId))
    );

    return buckets.map(({ label, range }, index) => ({
      period: range.startDate.toISOString().slice(0, 10),
      periodLabel: label,
      value: values[index],
    }));
  }

  /**
   * Unified report export.
   * Routes to appropriate method based on reportType, serializes as CSV or JSON.
   */
  async exportReport(
    tenantId: string,
    reportType: ReportType,
    dateRange: DateRangeQuery,
    format: 'csv' | 'json',
    options?: {
      metrics?: ExtendedMetricType[];
      granularity?: TimeSeriesGranularity;
      ownerId?: string;
    }
  ): Promise<ExportResult> {
    let data: unknown;

    switch (reportType) {
      case 'sales':
        data = await this.getSalesMetrics(tenantId, dateRange, options?.ownerId);
        break;
      case 'leads':
        data = await this.getLeadMetrics(tenantId, dateRange);
        break;
      case 'funnel':
        data = await this.getConversionFunnel(tenantId, dateRange);
        break;
      case 'timeseries':
        data = await this.getTimeSeriesData(
          tenantId,
          options?.metrics?.[0] || 'revenue',
          dateRange,
          options?.granularity || 'month',
          options?.ownerId
        );
        break;
      case 'overview':
        data = await this.getOverview(tenantId, dateRange);
        break;
    }

    const startStr = dateRange.startDate.toISOString().slice(0, 10);
    const endStr = dateRange.endDate.toISOString().slice(0, 10);
    const filename = `intelliflow-${reportType}-${startStr}-${endStr}.${format}`;

    if (format === 'csv') {
      return { format: 'csv', data: this.serializeToCSV(data), filename };
    }

    return { format: 'json', data, filename };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async getMetricValue(
    tenantId: string,
    metric: GrowthMetricType,
    range: DateRangeQuery
  ): Promise<number> {
    switch (metric) {
      case 'revenue':
        return this.analyticsRepository.getMonthlyRevenue(tenantId, range);
      case 'leads':
        return this.analyticsRepository.countLeadsInRange(tenantId, range);
      case 'deals':
        return this.analyticsRepository.countOpportunitiesInRange(tenantId, range);
      case 'contacts':
        return this.analyticsRepository.countContactsInRange(tenantId, range);
    }
  }

  private formatSourceName(source: string): string {
    return source
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private getMonthRangesInDateRange(
    dateRange: DateRangeQuery
  ): Array<{ label: string; range: DateRangeQuery }> {
    const ranges: Array<{ label: string; range: DateRangeQuery }> = [];
    const current = new Date(dateRange.startDate);

    while (current <= dateRange.endDate) {
      const startOfMonth = AnalyticsAggregationService.utcStartOfMonth(
        current.getUTCFullYear(),
        current.getUTCMonth()
      );
      const endOfMonth = AnalyticsAggregationService.utcEndOfMonth(
        current.getUTCFullYear(),
        current.getUTCMonth()
      );

      // Clamp to actual date range
      const effectiveStart = new Date(
        Math.max(startOfMonth.getTime(), dateRange.startDate.getTime())
      );
      const effectiveEnd = new Date(Math.min(endOfMonth.getTime(), dateRange.endDate.getTime()));

      const label = current.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });

      ranges.push({
        label,
        range: { startDate: effectiveStart, endDate: effectiveEnd },
      });

      // Move to next month
      current.setUTCMonth(current.getUTCMonth() + 1);
      current.setUTCDate(1);
    }

    return ranges;
  }

  private monthsDiff(start: Date, end: Date): number {
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  }

  private getDateBuckets(
    dateRange: DateRangeQuery,
    granularity: TimeSeriesGranularity
  ): Array<{ label: string; range: DateRangeQuery }> {
    const buckets: Array<{ label: string; range: DateRangeQuery }> = [];
    const current = new Date(dateRange.startDate);

    while (current <= dateRange.endDate) {
      let bucketEnd: Date;
      let label: string;

      switch (granularity) {
        case 'day': {
          bucketEnd = new Date(
            Date.UTC(
              current.getUTCFullYear(),
              current.getUTCMonth(),
              current.getUTCDate(),
              23,
              59,
              59,
              999
            )
          );
          label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          break;
        }
        case 'week': {
          bucketEnd = new Date(current);
          bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 6);
          bucketEnd.setUTCHours(23, 59, 59, 999);
          label = `Week of ${current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
          break;
        }
        case 'month':
        default: {
          bucketEnd = new Date(
            Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0, 23, 59, 59, 999)
          );
          label = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
          break;
        }
      }

      const effectiveEnd = bucketEnd > dateRange.endDate ? dateRange.endDate : bucketEnd;

      buckets.push({
        label,
        range: { startDate: new Date(current), endDate: effectiveEnd },
      });

      switch (granularity) {
        case 'day':
          current.setUTCDate(current.getUTCDate() + 1);
          break;
        case 'week':
          current.setUTCDate(current.getUTCDate() + 7);
          break;
        case 'month':
          current.setUTCMonth(current.getUTCMonth() + 1);
          current.setUTCDate(1);
          break;
      }
    }

    return buckets;
  }

  private async getExtendedMetricValue(
    tenantId: string,
    metric: ExtendedMetricType,
    range: DateRangeQuery,
    ownerId?: string
  ): Promise<number> {
    switch (metric) {
      case 'pipeline_value':
        return this.analyticsRepository.getPipelineValue(tenantId, range, ownerId);
      case 'win_rate': {
        const [won, lost] = await Promise.all([
          this.analyticsRepository.countClosedWonInRange(tenantId, range, ownerId),
          this.analyticsRepository.countClosedLostInRange(tenantId, range, ownerId),
        ]);
        const total = won + lost;
        return total > 0 ? Math.round((won / total) * 100 * 10) / 10 : 0;
      }
      default:
        return this.getMetricValue(tenantId, metric, range);
    }
  }

  private serializeToCSV(data: unknown): string {
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      const flat = data.map((item) => this.flattenObject(item));
      const headers = Object.keys(flat[0]);
      const rows = flat.map((row) =>
        headers.map((h) => (row[h] as string | null | undefined) ?? '').join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }

    if (typeof data === 'object' && data !== null) {
      const flat = this.flattenObject(data as Record<string, unknown>);
      const headers = Object.keys(flat);
      const values = headers.map((h) => (flat[h] as string | null | undefined) ?? '');
      return [headers.join(','), values.join(',')].join('\n');
    }

    return (data as string | null | undefined) ?? '';
  }

  private flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        Object.assign(result, this.flattenObject(value as Record<string, unknown>, fullKey));
      } else if (Array.isArray(value)) {
        result[fullKey] = JSON.stringify(value);
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }
}
