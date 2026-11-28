/**
 * A deal's expected close date is a calendar date (YYYY-MM-DD). It is formatted in UTC: read in
 * the tenant's timezone, anyone west of UTC saw the day before (codex review 26/11). An empty or
 * invalid date gives '' so each caller can say "Not set" its own way.
 */
export function formatCloseDate(
  date: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return '';
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return '';
  return day.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
}
