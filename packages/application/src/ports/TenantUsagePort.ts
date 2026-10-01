/**
 * Tenant Usage Port (ADR-070)
 *
 * Read-model of what a tenant is using versus its plan. Feeds the partner
 * `getUsage` endpoint (the Portal's upsell widget). `limit: null` means "no
 * limit enforced" (quota enforcement is a separate concern).
 */

export interface UsageQuota {
  used: number;
  limit: number | null;
}

export interface MeasuredUsageQuota extends UsageQuota {
  /** false when the counter is not wired yet (`used` is then a placeholder, not a measurement). */
  measured: boolean;
}

export interface TenantUsage {
  tenantId: string;
  plan: string;
  modules: string[];
  quotas: {
    contacts: UsageQuota;
    seats: UsageQuota;
    emailsPerMonth: MeasuredUsageQuota;
    aiSpendCentsPerMonth: MeasuredUsageQuota;
  };
  /** ISO-8601 timestamp of when the usage was read. */
  asOf: string;
}

export interface TenantUsagePort {
  getUsage(tenantId: string): Promise<TenantUsage>;
}
