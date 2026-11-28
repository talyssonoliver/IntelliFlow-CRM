import { formatMoneyCompact } from './money';

/**
 * Kept so existing imports keep working. New code uses `formatMoneyCompact`
 * with the tenant currency (`useTenantCurrency`).
 *
 *   500 -> "£500", 50_000 -> "£50k", 1_250_000 -> "£1.3M"
 */
export function formatGBPCompact(amount: number, fractionDigits = 0): string {
  return formatMoneyCompact(amount, 'GBP', fractionDigits);
}
