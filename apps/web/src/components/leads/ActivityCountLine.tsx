import { activityCountLabel } from '@/lib/leads/activity-feed';

/**
 * The line above a lead's activity timeline (MVP-005): "Showing 3 of 8 activities", or a plain
 * sentence when only system updates exist (or, with a search or person filter on, when none
 * match), and nothing when there is no activity at all.
 */
export function ActivityCountLine({
  shown,
  total,
  system,
  filtered = false,
}: Readonly<{ shown: number; total: number; system: number; filtered?: boolean }>) {
  const label = activityCountLabel(shown, total, system, filtered);
  if (!label) return null;
  return (
    <p className="mb-4 text-sm text-slate-500" data-testid="activity-count-line">
      {label}
    </p>
  );
}
