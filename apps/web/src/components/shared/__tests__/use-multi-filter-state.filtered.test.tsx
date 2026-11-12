import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMultiFilterState } from '../search-filter-bar';

const INITIAL = { status: '', type: 'all', sort: 'newest', search: '' };

describe('useMultiFilterState isFiltered / resetFilters (#1222 UI-002)', () => {
  it('reports a filter only when a non-ignored key moved from its initial value', () => {
    const { result } = renderHook(() => useMultiFilterState(INITIAL));
    expect(result.current.isFiltered(['sort'])).toBe(false);

    act(() => result.current.set('sort', 'oldest'));
    expect(result.current.isFiltered(['sort'])).toBe(false);
    expect(result.current.isFiltered()).toBe(true);

    act(() => result.current.set('status', 'active'));
    expect(result.current.isFiltered(['sort'])).toBe(true);
  });

  it('resets the filters and keeps the ignored keys', () => {
    const { result } = renderHook(() => useMultiFilterState(INITIAL));
    act(() => {
      result.current.set('sort', 'oldest');
      result.current.set('search', 'acme');
      result.current.set('type', 'lead');
    });
    act(() => result.current.resetFilters(['sort']));
    expect(result.current.values).toEqual({ ...INITIAL, sort: 'oldest' });

    act(() => result.current.resetFilters());
    expect(result.current.values).toEqual(INITIAL);
  });
});
