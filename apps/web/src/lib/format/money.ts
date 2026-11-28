/**
 * Tenant money formatting. Aurora has ONE real tenant currency, chosen in
 * Analytics -> Report settings. Amounts are plain numbers with no currency of
 * their own; the tenant currency is the currency they are in. No conversion.
 */

/** The symbol for a currency code ("£", "$", "€", "¥"), or "CODE " when Intl cannot name it. */
export function currencySymbol(currency: string = 'GBP'): string {
  try {
    const parts = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === 'currency')?.value;
    if (symbol) return symbol;
  } catch {
    // unknown or malformed code: fall through
  }
  return `${currency} `;
}

/**
 * Compact money label in the given currency. The amount is in whole units.
 *
 *   500 -> "£500", 50_000 -> "£50k", 1_250_000 -> "£1.3M"
 */
export function formatMoneyCompact(
  amount: number,
  currency: string = 'GBP',
  fractionDigits = 0
): string {
  const symbol = currencySymbol(currency);
  // Round first, so 999.5 reads "£1k" rather than "£1000".
  const whole = Math.round(amount);
  const abs = Math.abs(whole);
  const million = () => `${symbol}${(whole / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return million();
  if (abs >= 1_000) {
    const k = Number((whole / 1_000).toFixed(fractionDigits));
    // 999.5k would print "1000k": it is a million.
    if (Math.abs(k) >= 1_000) return million();
    return `${symbol}${k}k`;
  }
  return `${symbol}${whole}`;
}

export interface FormatMoneyOptions {
  readonly fractionDigits?: number;
}

/** Full en-GB currency string, e.g. "£125,000" or "$125,000". No fractional digits by default. */
export function formatMoney(
  amount: number,
  currency: string = 'GBP',
  options: FormatMoneyOptions = {}
): string {
  const digits = options.fractionDigits ?? 0;
  const base = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  };
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...base,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat('en-GB', base).format(amount)}`;
  }
}
