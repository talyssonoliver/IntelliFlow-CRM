/**
 * Deal Forecast Types (PG-131)
 *
 * Shared interfaces for forecast components.
 * Risk factors and recommendations derived deterministically from domain signals.
 */

import type { OpportunityStage } from '@intelliflow/domain';

// ─── Risk Factor ────────────────────────────────────────────────────────────

export interface RiskFactor {
  readonly id: string;
  readonly factor: string;
  readonly severity: 'high' | 'medium' | 'low';
  readonly description: string;
  readonly impact: string;
}

// ─── Recommendation ─────────────────────────────────────────────────────────

export interface Recommendation {
  readonly id: string;
  readonly action: string;
  readonly title: string;
  readonly description: string;
  readonly priority: 'high' | 'medium' | 'low';
}

// ─── History Point ──────────────────────────────────────────────────────────

export interface HistoryPoint {
  readonly date: string;
  readonly probability: number;
  readonly event?: string;
  readonly isProjected?: boolean;
}

// ─── Forecast Mode ──────────────────────────────────────────────────────────

export type ForecastMode = 'portfolio' | 'deal';

// ─── Deal Forecast Response ─────────────────────────────────────────────────

export interface DealForecastResponse {
  readonly deal: {
    readonly id: string;
    readonly name: string;
    readonly stage: OpportunityStage;
    readonly probability: number;
    readonly value: number;
    readonly expectedCloseDate: string | null;
    readonly owner: { readonly name: string; readonly avatar: string };
    readonly account: { readonly name: string } | null;
    readonly contact: { readonly name: string; readonly title: string } | null;
  };
  readonly riskFactors: readonly RiskFactor[];
  readonly recommendations: readonly Recommendation[];
  readonly history: readonly HistoryPoint[];
  readonly confidence: number;
  readonly lastActivityAt: string | null;
  readonly stageDefault: number;
}

// ─── Re-exports from deals/types ────────────────────────────────────────────

export {
  formatCurrencyFull,
  formatCurrencyCompact,
  PIPELINE_STAGE_CONFIG,
  STAGE_PROBABILITIES,
} from '../types';
export type { OpportunityStage } from '@intelliflow/domain';
