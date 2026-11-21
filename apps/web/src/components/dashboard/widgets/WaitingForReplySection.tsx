import { CardList, CardListMore, CardListRow, CardListSection } from './CardListSection';
import { isSameName } from '@/lib/leads/lead-format';
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
  leadTotal,
  now = new Date(),
}: Readonly<{ people: readonly WaitingPerson[]; total: number; leadTotal: number; now?: Date }>) {
  if (people.length === 0) return null;
  // The list link opens the Leads list, so it only shows when leads beyond those listed wait.
  const moreLeads = leadTotal - people.filter((p) => p.kind === 'lead').length;
  return (
    <CardListSection
      label="Waiting for reply"
      caption={`${total} waiting for a reply`}
      testId="waiting-for-reply"
      footer={
        moreLeads > 0 ? (
          <CardListMore href="/leads?segment=waiting">See leads waiting for a reply</CardListMore>
        ) : null
      }
    >
      <CardList>
        {people.map((p) => (
          <CardListRow
            key={`${p.kind}:${p.id}`}
            href={p.kind === 'lead' ? `/leads/${p.id}` : `/contacts/${p.id}`}
            primary={
              <>
                {p.name}
                {p.company && !isSameName(p.company, p.name) ? ` · ${p.company}` : ''}
              </>
            }
            secondary={p.subject}
            status={waitingLabel(p.since, now)}
            statusClassName={toneClass[waitingTone(p.since, now)]}
          />
        ))}
      </CardList>
    </CardListSection>
  );
}
