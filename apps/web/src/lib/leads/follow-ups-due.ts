/**
 * Follow-ups due on the dashboard's Upcoming Tasks card (MVP-010).
 *
 * A lead has no stored follow-up date, so one is derived with the same 7 day rule as the Leads
 * "Needs Follow-up" view: a contacted lead is due a follow-up 7 days after its last contact, and a
 * lead that was never actually contacted is due now. The card counts whole UTC days, as the tasks
 * next to it do, where that view uses a rolling 7 x 24 hours, so a lead contacted late on a day
 * shows on the card as "Due today" a few hours before the view lists it.
 */

const DAY_MS = 86_400_000;

/** Days after the last contact that a follow-up is due. Same as the "Needs Follow-up" lead view. */
export const FOLLOW_UP_AFTER_DAYS = 7;

/** How many follow-ups the card lists; the rest are counted. */
export const FOLLOW_UP_CARD_LIMIT = 3;

function utcDay(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/**
 * Leads last contacted at or before this instant are due or overdue (the `lastContactedBefore`
 * filter of lead.list, which also includes leads never contacted). It only changes at UTC
 * midnight, so it is safe inside a query key.
 */
export function followUpCutoff(now: Date): Date {
  return new Date((utcDay(now) - FOLLOW_UP_AFTER_DAYS + 1) * DAY_MS - 1);
}

export type FollowUpTone = 'today' | 'overdue';

export interface FollowUpStatus {
  label: string;
  tone: FollowUpTone;
}

/** What the card says about one due lead: "Due today", "Overdue by 3 days" or "Never contacted". */
export function followUpStatus(
  lastContactedAt: Date | string | null | undefined,
  now: Date
): FollowUpStatus {
  const contacted = lastContactedAt ? new Date(lastContactedAt) : null;
  if (!contacted || Number.isNaN(contacted.getTime())) {
    return { label: 'Never contacted', tone: 'overdue' };
  }
  const overdueDays = utcDay(now) - (utcDay(contacted) + FOLLOW_UP_AFTER_DAYS);
  if (overdueDays <= 0) return { label: 'Due today', tone: 'today' };
  return {
    label: `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`,
    tone: 'overdue',
  };
}
