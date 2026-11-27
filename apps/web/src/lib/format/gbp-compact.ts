/**
 * The one compact pound formatter. The CRM works in GBP (UI-017), so every
 * place that shows a short money label (pipeline totals, charts, leads) uses
 * this, never a local `$` template. The amount is in whole pounds.
 *
 *   500 -> "£500", 50_000 -> "£50k", 1_250_000 -> "£1.3M"
 */
export function formatGBPCompact(amount: number, fractionDigits = 0): string {
  // Round first, so 999.5 reads "£1k" rather than "£1000".
  const whole = Math.round(amount);
  const abs = Math.abs(whole);
  const million = () => `£${(whole / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return million();
  if (abs >= 1_000) {
    const k = Number((whole / 1_000).toFixed(fractionDigits));
    // 999.5k would print "1000k": it is a million.
    if (Math.abs(k) >= 1_000) return million();
    return `£${k}k`;
  }
  return `£${whole}`;
}
