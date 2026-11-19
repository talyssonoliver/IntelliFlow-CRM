import Link from 'next/link';
import { waitingLabel, waitingTone } from '@/lib/leads/waiting-for-reply';

export interface WaitingPerson {
  kind: 'lead' | 'contact';
  id: string;
  name: string;
  company: string | null;
  since: Date | string;
  subject: string;
}

const toneClass = {
  normal: 'text-slate-500 dark:text-slate-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
} as const;

/**
 * "Waiting for reply" on the dashboard's Upcoming Tasks card (MVP-014): people whose last email to
 * us has had no reply, oldest first, each linking to their page. Replying removes them. The link
 * to the Leads list filter carries no number, so the card total (leads and contacts) is never
 * set against a different count.
 */
export function WaitingForReplySection({
  people,
  total,
  now = new Date(),
}: Readonly<{ people: readonly WaitingPerson[]; total: number; now?: Date }>) {
  if (people.length === 0) return null;
  const more = total - people.length;
  return (
    <section aria-label="Waiting for reply" data-testid="waiting-for-reply" className="space-y-1">
      <h4 className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Waiting for reply ({total})
      </h4>
      <ul className="space-y-1">
        {people.map((p) => (
          <li key={`${p.kind}:${p.id}`}>
            <Link
              href={p.kind === 'lead' ? `/leads/${p.id}` : `/contacts/${p.id}`}
              className="block rounded-lg p-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                {p.name}
                {p.company ? ` · ${p.company}` : ''}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{p.subject}</p>
              <p className={`mt-1 text-xs ${toneClass[waitingTone(p.since, now)]}`}>
                {waitingLabel(p.since, now)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link
          href="/leads?segment=waiting"
          className="block px-3 pt-1 text-xs text-ds-primary hover:underline"
        >
          See leads waiting for a reply
        </Link>
      )}
    </section>
  );
}
