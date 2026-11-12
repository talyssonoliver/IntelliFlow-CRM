/**
 * clearFiltersAction: the empty-state "Clear filters" action for lists filtered by
 * useMultiFilterState plus a quick-filter chip kept in its own state (Churn, Lead
 * Scoring, Sentiment, Active Agents). The chip counts as a filter and is reset too.
 */
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearFiltersAction, useMultiFilterState } from '../search-filter-bar';

function setup(chipValue = 'all') {
  const { result } = renderHook(() =>
    useMultiFilterState({ riskLevel: '', search: '', sort: 'risk' })
  );
  const reset = vi.fn();
  const action = () => clearFiltersAction(result.current, { value: chipValue, reset });
  return { result, reset, action };
}

describe('clearFiltersAction', () => {
  it('offers nothing when no filter and no chip is set', () => {
    expect(setup().action()).toBeUndefined();
  });

  it('ignores the sort order', () => {
    const { result, action } = setup();
    act(() => result.current.set('sort', 'newest'));
    expect(action()).toBeUndefined();
  });

  it('offers Clear for a chip alone, even when every filter value is at its default', () => {
    expect(setup('atRisk').action()).toMatchObject({ label: 'Clear filters' });
  });

  it('clears the filters and the chip, and keeps the sort order', () => {
    const { result, reset, action } = setup('critical');
    act(() => {
      result.current.set('riskLevel', 'CRITICAL');
      result.current.set('search', 'acme');
      result.current.set('sort', 'newest');
    });

    act(() => action()?.onClick());

    expect(result.current.values).toEqual({ riskLevel: '', search: '', sort: 'newest' });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('offers Clear for a filter value with the chip on all', () => {
    const { result, action } = setup();
    act(() => result.current.set('search', 'acme'));
    expect(action()).toMatchObject({ label: 'Clear filters' });
  });
});
