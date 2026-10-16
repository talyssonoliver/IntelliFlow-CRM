/**
 * Case task read order (PG-204). Tasks seeded from a case type's resolution
 * checklist carry `position` (0..n-1) and no due date, so position decides their
 * order; tasks added by hand have no position and keep their due-date order
 * after the checklist steps.
 */
export const CASE_TASK_ORDER = [
  { position: { sort: 'asc' as const, nulls: 'last' as const } },
  { dueDate: 'asc' as const },
];
