import { activityCountLabel } from '@/lib/leads/activity-feed';

/**
 * The line above a lead's activity timeline (MVP-005): "Showing 3 of 8 activities", or a plain
 * sentence when only system updates exist, and nothing when there is no activity at all.
 */
export function ActivityCountLine({
  shown,
  total,
  system,
}: Readonly<{ shown: number; total: number; system: number }>) {
  const label = activityCountLabel(shown, total, system);
  if (!label) return null;
  return (
    <p className="mb-4 text-sm text-slate-500" data-testid="activity-count-line">
      {label}
    </p>
  );
}
