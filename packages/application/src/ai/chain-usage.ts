/**
 * Usage of each chain type for one tenant, for the AI Chains page (chainVersion.getUsageStats).
 *
 * Recorded: the ai-worker writes one chain_runs row per run since this was deployed, so
 * countedSince is the later of the window start and the tenant's first recorded run.
 * Derived: until a type has recorded runs, a type may show counts read from rows that already
 * exist (for SCORING, the "Lead Scored by AI" lead activities), labelled as such. Only runs and
 * lastRunAt are known then; the rest stays empty rather than estimated.
 */

import { CHAIN_TYPES, type ChainType } from '@intelliflow/domain';

export interface ChainUsageStats {
  runs: number;
  lastRunAt: Date | null;
  /** 0..1, null when there are no recorded runs. */
  successRate: number | null;
  avgLatencyMs: number | null;
  spend: { amount: number; currency: 'USD' } | null;
  inputTokens: number;
  outputTokens: number;
  countedSince: Date;
  source: 'recorded' | 'derived' | 'none';
  derivedFrom: string | null;
}

/** Aggregates of one chain type's recorded runs inside the window. */
export interface RecordedChainUsage {
  runs: number;
  successes: number;
  firstRunAt: Date | null;
  lastRunAt: Date | null;
  avgLatencyMs: number | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

/** Counts read from existing rows for a chain type with no recorded runs. */
export interface DerivedChainUsage {
  runs: number;
  lastRunAt: Date | null;
  derivedFrom: string;
}

export interface ChainUsageSources {
  /** Recorded runs per chain type since `since` (types with none may be absent). */
  recorded(since: Date): Promise<Partial<Record<ChainType, RecordedChainUsage>>>;
  /** Existing-row counts for a type since `since`, or null when the type has no such source. */
  derived(chainType: ChainType, since: Date): Promise<DerivedChainUsage | null>;
}

export const DEFAULT_USAGE_DAYS = 30;

function emptyStats(countedSince: Date): ChainUsageStats {
  return {
    runs: 0,
    lastRunAt: null,
    successRate: null,
    avgLatencyMs: null,
    spend: null,
    inputTokens: 0,
    outputTokens: 0,
    countedSince,
    source: 'none',
    derivedFrom: null,
  };
}

/** Every chain type's usage over the last `days` days, ending at `now`. */
export async function describeChainUsage(
  sources: ChainUsageSources,
  days: number = DEFAULT_USAGE_DAYS,
  now: Date = new Date()
): Promise<Record<ChainType, ChainUsageStats>> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const recorded = await sources.recorded(since);

  const entries = await Promise.all(
    CHAIN_TYPES.map(async (type): Promise<[ChainType, ChainUsageStats]> => {
      const r = recorded[type];
      if (r && r.runs > 0) {
        const firstRunAt = r.firstRunAt ?? since;
        return [
          type,
          {
            runs: r.runs,
            lastRunAt: r.lastRunAt,
            successRate: r.successes / r.runs,
            avgLatencyMs: r.avgLatencyMs === null ? null : Math.round(r.avgLatencyMs),
            spend: { amount: r.costUsd, currency: 'USD' },
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            countedSince: firstRunAt > since ? firstRunAt : since,
            source: 'recorded',
            derivedFrom: null,
          },
        ];
      }
      const d = await sources.derived(type, since);
      if (d && d.runs > 0) {
        return [
          type,
          {
            ...emptyStats(since),
            runs: d.runs,
            lastRunAt: d.lastRunAt,
            source: 'derived',
            derivedFrom: d.derivedFrom,
          },
        ];
      }
      return [type, emptyStats(since)];
    })
  );
  return Object.fromEntries(entries) as Record<ChainType, ChainUsageStats>;
}
