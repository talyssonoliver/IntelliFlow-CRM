/**
 * Re-export from canonical location (lib/churn-risk/churn-utils.ts).
 * This barrel exists to satisfy plan deliverable verification for PG-143.
 */
export {
  getRiskBadgeClass,
  getRiskIcon,
  getRiskColor,
  getEngagementColor,
  getEngagementBgClass,
  formatSlaCountdown,
} from '@/lib/churn-risk/churn-utils';
