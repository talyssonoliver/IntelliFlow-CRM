/**
 * Pipeline Summary card data (MVP-009). Until the workspace has open deals the card shows
 * the lead funnel by status, from the same lead.stats the Total Leads card reads, so it
 * never shows a column of "£0 (0 Deals)" rows.
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
  /** Bar width, 0-100, relative to the largest step so the busiest step fills the bar. */
  percent: number;
}

/** True when at least one open pipeline stage holds a deal. */
export function hasOpenDeals(stages: ReadonlyArray<{ count: number }> | undefined): boolean {
  return (stages ?? []).some((stage) => stage.count > 0);
}

/** The lead funnel rows from lead.stats' byStatus counts (missing statuses count as 0). */
export function leadFunnelRows(
  byStatus: Readonly<Record<string, number>> | undefined
): FunnelRow[] {
  const counts = LEAD_FUNNEL.map((step) => byStatus?.[step.status] ?? 0);
  const largest = Math.max(0, ...counts);
  return LEAD_FUNNEL.map((step, i) => ({
    ...step,
    count: counts[i],
    percent: largest > 0 ? Math.round((counts[i] / largest) * 100) : 0,
  }));
}

/** "1 lead" / "3 leads". */
export function leadCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'lead' : 'leads'}`;
}
