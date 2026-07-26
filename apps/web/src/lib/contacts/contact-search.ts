/**
 * Contacts List — search / sort / filter query construction
 *
 * Pure helpers extracted from `ContactsPageClient.tsx` so the query shape sent
 * to the `contact.list` tRPC procedure is centralized, typed, and unit-testable
 * in isolation (no React / tRPC imports). Behavior is 1:1 with the previous
 * inline logic.
 *
 * PG-064 (Contacts List). Search/segments back onto the existing
 * `contactQuerySchema` accepted by `apps/api/src/modules/contact/contact.router.ts`.
 */

import { CONTACT_STATUSES } from '@intelliflow/domain';

/** UI sort dropdown values. */
export type ContactSortValue = 'newest' | 'oldest' | 'name';

/** Columns the `contact.list` procedure accepts for ordering. */
export type ContactSortBy =
  | 'createdAt'
  | 'updatedAt'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'status'
  | 'company'
  | 'department'
  | 'lastContactedAt';

export interface ContactSortParams {
  sortBy: ContactSortBy;
  sortOrder: 'asc' | 'desc';
}

/** Raw UI filter state driving the contacts list query. */
export interface ContactListFilterState {
  page: number;
  limit: number;
  /** Debounced search text. */
  search: string;
  departmentFilter: string;
  statusFilter: string;
  /** Candidate account id from the Company filter (guarded before use). */
  companyFilter: string;
  sortOrder: ContactSortValue | string;
}

/** Resolved input for the `contact.list` tRPC query. */
export interface ContactListQuery {
  page: number;
  limit: number;
  search?: string;
  department?: string;
  status?: (typeof CONTACT_STATUSES)[number];
  accountId?: string;
  sortBy: ContactSortBy;
  sortOrder: 'asc' | 'desc';
}

/**
 * Sort choices rendered in the contacts list `SearchFilterBar`. Typed as a
 * mutable array so it satisfies the bar's `SortOption[]` prop (value narrowed to
 * `ContactSortValue` for callers that map it back through `getContactSortParams`).
 */
export const SORT_OPTIONS: Array<{ value: ContactSortValue; label: string }> = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
];

/**
 * Validates a UUID v4-shaped account id. Kept local (identical regex to the app
 * util) so this module stays free of React/hook imports.
 */
function isValidAccountId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Maps a UI sort value to the column + direction the API orders by. */
export function getContactSortParams(sortOrder: string): ContactSortParams {
  switch (sortOrder) {
    case 'oldest':
      return { sortBy: 'createdAt', sortOrder: 'asc' };
    case 'name':
      return { sortBy: 'lastName', sortOrder: 'asc' };
    case 'newest':
    default:
      return { sortBy: 'createdAt', sortOrder: 'desc' };
  }
}

/**
 * Assembles the `contact.list` query input from raw UI filter state. Empty
 * strings collapse to `undefined`; `accountId` is only included when the
 * Company filter holds a valid UUID.
 */
export function buildContactListQuery(state: ContactListFilterState): ContactListQuery {
  const { sortBy, sortOrder } = getContactSortParams(state.sortOrder);

  return {
    page: state.page,
    limit: state.limit,
    search: state.search || undefined,
    department: state.departmentFilter || undefined,
    status: state.statusFilter
      ? (state.statusFilter as (typeof CONTACT_STATUSES)[number])
      : undefined,
    accountId:
      state.companyFilter && isValidAccountId(state.companyFilter)
        ? state.companyFilter
        : undefined,
    sortBy,
    sortOrder,
  };
}

/**
 * True when the list is showing its default view (page 1, no filters, newest
 * sort) — the only case where server-prefetched `initialData` may seed the
 * client query.
 */
export function isDefaultContactQuery(
  state: Pick<
    ContactListFilterState,
    'page' | 'search' | 'departmentFilter' | 'statusFilter' | 'companyFilter' | 'sortOrder'
  >
): boolean {
  return (
    state.page === 1 &&
    !state.search &&
    !state.departmentFilter &&
    !state.statusFilter &&
    !state.companyFilter &&
    state.sortOrder === 'newest'
  );
}
