import { CardList, CardListMore, CardListSection, TodoRow } from './CardListSection';
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

/** "waiting 4 days · Re: unsubscribe": the meta line of a reply row. */
export function waitingDetail(p: WaitingPerson, now: Date): string {
  const label = waitingLabel(p.since, now);
  const subject = p.subject.trim();
  if (!subject) return label;
  const reLine = /^re:/i.test(subject) ? subject : 'Re: ' + subject;
  return `${label} · ${reLine}`;
}

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
  onDone,
  pendingKey,
}: Readonly<{
  people: readonly WaitingPerson[];
  total: number;
  leadTotal: number;
  now?: Date;
  /** The row's checkbox: handled without a reply (hidden until a newer email arrives). */
  onDone: (person: WaitingPerson) => void;
  pendingKey?: string | undefined;
}>) {
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
          <TodoRow
            key={`${p.kind}:${p.id}`}
            href={p.kind === 'lead' ? `/leads/${p.id}` : `/contacts/${p.id}`}
            title={
              <>
                {p.name}
                {p.company && !isSameName(p.company, p.name) ? ` · ${p.company}` : ''}
              </>
            }
            kind="Reply"
            detail={waitingDetail(p, now)}
            detailClassName={toneClass[waitingTone(p.since, now)]}
            doneLabel={`Mark done, handled without a reply: ${p.name}`}
            onDone={() => onDone(p)}
            pending={pendingKey === `${p.kind}:${p.id}`}
          />
        ))}
      </CardList>
    </CardListSection>
  );
}
