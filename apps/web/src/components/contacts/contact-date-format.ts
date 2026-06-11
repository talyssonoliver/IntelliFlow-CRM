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

/** Format an ISO date as a relative label ("Today", "3 days ago", or a date). */
export function formatContactRelativeTime(dateString: string, timezone: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatContactDate(dateString, timezone);
}
