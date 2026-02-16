/**
 * Deal Pipeline Types & Utilities (PG-135)
 *
 * Shared interfaces, utility functions, and stage config for deal components.
 * Extracted from apps/web/src/app/deals/(list)/page.tsx.
 */

import { OPPORTUNITY_STAGES, type OpportunityStage } from '@intelliflow/domain';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Deal {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly stage: OpportunityStage;
  readonly probability: number;
  readonly expectedCloseDate: string | null;
  readonly accountName: string;
  readonly contactName: string | null;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly createdAt: string;
}

export interface PipelineStats {
  readonly totalDeals: number;
  readonly totalValue: number;
  readonly weightedValue: number;
  readonly wonValue: number;
}

export interface DealFiltersValue {
  readonly ownerId?: string;
  readonly dateRange?: 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'custom';
  readonly dateFrom?: Date;
  readonly dateTo?: Date;
  readonly stages?: OpportunityStage[];
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly search?: string;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/** Format currency with full value (e.g., $125,000) */
export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format currency in compact form (e.g., $125K, $1.2M) */
export function formatCurrencyCompact(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

// ─── Stage Display Config ────────────────────────────────────────────────────
// Uses OPPORTUNITY_STAGES from domain as single source of truth (AC-32).
// CSS variables defined in globals.css (Step 3.3).

export const PIPELINE_STAGE_CONFIG: Record<OpportunityStage, { label: string; color: string }> = {
  PROSPECTING: { label: 'Prospecting', color: 'hsl(var(--muted-foreground))' },
  QUALIFICATION: { label: 'Qualification', color: 'hsl(var(--stage-qualification))' },
  NEEDS_ANALYSIS: { label: 'Needs Analysis', color: 'hsl(var(--stage-needs-analysis))' },
  PROPOSAL: { label: 'Proposal', color: 'hsl(var(--stage-proposal))' },
  NEGOTIATION: { label: 'Negotiation', color: 'hsl(var(--stage-negotiation))' },
  CLOSED_WON: { label: 'Closed Won', color: 'hsl(var(--stage-won))' },
  CLOSED_LOST: { label: 'Closed Lost', color: 'hsl(var(--stage-lost))' },
};

/** All opportunity stages re-exported for convenience */
export { OPPORTUNITY_STAGES };
export type { OpportunityStage };

// ─── Data Transformation Helpers ─────────────────────────────────────────────

/** Map tRPC opportunity.list response items to Deal[] */
export function transformDeals(
  data: { opportunities?: Array<Record<string, unknown>> } | undefined
): Deal[] {
  if (!data?.opportunities) return [];
  return data.opportunities.map((item) => ({
    id: item.id as string,
    name: item.name as string,
    value: Number(item.value) || 0,
    stage: item.stage as OpportunityStage,
    probability: (item.probability as number) ?? 0,
    expectedCloseDate: item.expectedCloseDate?.toString() ?? null,
    accountName: (item.account as Record<string, string>)?.name ?? 'Unknown Account',
    contactName: item.contact
      ? `${(item.contact as Record<string, string>).firstName} ${(item.contact as Record<string, string>).lastName}`
      : null,
    ownerId: (item.ownerId as string) ?? '',
    ownerName:
      (item.owner as Record<string, string>)?.name ??
      (item.owner as Record<string, string>)?.email ??
      'Unknown',
    createdAt: item.createdAt?.toString() ?? new Date().toISOString(),
  }));
}

/** Compute pipeline stats from deal array */
export function calculateStats(deals: Deal[]): PipelineStats {
  const activeDeals = deals.filter((d) => d.stage !== 'CLOSED_WON' && d.stage !== 'CLOSED_LOST');
  return {
    totalDeals: activeDeals.length,
    totalValue: activeDeals.reduce((sum, d) => sum + d.value, 0),
    weightedValue: activeDeals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0),
    wonValue: deals.filter((d) => d.stage === 'CLOSED_WON').reduce((sum, d) => sum + d.value, 0),
  };
}
