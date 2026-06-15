/**
 * Deal Pipeline Types & Utilities (PG-135)
 *
 * Shared interfaces, utility functions, and stage config for deal components.
 * Extracted from apps/web/src/app/deals/(list)/page.tsx.
 */

import { type OpportunityStage } from '@intelliflow/domain';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@intelliflow/api-client';

// ─── Inferred API Boundary Types (F-19) ──────────────────────────────────────
// Typed against the real tRPC output instead of Record<string, unknown> casts.

/** Inferred output of the `opportunity.list` tRPC procedure. */
export type OpportunityListResult = inferRouterOutputs<AppRouter>['opportunity']['list'];

/** A single opportunity row as returned by `opportunity.list`. */
export type OpportunityListItem = OpportunityListResult['opportunities'][number];

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

export interface TrashedDeal extends Deal {
  /** ISO datetime string when the deal was soft-deleted */
  readonly deletedAt: string;
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
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
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

/**
 * Default probability for each stage — matches domain Opportunity.getDefaultProbabilityForStage()
 * Used for optimistic updates during drag-drop stage changes (IFC-064 AC-010).
 */
export const STAGE_PROBABILITIES: Record<OpportunityStage, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

/** All opportunity stages re-exported for convenience */
export { OPPORTUNITY_STAGES } from '@intelliflow/domain';
export type { OpportunityStage } from '@intelliflow/domain';

// ─── Data Transformation Helpers ─────────────────────────────────────────────

/**
 * Map tRPC `opportunity.list` response items to `Deal[]` (F-19).
 *
 * Typed against the inferred router output instead of `Record<string, unknown>`.
 * Runtime expressions are preserved: with the default JSON serializer (no
 * superjson) `value` (Prisma Decimal) arrives as a string → `Number(...)`, and
 * the date fields arrive as ISO strings → `.toString()`.
 */
export function transformDeals(data: OpportunityListResult | undefined): Deal[] {
  if (!data?.opportunities) return [];
  return data.opportunities.map((item) => ({
    id: item.id,
    name: item.name,
    value: Number(item.value) || 0,
    stage: item.stage as OpportunityStage,
    probability: item.probability ?? 0,
    expectedCloseDate: item.expectedCloseDate?.toString() ?? null,
    accountName: item.account?.name ?? 'Unknown Account',
    contactName: item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : null,
    ownerId: item.ownerId ?? '',
    ownerName: item.owner?.name ?? item.owner?.email ?? 'Unknown',
    createdAt: item.createdAt?.toString() ?? new Date().toISOString(),
  }));
}

// ─── Filter → Query Input Mapping (F-10) ─────────────────────────────────────

/** The subset of `opportunity.list` input derived from the deal filter bar. */
export interface OpportunityListFilterInput {
  ownerId?: string;
  stage?: OpportunityStage[];
  minValue?: number;
  maxValue?: number;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/** End-of-day helper so a range's upper bound is inclusive. */
function endOfDay(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 23, 59, 59, 999);
}

/**
 * Convert a relative `dateRange` selection into absolute `{dateFrom, dateTo}`
 * bounds (filtering deals by `expectedCloseDate`). `now` is injectable for
 * deterministic tests. `custom` supplies explicit bounds for the `custom` range.
 */
export function dateRangeToBounds(
  range: DealFiltersValue['dateRange'],
  custom?: { dateFrom?: Date; dateTo?: Date },
  now: Date = new Date()
): { dateFrom?: Date; dateTo?: Date } {
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (range) {
    case 'this_week': {
      const dayOfWeek = now.getDay(); // 0 = Sunday
      const diffToMonday = (dayOfWeek + 6) % 7;
      const start = new Date(year, month, now.getDate() - diffToMonday);
      const end = endOfDay(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { dateFrom: start, dateTo: end };
    }
    case 'this_month':
      return { dateFrom: new Date(year, month, 1), dateTo: endOfDay(year, month + 1, 0) };
    case 'this_quarter': {
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        dateFrom: new Date(year, quarterStart, 1),
        dateTo: endOfDay(year, quarterStart + 3, 0),
      };
    }
    case 'this_year':
      return { dateFrom: new Date(year, 0, 1), dateTo: endOfDay(year, 11, 31) };
    case 'custom':
      return { dateFrom: custom?.dateFrom, dateTo: custom?.dateTo };
    default:
      return {};
  }
}

/**
 * Build the `opportunity.list` filter input from the deal filter bar state
 * (F-10). Empty / blank values are omitted so they don't constrain the query.
 */
export function buildOpportunityListInput(
  filters: DealFiltersValue,
  now: Date = new Date()
): OpportunityListFilterInput {
  const { dateFrom, dateTo } = dateRangeToBounds(
    filters.dateRange,
    { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
    now
  );
  const search = filters.search?.trim();
  return {
    ownerId: filters.ownerId || undefined,
    stage: filters.stages && filters.stages.length > 0 ? filters.stages : undefined,
    minValue: filters.minValue,
    maxValue: filters.maxValue,
    search: search || undefined,
    dateFrom,
    dateTo,
  };
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
