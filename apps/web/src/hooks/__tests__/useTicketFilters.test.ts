import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTicketFilters } from '../useTicketFilters';

describe('useTicketFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-009: Default filters when no defaults provided
  it('returns DEFAULT_FILTERS when no defaults provided', () => {
    const { result } = renderHook(() => useTicketFilters());
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.status).toBe('');
    expect(result.current.filters.priority).toBe('');
    expect(result.current.filters.slaStatus).toBe('all');
    expect(result.current.filters.sortBy).toBe('updatedAt');
    expect(result.current.filters.sortOrder).toBe('desc');
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.limit).toBe(20);
  });

  // AC-009: Custom defaults override default sort
  it('accepts custom defaults that override default sort', () => {
    const { result } = renderHook(() =>
      useTicketFilters({ sortBy: 'slaResolutionDue', sortOrder: 'asc' })
    );
    expect(result.current.filters.sortBy).toBe('slaResolutionDue');
    expect(result.current.filters.sortOrder).toBe('asc');
  });

  // AC-003: Search filter with debounce
  it('setSearch updates filters.search and resets page to 1', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setPage(3));
    expect(result.current.filters.page).toBe(3);

    act(() => result.current.setSearch('test query'));
    expect(result.current.filters.search).toBe('test query');
    expect(result.current.filters.page).toBe(1);
  });

  // AC-003: 400ms debounce
  it('debouncedSearch updates after 400ms', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setSearch('hello'));

    // Before debounce fires
    expect(result.current.debouncedSearch).toBe('');

    // After 400ms
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.debouncedSearch).toBe('hello');
  });

  // AC-004: Status filter resets page
  it('setStatusFilter updates filters.status and resets page to 1', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setPage(2));
    act(() => result.current.setStatusFilter('OPEN' as never));
    expect(result.current.filters.status).toBe('OPEN');
    expect(result.current.filters.page).toBe(1);
  });

  // AC-004: Priority filter resets page
  it('setPriorityFilter updates filters.priority and resets page to 1', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setPage(2));
    act(() => result.current.setPriorityFilter('HIGH' as never));
    expect(result.current.filters.priority).toBe('HIGH');
    expect(result.current.filters.page).toBe(1);
  });

  // AC-004: SLA filter resets page
  it('setSLAFilter updates filters.slaStatus and resets page to 1', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setPage(2));
    act(() => result.current.setSLAFilter('BREACHED'));
    expect(result.current.filters.slaStatus).toBe('BREACHED');
    expect(result.current.filters.page).toBe(1);
  });

  // Sort toggle behavior
  it('setSort toggles sortOrder when same sortBy is set', () => {
    const { result } = renderHook(() => useTicketFilters());
    // Default is updatedAt desc
    act(() => result.current.setSort('updatedAt'));
    expect(result.current.filters.sortOrder).toBe('asc');
  });

  it('setSort with explicit sortOrder uses that value', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setSort('createdAt', 'asc'));
    expect(result.current.filters.sortBy).toBe('createdAt');
    expect(result.current.filters.sortOrder).toBe('asc');
  });

  it('setPage updates filters.page', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setPage(5));
    expect(result.current.filters.page).toBe(5);
  });

  it('resetFilters restores to initial state including custom defaults', () => {
    const { result } = renderHook(() =>
      useTicketFilters({ sortBy: 'slaResolutionDue', sortOrder: 'asc' })
    );
    // Change some filters
    act(() => result.current.setSearch('modified'));
    act(() => result.current.setPage(3));
    act(() => vi.advanceTimersByTime(400));

    // Reset
    act(() => result.current.resetFilters());
    expect(result.current.filters.search).toBe('');
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.sortBy).toBe('slaResolutionDue');
    expect(result.current.filters.sortOrder).toBe('asc');
    expect(result.current.debouncedSearch).toBe('');
  });

  // queryParams shape
  it('queryParams omits default values, includes non-default values', () => {
    const { result } = renderHook(() => useTicketFilters());
    // Default state — only page and limit
    expect(result.current.queryParams).toEqual({ page: 1, limit: 20 });
  });

  it('queryParams uses debouncedSearch not filters.search', () => {
    const { result } = renderHook(() => useTicketFilters());
    act(() => result.current.setSearch('test'));
    // Before debounce: search should not be in queryParams
    expect(result.current.queryParams).toEqual({ page: 1, limit: 20 });

    // After debounce
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.queryParams).toEqual({ page: 1, limit: 20, search: 'test' });
  });

  it('queryParams includes non-default sort', () => {
    const { result } = renderHook(() =>
      useTicketFilters({ sortBy: 'slaResolutionDue', sortOrder: 'asc' })
    );
    expect(result.current.queryParams).toMatchObject({
      sortBy: 'slaResolutionDue',
      sortOrder: 'asc',
    });
  });
});
