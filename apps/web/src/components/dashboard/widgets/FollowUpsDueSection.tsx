import { CardList, CardListGroup, CardListMore, CardListSection, TodoRow } from './CardListSection';
import { leadDisplayName } from '@/lib/leads/lead-format';
import {
  followUpActionText,
  followUpLastContactText,
  followUpStatus,
  type FollowUpTone,
} from '@/lib/leads/follow-ups-due';

export interface FollowUpLead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string;
  lastContactedAt: Date | string | null;
  /** The lead's owner: the follow-up is theirs (Tasks page Owner column). */
  owner?: { id: string; email: string; name: string | null } | null;
}

const toneClass: Record<FollowUpTone, string> = {
  today: 'text-amber-600 dark:text-amber-400',
  overdue: 'text-red-600 dark:text-red-400',
};

/**
 * "Follow-ups due" on the dashboard's Upcoming Tasks card (MVP-010) and the Tasks page: the contacted leads that are
 * due or overdue for a follow-up, each linking to the lead page where the owner acts, and a link
 * to the full "Needs Follow-up" view when there are more than the card lists.
 * #46 (21/11): the leads come newest due first; a summary line says what is due today, and the
 * list splits into "Due today" and "Overdue" when it holds both.
 */
/** "3 due today · 108 overdue" or "Nothing new due today · 111 overdue, most recent first". */
export function followUpSummary(total: number, dueToday: number, lowerBound = false): string {
  const overdue = total - dueToday;
  if (dueToday === 0) return `Nothing new due today · ${total} overdue, most recent first`;
  const today = `${dueToday}${lowerBound ? '+' : ''} due today`;
  return overdue > 0 && !lowerBound ? `${today} · ${overdue} overdue` : today;
}

/** "Due today · last contacted 20 Nov" or "Never contacted": the meta line of a follow-up row. */
export function followUpDetail(lead: FollowUpLead, now: Date): string {
  const { label } = followUpStatus(lead.lastContactedAt, now);
  if (!lead.lastContactedAt) return label;
  const last = followUpLastContactText(lead.lastContactedAt);
  return `${label} · ${last.charAt(0).toLowerCase()}${last.slice(1)}`;
}

export function FollowUpsDueSection({
  leads,
  total,
  dueToday,
  dueTodayIsLowerBound = false,
  now = new Date(),
  onDone,
  pendingLeadId,
}: Readonly<{
  leads: readonly FollowUpLead[];
  total: number;
  /** The row's checkbox: the follow-up is done (a note is logged on the lead). */
  onDone: (leadId: string) => void;
  pendingLeadId?: string | undefined;
  /** Due today among the leads read (newest due first); omit to show no summary line. */
  dueToday?: number;
  dueTodayIsLowerBound?: boolean;
  now?: Date;
}>) {
  if (leads.length === 0) return null;
  const more = total - leads.length;
  const rows = leads.map((lead) => ({ lead, status: followUpStatus(lead.lastContactedAt, now) }));
  const todayRows = rows.filter((r) => r.status.tone === 'today');
  const overdueRows = rows.filter((r) => r.status.tone !== 'today');
  // Group headings only when the list holds both kinds; one kind needs no heading.
  const groups =
    todayRows.length > 0 && overdueRows.length > 0
      ? [
          { key: 'today', title: 'Today', rows: todayRows },
          { key: 'overdue', title: 'Overdue', rows: overdueRows },
        ]
      : [{ key: 'all', title: null, rows }];
  return (
    <CardListSection
      label="Follow-ups due"
      testId="follow-ups-due"
      caption={
        dueToday === undefined ? (
          `${total} ${total === 1 ? 'follow-up' : 'follow-ups'} due`
        ) : (
          <span data-testid="follow-ups-summary">
            {followUpSummary(total, dueToday, dueTodayIsLowerBound)}
          </span>
        )
      }
      footer={
        more > 0 ? (
          <CardListMore href="/leads?segment=followup">
            See all leads needing a <span className="whitespace-nowrap">follow-up</span>
          </CardListMore>
        ) : null
      }
    >
      {groups.map((group) => (
        <CardListGroup key={group.key} title={group.title}>
          <CardList label={group.title ?? undefined}>
            {group.rows.map(({ lead, status }) => (
              <TodoRow
                key={lead.id}
                href={`/leads/${lead.id}`}
                title={followUpActionText(leadDisplayName(lead))}
                kind="Follow-up"
                detail={followUpDetail(lead, now)}
                detailClassName={toneClass[status.tone]}
                doneLabel={`Mark done: ${followUpActionText(leadDisplayName(lead))}`}
                onDone={() => onDone(lead.id)}
                pending={pendingLeadId === lead.id}
              />
            ))}
          </CardList>
        </CardListGroup>
      ))}
    </CardListSection>
  );
}
