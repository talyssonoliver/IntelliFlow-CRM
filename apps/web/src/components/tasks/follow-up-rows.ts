import type { FollowUpLead } from '@/components/dashboard/widgets/FollowUpsDueSection';
import { FOLLOW_UP_AFTER_DAYS } from '@/lib/leads/follow-ups-due';
import { leadDisplayName } from '@/lib/leads/lead-format';
import type { TaskListItem } from './TaskList';

const DAY_MS = 86_400_000;

/** Row ids for follow-ups, so they can never collide with a stored task's id. */
export const FOLLOW_UP_ROW_PREFIX = 'follow-up:';

/**
 * Follow-ups due as rows of the Tasks table (owner 21/11: "use the same task table that already
 * exists"). A follow-up is derived from a lead, not stored, so the row is marked `followUp`: it
 * shows like any pending task (urgent: it is due), opens the lead, and offers no complete/edit/delete.
 * Due date = last contact + 7 days (the rule the dashboard card uses); never contacted = no date.
 */
export function followUpTaskRows(leads: readonly FollowUpLead[]): TaskListItem[] {
  return leads.map((lead) => {
    const contacted = lead.lastContactedAt ? new Date(lead.lastContactedAt) : null;
    const valid = contacted && !Number.isNaN(contacted.getTime());
    const name = leadDisplayName(lead);
    return {
      id: `${FOLLOW_UP_ROW_PREFIX}${lead.id}`,
      title: `Follow up with ${name}`,
      description: valid
        ? `Last contacted ${contacted.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
        : 'Never contacted',
      dueDate: valid
        ? new Date(contacted.getTime() + FOLLOW_UP_AFTER_DAYS * DAY_MS).toISOString()
        : null,
      // Owner 21/11: a due follow-up is priority one.
      priority: 'URGENT',
      status: 'PENDING',
      ownerId: '',
      owner: { id: '', email: '', name: null },
      // The table names a lead from first + last name; the display name already covers a lead
      // that has only a company.
      lead: { id: lead.id, firstName: name, lastName: null },
      contact: null,
      opportunity: null,
      followUp: true,
    };
  });
}
