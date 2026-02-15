/**
 * Churn Risk Dashboard Types (PG-143)
 *
 * Canonical response shape for the getChurnDashboard tRPC procedure.
 */

import type { ChurnRiskLevel } from '@intelliflow/domain';

export interface ChurnStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  minimal: number;
  avgEngagement: number;
}

export interface AtRiskCustomer {
  id: string;
  entityType: 'lead' | 'contact';
  entityId: string;
  entityName: string;
  riskLevel: ChurnRiskLevel;
  engagementScore: number;
  slaHours: number;
  slaDeadline: string;
  nextBestAction: string | null;
  recommendations: string[];
  lastEngagementDays: number | null;
  updatedAt: string;
}

export interface ChurnTrendPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  minimal: number;
  avgEngagement: number;
}

export interface ChurnDashboardData {
  stats: ChurnStats;
  distribution: Record<string, number>;
  atRiskCustomers: AtRiskCustomer[];
  trends: ChurnTrendPoint[];
}
