/**
 * Money text the API writes for people to read (insight lines, goal progress, search hits).
 * The CRM works in GBP, so this is the one place that puts a pound sign in front of a whole
 * amount: `12500` -> `£12,500`.
 */
export function formatPounds(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `£${safe.toLocaleString('en-GB')}`;
}
