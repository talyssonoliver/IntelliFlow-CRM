// IFC-256: shared date formatters for the Contact 360 view.
//
// Extracted from the route page (`contacts/[id]/page.tsx`) into a unit-tested
// module: Next.js route page.tsx files are excluded from the merged coverage
// report, so logic kept inline there is counted as uncovered by SonarCloud's
// new-code gate. Keeping these here keeps them covered and lets the contact-tab
// components format dates without the page threading formatter callbacks down.

/** Format an ISO date as a short display date, e.g. "9 Jan 2025". */
export function formatContactDate(dateString: string, timezone: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
}

/** Whole-day index (days since the epoch) for `date`'s calendar day in `timezone`. */
function calendarDayIndex(date: Date, timezone: string): number {
  // en-CA renders an ISO-like "YYYY-MM-DD" in the target timezone; parsing it as
  // UTC midnight yields a stable, DST-safe day index for calendar-day math.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

/** Format an ISO date as a relative label ("Today", "3 days ago", or a date). */
export function formatContactRelativeTime(dateString: string, timezone: string): string {
  // Compare calendar days *in the supplied timezone* so a date near local
  // midnight is not mislabeled (e.g. 23:30 "yesterday" viewed at 00:30 "today").
  const diffDays =
    calendarDayIndex(new Date(), timezone) - calendarDayIndex(new Date(dateString), timezone);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatContactDate(dateString, timezone);
}
