'use client';

import { FollowUpsDueSection } from '@/components/dashboard/widgets/FollowUpsDueSection';
import { useFollowUpsDue } from '@/components/dashboard/widgets/useFollowUpsDue';

/** How many due follow-ups the Tasks page lists; the rest are counted and linked. */
export const TASKS_PAGE_FOLLOW_UP_LIMIT = 25;

/**
 * The follow-ups due on the Tasks page. A follow-up is derived from a lead (it is not a stored
 * task), so the Tasks list alone said "No tasks found" while the dashboard counted them. This reads
 * the same hook as the dashboard card, so the "Follow-ups due (N)" count is the same number.
 */
export function FollowUpsDueTasks() {
  const { leads, total } = useFollowUpsDue(TASKS_PAGE_FOLLOW_UP_LIMIT);
  return <FollowUpsDueSection leads={leads} total={total} />;
}
