import type {
  AnalyticsRepository,
  OpportunityGroupByResult,
  LeadGroupByResult,
  DateRangeQuery,
  ActivityItem,
} from '@intelliflow/application';

/**
 * In-Memory Analytics Repository
 * Used for testing and development without database dependency
 *
 * This repository stores raw data that can be seeded for tests,
 * then provides the same aggregation results as the Prisma implementation.
 */
export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  // Raw data stores for seeding
  private opportunities: OpportunityData[] = [];
  private leads: LeadData[] = [];
  private contacts: ContactData[] = [];
  private auditLogs: AuditLogData[] = [];

  /**
   * Get deals won grouped by month for trend chart
   */
  async getDealsWonByMonth(
    tenantId: string,
    months: number
  ): Promise<OpportunityGroupByResult[]> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    // Filter closed-won opportunities in date range
    const filtered = this.opportunities.filter(
      (opp) =>
        opp.tenantId === tenantId &&
        opp.stage === 'CLOSED_WON' &&
        opp.closedAt &&
        opp.closedAt >= cutoff
    );

    // Group by closedAt date
    const grouped = new Map<string, { count: number; value: number }>();

    for (const opp of filtered) {
      if (!opp.closedAt) continue;
      const key = opp.closedAt.toISOString();
      const existing = grouped.get(key) || { count: 0, value: 0 };
      grouped.set(key, {
        count: existing.count + 1,
        value: existing.value + (opp.value ?? 0),
      });
    }

    // Convert to result format
    return Array.from(grouped.entries()).map(([dateStr, data]) => ({
      closedAt: new Date(dateStr),
      _count: data.count,
      _sum: { value: data.value },
    }));
  }

  /**
   * Get monthly revenue from closed won opportunities
   */
  async getMonthlyRevenue(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number> {
    return this.opportunities
      .filter(
        (opp) =>
          opp.tenantId === tenantId &&
          opp.stage === 'CLOSED_WON' &&
          opp.closedAt &&
          opp.closedAt >= dateRange.startDate &&
          opp.closedAt <= dateRange.endDate
      )
      .reduce((sum, opp) => sum + (opp.value ?? 0), 0);
  }

  /**
   * Count leads created in date range
   */
  async countLeadsInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number> {
    return this.leads.filter(
      (lead) =>
        lead.tenantId === tenantId &&
        lead.createdAt >= dateRange.startDate &&
        lead.createdAt <= dateRange.endDate
    ).length;
  }

  /**
   * Count opportunities created in date range
   */
  async countOpportunitiesInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number> {
    return this.opportunities.filter(
      (opp) =>
        opp.tenantId === tenantId &&
        opp.createdAt >= dateRange.startDate &&
        opp.createdAt <= dateRange.endDate
    ).length;
  }

  /**
   * Count contacts created in date range
   */
  async countContactsInRange(
    tenantId: string,
    dateRange: DateRangeQuery
  ): Promise<number> {
    return this.contacts.filter(
      (contact) =>
        contact.tenantId === tenantId &&
        contact.createdAt >= dateRange.startDate &&
        contact.createdAt <= dateRange.endDate
    ).length;
  }

  /**
   * Get leads grouped by source
   */
  async getLeadsBySource(tenantId: string): Promise<LeadGroupByResult[]> {
    const counts = new Map<string, number>();

    for (const lead of this.leads) {
      if (lead.tenantId !== tenantId) continue;
      const current = counts.get(lead.source) ?? 0;
      counts.set(lead.source, current + 1);
    }

    return Array.from(counts.entries()).map(([source, count]) => ({
      source,
      _count: count,
    }));
  }

  /**
   * Get recent audit log entries for activity feed
   */
  async getRecentAuditLogs(
    tenantId: string,
    limit: number,
    actions?: string[]
  ): Promise<ActivityItem[]> {
    let logs = this.auditLogs.filter((log) => log.tenantId === tenantId);

    if (actions && actions.length > 0) {
      logs = logs.filter((log) => actions.includes(log.action));
    }

    // Sort by timestamp descending
    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    logs = logs.slice(0, limit);

    // Map to ActivityItem
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      eventType: log.eventType,
      icon: this.getIconForAction(log.action),
      description: this.getDescriptionForAction(log.action, log.metadata),
      createdAt: log.timestamp,
      metadata: log.metadata,
    }));
  }

  /**
   * Count total leads for tenant
   */
  async countTotalLeads(tenantId: string): Promise<number> {
    return this.leads.filter((lead) => lead.tenantId === tenantId).length;
  }

  /**
   * Count leads created since start of current month
   */
  async countLeadsThisMonth(tenantId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.leads.filter(
      (lead) =>
        lead.tenantId === tenantId &&
        lead.createdAt >= startOfMonth
    ).length;
  }

  // ============================================
  // TEST HELPER METHODS
  // ============================================

  /**
   * Clear all data
   */
  clear(): void {
    this.opportunities = [];
    this.leads = [];
    this.contacts = [];
    this.auditLogs = [];
  }

  /**
   * Seed opportunity data (for testing)
   */
  seedOpportunity(data: OpportunityData): void {
    this.opportunities.push(data);
  }

  /**
   * Seed multiple opportunities (for testing)
   */
  seedOpportunities(data: OpportunityData[]): void {
    this.opportunities.push(...data);
  }

  /**
   * Seed lead data (for testing)
   */
  seedLead(data: LeadData): void {
    this.leads.push(data);
  }

  /**
   * Seed multiple leads (for testing)
   */
  seedLeads(data: LeadData[]): void {
    this.leads.push(...data);
  }

  /**
   * Seed contact data (for testing)
   */
  seedContact(data: ContactData): void {
    this.contacts.push(data);
  }

  /**
   * Seed multiple contacts (for testing)
   */
  seedContacts(data: ContactData[]): void {
    this.contacts.push(...data);
  }

  /**
   * Seed audit log data (for testing)
   */
  seedAuditLog(data: AuditLogData): void {
    this.auditLogs.push(data);
  }

  /**
   * Seed multiple audit logs (for testing)
   */
  seedAuditLogs(data: AuditLogData[]): void {
    this.auditLogs.push(...data);
  }

  /**
   * Get all opportunities (for test assertions)
   */
  getAllOpportunities(): OpportunityData[] {
    return [...this.opportunities];
  }

  /**
   * Get all leads (for test assertions)
   */
  getAllLeads(): LeadData[] {
    return [...this.leads];
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

  private getDescriptionForAction(
    action: string,
    metadata?: Record<string, unknown>
  ): string {
    const data = metadata || {};

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
  }
}

// ============================================
// DATA TYPES FOR SEEDING
// ============================================

export interface OpportunityData {
  id: string;
  tenantId: string;
  stage: string;
  value: number | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface LeadData {
  id: string;
  tenantId: string;
  source: string;
  createdAt: Date;
}

export interface ContactData {
  id: string;
  tenantId: string;
  createdAt: Date;
}

export interface AuditLogData {
  id: string;
  tenantId: string;
  action: string;
  eventType?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
