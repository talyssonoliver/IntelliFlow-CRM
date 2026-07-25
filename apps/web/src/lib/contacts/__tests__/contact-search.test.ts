import { describe, it, expect } from 'vitest';
import {
  SORT_OPTIONS,
  getContactSortParams,
  buildContactListQuery,
  isDefaultContactQuery,
  type ContactListFilterState,
} from '../contact-search';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

function baseState(overrides: Partial<ContactListFilterState> = {}): ContactListFilterState {
  return {
    page: 1,
    limit: 10,
    search: '',
    departmentFilter: '',
    statusFilter: '',
    companyFilter: '',
    sortOrder: 'newest',
    ...overrides,
  };
}

describe('SORT_OPTIONS', () => {
  it('exposes the three contact sort choices in order', () => {
    expect(SORT_OPTIONS.map((o) => o.value)).toEqual(['newest', 'oldest', 'name']);
    expect(SORT_OPTIONS.every((o) => typeof o.label === 'string' && o.label.length > 0)).toBe(true);
  });
});

describe('getContactSortParams', () => {
  it('maps "newest" to createdAt desc', () => {
    expect(getContactSortParams('newest')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('maps "oldest" to createdAt asc', () => {
    expect(getContactSortParams('oldest')).toEqual({ sortBy: 'createdAt', sortOrder: 'asc' });
  });

  it('maps "name" to lastName asc', () => {
    expect(getContactSortParams('name')).toEqual({ sortBy: 'lastName', sortOrder: 'asc' });
  });

  it('falls back to newest (createdAt desc) for unknown values', () => {
    expect(getContactSortParams('whatever')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
    expect(getContactSortParams('')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
  });
});

describe('buildContactListQuery', () => {
  it('omits all optional filters when the state is empty', () => {
    expect(buildContactListQuery(baseState())).toEqual({
      page: 1,
      limit: 10,
      search: undefined,
      department: undefined,
      status: undefined,
      accountId: undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('passes through search and department when set', () => {
    const q = buildContactListQuery(baseState({ search: 'ada', departmentFilter: 'Sales' }));
    expect(q.search).toBe('ada');
    expect(q.department).toBe('Sales');
  });

  it('passes the status filter through', () => {
    const q = buildContactListQuery(baseState({ statusFilter: 'ACTIVE' }));
    expect(q.status).toBe('ACTIVE');
  });

  it('includes accountId only when companyFilter is a valid UUID', () => {
    expect(buildContactListQuery(baseState({ companyFilter: VALID_UUID })).accountId).toBe(
      VALID_UUID
    );
    expect(buildContactListQuery(baseState({ companyFilter: 'not-a-uuid' })).accountId).toBe(
      undefined
    );
    expect(buildContactListQuery(baseState({ companyFilter: '' })).accountId).toBe(undefined);
  });

  it('propagates pagination and sort selection', () => {
    const q = buildContactListQuery(baseState({ page: 3, limit: 25, sortOrder: 'name' }));
    expect(q.page).toBe(3);
    expect(q.limit).toBe(25);
    expect(q.sortBy).toBe('lastName');
    expect(q.sortOrder).toBe('asc');
  });
});

describe('isDefaultContactQuery', () => {
  it('is true for the default page-1 / no-filter / newest state', () => {
    expect(isDefaultContactQuery(baseState())).toBe(true);
  });

  it.each([
    ['page not 1', baseState({ page: 2 })],
    ['a search term', baseState({ search: 'x' })],
    ['a department filter', baseState({ departmentFilter: 'Sales' })],
    ['a status filter', baseState({ statusFilter: 'ACTIVE' })],
    ['a company filter', baseState({ companyFilter: VALID_UUID })],
    ['a non-newest sort', baseState({ sortOrder: 'oldest' })],
  ])('is false when %s is present', (_label, state) => {
    expect(isDefaultContactQuery(state)).toBe(false);
  });
});
