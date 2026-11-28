/**
 * Pound formatters for the deals revenue bar chart (recharts calls these with
 * untyped values, so they coerce first).
 */
import { formatGBP } from '@/lib/dashboard/kpi-calculator';
import { formatMoneyCompact } from '@/lib/format/money';

/** Y-axis tick: a compact money label, e.g. 4500 -> "£5k". */
export function revenueAxisTick(value: unknown, currency = 'GBP'): string {
  return formatMoneyCompact(Number(value), currency);
}

/** Tooltip row: the full amount in the tenant currency, labelled Revenue. Non-numbers read as £0. */
export function revenueTooltip(value: unknown, currency = 'GBP'): [string, string] {
  return [formatGBP(typeof value === 'number' ? value : 0, 0, currency), 'Revenue'];
}
