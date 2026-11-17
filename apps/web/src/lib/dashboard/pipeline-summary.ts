/**
 * Pipeline Summary card data (MVP-009): one funnel with two parts, always both shown. First where
 * the workspace's leads stand (from the same lead.stats the Total Leads card reads), then its
 * deals by stage as they are created. The leads part always adds up to the workspace's lead total:
 * leads that left the funnel (lost, unqualified) are counted on their own line rather than
 * dropped, so the card never disagrees with the Total Leads card beside it.
 */

/** The lead statuses a lead moves through on its way to a deal, in order. */
export const LEAD_FUNNEL: ReadonlyArray<{ status: string; label: string }> = [
  { status: 'NEW', label: 'New' },
  { status: 'CONTACTED', label: 'Contacted' },
  { status: 'QUALIFIED', label: 'Qualified' },
  { status: 'NEGOTIATING', label: 'Negotiating' },
  { status: 'CONVERTED', label: 'Converted' },
];

export interface FunnelRow {
  status: string;
  label: string;
  count: number;
  /** Bar width, 0-100, relative to the largest row so the busiest one fills the bar. */
  percent: number;
}

export interface LeadFunnel {
  /** Every funnel step in order, counting a missing status as 0. */
  rows: FunnelRow[];
  /** Leads outside the funnel (lost, unqualified): total minus the funnel steps. */
  other: FunnelRow | null;
  /** All the workspace's leads: what the Total Leads card shows. */
  total: number;
}

export interface LeadStatsLike {
  total?: number;
  byStatus?: Readonly<Record<string, number>>;
}

/** True when at least one open pipeline stage holds a deal. */
export function hasOpenDeals(stages: ReadonlyArray<{ count: number }> | undefined): boolean {
  return (stages ?? []).some((stage) => stage.count > 0);
}

/**
 * The leads part of the funnel from lead.stats. Bars share one scale (the busiest row, "other"
 * included) and the rows plus "other" always sum to `total`. Without a `total` it is the sum of
 * every status, so an older response still reconciles.
 */
export function leadFunnel(stats: LeadStatsLike | undefined): LeadFunnel {
  const byStatus = stats?.byStatus ?? {};
  const counts = LEAD_FUNNEL.map((step) => byStatus[step.status] ?? 0);
  const inFunnel = counts.reduce((sum, n) => sum + n, 0);
  const allStatuses = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const total = Math.max(stats?.total ?? allStatuses, inFunnel);
  const otherCount = total - inFunnel;
  const largest = Math.max(0, otherCount, ...counts);
  const percent = (n: number) => (largest > 0 ? Math.round((n / largest) * 100) : 0);
  return {
    rows: LEAD_FUNNEL.map((step, i) => ({
      ...step,
      count: counts[i],
      percent: percent(counts[i]),
    })),
    other:
      otherCount > 0
        ? {
            status: 'OTHER',
            label: 'Lost or unqualified',
            count: otherCount,
            percent: percent(otherCount),
          }
        : null,
    total,
  };
}

/** "1 lead" / "3 leads". */
export function leadCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'lead' : 'leads'}`;
}
