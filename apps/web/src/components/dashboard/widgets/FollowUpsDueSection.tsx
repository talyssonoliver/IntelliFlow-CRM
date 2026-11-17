import Link from 'next/link';
import { leadDisplayName } from '@/lib/leads/lead-format';
import { followUpStatus, type FollowUpTone } from '@/lib/leads/follow-ups-due';

export interface FollowUpLead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string;
  lastContactedAt: Date | string | null;
}

const toneClass: Record<FollowUpTone, string> = {
  today: 'text-amber-600 dark:text-amber-400',
  overdue: 'text-red-600 dark:text-red-400',
};

/**
 * "Follow-ups due" on the dashboard's Upcoming Tasks card (MVP-010): the contacted leads that are
 * due or overdue for a follow-up, each linking to the lead page where the owner acts, and a link
 * to the full "Needs Follow-up" view when there are more than the card lists.
 */
export function FollowUpsDueSection({
  leads,
  total,
  now = new Date(),
}: Readonly<{ leads: readonly FollowUpLead[]; total: number; now?: Date }>) {
  if (leads.length === 0) return null;
  const more = total - leads.length;
  return (
    <section aria-label="Follow-ups due" data-testid="follow-ups-due" className="space-y-1">
      <h4 className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Follow-ups due ({total})
      </h4>
      <ul className="space-y-1">
        {leads.map((lead) => {
          const status = followUpStatus(lead.lastContactedAt, now);
          return (
            <li key={lead.id}>
              <Link
                href={`/leads/${lead.id}`}
                className="block rounded-lg p-3 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                  Follow up with {leadDisplayName(lead)}
                </p>
                <p className={`mt-1 text-xs ${toneClass[status.tone]}`}>{status.label}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <Link
          href="/leads?segment=followup"
          className="block px-3 pt-1 text-xs text-ds-primary hover:underline"
        >
          +{more} more {more === 1 ? 'lead needs' : 'leads need'} a follow-up
        </Link>
      )}
    </section>
  );
}
