/**
 * Money inside the text we send to the AI model. The CRM works in GBP, so the model is shown
 * pounds (`£12,500`) and writes pounds back to the user, never dollars.
 */
export function formatPounds(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `£${safe.toLocaleString('en-GB')}`;
}
