/**
 * Analytics Repository Port
 * Defines the contract for analytics/metrics data access
 * Implementation lives in adapters layer (PrismaAnalyticsRepository)
 */

// ============================================
// DEALS / OPPORTUNITIES METRICS
// ============================================

export interface MonthlyDealMetric {
  month: string; // Short month label (e.g., 'Jan', 'Feb')
  monthKey: string; // YYYY-MM format
  value: number; // Count of deals
  revenue: number; // Total revenue in dollars
}

export interface DealsWonTrendResult {
  data: MonthlyDealMetric[];
  totalDeals: number;
  totalRevenue: number;
}

// ============================================
// GROWTH METRICS
// ============================================

export type GrowthMetricType = 'revenue' | 'leads' | 'deals' | 'contacts';

export interface GrowthDataPoint {
  month: string; // Short month label
  value: number; // Normalized 0-100 scale or raw value
  rawValue?: number; // Original value before normalization
  yoyChange?: number; // Year-over-year change percentage
}

export interface GrowthTrendResult {
  data: GrowthDataPoint[];
  metric: GrowthMetricType;
}

// ============================================
// TRAFFIC / LEAD SOURCES
// ============================================

export interface TrafficSourceMetric {
  source: string; // Original source key (e.g., 'WEBSITE')
  name: string; // Display name (e.g., 'Website')
  count: number; // Number of leads
  percentage: number; // Percentage of total
  color: string; // CSS class for styling
}

// ============================================
// ACTIVITY FEED
// ============================================

export interface ActivityItem {
  id: string;
  action: string; // Audit log action type
  eventType?: string; // Specific event type
  icon: string; // Material icon name
  description: string; // Human-readable description
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

// ============================================
// LEAD STATISTICS
// ============================================

export interface LeadStats {
  total: number;
  newThisMonth: number;
  byStatus?: Record<string, number>;
  bySource?: Record<string, number>;
}

// ============================================
// RAW QUERY RESULTS (for complex aggregations)
// ============================================

export interface OpportunityGroupByResult {
  closedAt: Date | null;
  _count: number;
  _sum: {
    value: number | null;
  };
}

export interface LeadGroupByResult {
  source: string;
  _count: number;
}

export interface DateRangeQuery {
  startDate: Date;
  endDate: Date;
}

// ============================================
// IFC-190: COMPOSITE ANALYTICS TYPES
// ============================================

export type TimeSeriesGranularity = 'day' | 'week' | 'month';

export type ExtendedMetricType = GrowthMetricType | 'pipeline_value' | 'win_rate';

export type ReportType = 'sales' | 'leads' | 'funnel' | 'timeseries' | 'overview';

export interface SalesMetricsResult {
  pipelineValue: number;
  winRate: number;
  avgDealSize: number;
  avgSalesCycleDays: number | null;
  totalRevenue: number;
  closedWonCount: number;
  closedLostCount: number;
}

export interface LeadMetricsResult {
  total: number;
  bySource: Array<{ source: string; name: string; count: number; percentage: number }>;
  byStatus: Array<{ status: string; count: number; percentage: number }>;
  conversionRate: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  value: number;
  conversionFromPrevious: number | null;
}

export interface ConversionFunnelResult {
  stages: FunnelStage[];
  totalLeads: number;
  overallConversionRate: number;
}

export interface TimeSeriesPoint {
  period: string;
  periodLabel: string;
  value: number;
}

export interface OverviewResult {
  totalLeads: number;
  leadDelta: number;
  totalRevenue: number;
  revenueDelta: number;
  openOpportunities: number;
  newContacts: number;
  winRate: number;
  recentActivity: ActivityItem[];
}

export interface ExportResult {
  format: 'csv' | 'json';
  data: unknown;
  filename: string;
}

// ============================================
// REPOSITORY INTERFACE
// ============================================

export interface AnalyticsRepository {
  /**
   * Get deals won grouped by month for trend chart
   * @param tenantId - Tenant to filter by
   * @param months - Number of months to look back
   */
  getDealsWonByMonth(tenantId: string, months: number): Promise<OpportunityGroupByResult[]>;

  /**
   * Get monthly revenue from closed won opportunities
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  getMonthlyRevenue(tenantId: string, dateRange: DateRangeQuery): Promise<number>;

  /**
   * Count leads created in date range
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  countLeadsInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number>;

  /**
   * Count opportunities created in date range
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  countOpportunitiesInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number>;

  /**
   * Count contacts created in date range
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  countContactsInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number>;

  /**
   * Get leads grouped by source
   * @param tenantId - Tenant to filter by
   */
  getLeadsBySource(tenantId: string): Promise<LeadGroupByResult[]>;

  /**
   * Get recent audit log entries for activity feed
   * @param tenantId - Tenant to filter by
   * @param limit - Maximum entries to return
   * @param actions - Filter to specific actions
   */
  getRecentAuditLogs(tenantId: string, limit: number, actions?: string[]): Promise<ActivityItem[]>;

  /**
   * Count total leads for tenant
   * @param tenantId - Tenant to filter by
   */
  countTotalLeads(tenantId: string): Promise<number>;

  /**
   * Count leads created since start of current month
   * @param tenantId - Tenant to filter by
   */
  countLeadsThisMonth(tenantId: string): Promise<number>;

  // IFC-190: Sales metrics
  countClosedWonInRange(tenantId: string, dateRange: DateRangeQuery, ownerId?: string): Promise<number>;
  countClosedLostInRange(tenantId: string, dateRange: DateRangeQuery, ownerId?: string): Promise<number>;
  getPipelineValue(tenantId: string, dateRange: DateRangeQuery, ownerId?: string): Promise<number>;
  getAvgSalesCycleLength(tenantId: string, dateRange: DateRangeQuery, ownerId?: string): Promise<number | null>;
  getRevenueInRange(tenantId: string, dateRange: DateRangeQuery, ownerId?: string): Promise<number>;

  // IFC-190: Lead metrics
  getLeadsBySourceInRange(tenantId: string, dateRange: DateRangeQuery): Promise<LeadGroupByResult[]>;
  getLeadsByStatus(tenantId: string, dateRange: DateRangeQuery): Promise<Array<{ status: string; _count: number }>>;
  countConvertedLeadsInRange(tenantId: string, dateRange: DateRangeQuery): Promise<number>;

  // IFC-190: Conversion funnel
  getOpportunitiesByStageInRange(tenantId: string, dateRange: DateRangeQuery): Promise<Array<{ stage: string; _count: number; _sum: { value: number | null } }>>;
}
