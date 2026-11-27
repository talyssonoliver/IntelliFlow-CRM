/**
 * Pound formatters for the deals revenue bar chart (recharts calls these with
 * untyped values, so they coerce first).
 */
import { formatGBP } from '@/lib/dashboard/kpi-calculator';
import { formatGBPCompact } from '@/lib/format/gbp-compact';

/** Y-axis tick: a compact pound label, e.g. 4500 -> "£5k". */
export function revenueAxisTick(value: unknown): string {
  return formatGBPCompact(Number(value));
}

/** Tooltip row: the full pound amount, labelled Revenue. Non-numbers read as £0. */
export function revenueTooltip(value: unknown): [string, string] {
  return [formatGBP(typeof value === 'number' ? value : 0), 'Revenue'];
}
