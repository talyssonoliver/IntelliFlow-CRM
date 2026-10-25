'use client';

/**
 * Processing-restriction banner for a lead or contact (PG-203 DSAR, owner ruling Q18;
 * spec sign-off 3 and the R4 objection wording).
 *
 * Asks the server by record id (the email is resolved there, so staff cannot probe
 * addresses) and gets booleans and a date back. Shows nothing while loading, on an error, or
 * when the person is not restricted.
 */
import { trpc } from '@/lib/trpc';

function sinceLabel(iso: string | null): string {
  if (!iso) return '';
  return ` since ${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))}`;
}

export function RestrictionBanner({
  entity,
  id,
}: Readonly<{ entity: 'lead' | 'contact'; id: string }>) {
  const query = trpc.privacy.restrictionFor.useQuery(
    { entity, id },
    { enabled: Boolean(id), retry: false, staleTime: 60_000 }
  );
  const status = query.data;
  if (!status?.restricted) return null;
  const title = status.blocksMarketing
    ? 'Do not send marketing (data request)'
    : 'Processing restricted (data request)';
  return (
    <div
      role="note"
      aria-label="Processing restriction"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="material-symbols-outlined text-xl" aria-hidden="true">
        block
      </span>
      <div className="text-sm">
        <p className="font-semibold">{`${title}${sinceLabel(status.since)}`}</p>
        <p>
          AI scoring, AI drafts and AI search indexing are paused for this person. See Settings,
          Privacy requests.
        </p>
      </div>
    </div>
  );
}
