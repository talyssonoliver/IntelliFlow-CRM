// Canonical enum values for Lead Activity types - single source of truth
// These values match the database enum created in the initial migration
export const LEAD_ACTIVITY_TYPES = [
  'WEB_FORM',
  'EMAIL',
  'CALL',
  'MEETING',
  'NOTE',
  'SCORE_UPDATE',
  'STATUS_CHANGE',
  'QUALIFICATION',
] as const;

// Derive type from const array
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];
