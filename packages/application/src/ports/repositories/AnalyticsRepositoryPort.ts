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
// REPOSITORY INTERFACE
// ============================================

export interface AnalyticsRepository {
  /**
   * Get deals won grouped by month for trend chart
   * @param tenantId - Tenant to filter by
   * @param months - Number of months to look back
   */
  getDealsWonByMonth(
    tenantId: string,
    months: number
  ): Promise<OpportunityGroupByResult[]>;

  /**
   * Get monthly revenue from closed won opportunities
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  getMonthlyRevenue(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number>;

  /**
   * Count leads created in date range
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  countLeadsInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number>;

  /**
   * Count opportunities created in date range
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  countOpportunitiesInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number>;

  /**
   * Count contacts created in date range
   * @param tenantId - Tenant to filter by
   * @param dateRange - Date range to query
   */
  countContactsInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number>;

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
  getRecentAuditLogs(
    tenantId: string,
    limit: number,
    actions?: string[]
  ): Promise<ActivityItem[]>;

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
}
