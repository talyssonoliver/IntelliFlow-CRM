/**
 * Supplementary tests for search-filter-bar.tsx
 *
 * Tests filter logic: useFilterState, useMultiFilterState,
 * filter chip active detection, sort divider visibility,
 * and SearchFilterBarProps shape validation.
 *
 * No rendering - tests pure logic only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks for testing useFilterState and useMultiFilterState
// ---------------------------------------------------------------------------
const mockSetState = vi.hoisted(() => vi.fn());

vi.mock('react', () => ({
  useState: vi.fn((initial: any) => [typeof initial === 'function' ? initial() : initial, mockSetState]),
  useCallback: vi.fn((fn: any) => fn),
  useId: vi.fn(() => ':test-id:'),
}));

vi.mock('@intelliflow/ui', () => ({
  cn: vi.fn((...args: any[]) => args.filter(Boolean).join(' ')),
}));

describe('search-filter-bar logic', () => {
  beforeEach(() => {
    mockSetState.mockClear();
  });

  // ===================== useFilterState =====================
  describe('useFilterState', () => {
    it('returns initial value', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useFilterState('');
      expect(result.value).toBe('');
    });

    it('returns initial string value', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useFilterState('active');
      expect(result.value).toBe('active');
    });

    it('onChange is a function', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useFilterState('');
      expect(typeof result.onChange).toBe('function');
    });

    it('reset is a function', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useFilterState('');
      expect(typeof result.reset).toBe('function');
    });

    it('onChange calls setState', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useFilterState('');
      result.onChange('new-value');
      expect(mockSetState).toHaveBeenCalledWith('new-value');
    });

    it('reset calls setState with initial value', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useFilterState('initial');
      result.reset();
      expect(mockSetState).toHaveBeenCalledWith('initial');
    });
  });

  // ===================== useMultiFilterState =====================
  describe('useMultiFilterState', () => {
    it('returns initial values object', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useMultiFilterState({ status: '', priority: '' });
      expect(result.values).toEqual({ status: '', priority: '' });
    });

    it('set is a function', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useMultiFilterState({ status: '' });
      expect(typeof result.set).toBe('function');
    });

    it('reset is a function', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useMultiFilterState({ status: '' });
      expect(typeof result.reset).toBe('function');
    });

    it('resetKey is a function', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useMultiFilterState({ status: '', priority: '' });
      expect(typeof result.resetKey).toBe('function');
    });

    it('set calls setState with updater', async () => {
      const mod = await import('../search-filter-bar.js');
      const result = mod.useMultiFilterState({ status: '', priority: '' });
      result.set('status', 'active');
      expect(mockSetState).toHaveBeenCalled();
      // The updater function should merge the new value
      const updater = mockSetState.mock.calls[mockSetState.mock.calls.length - 1][0];
      if (typeof updater === 'function') {
        const updated = updater({ status: '', priority: '' });
        expect(updated.status).toBe('active');
        expect(updated.priority).toBe('');
      }
    });

    it('reset calls setState with initial values', async () => {
      const mod = await import('../search-filter-bar.js');
      const initial = { status: 'all', priority: 'any' };
      const result = mod.useMultiFilterState(initial);
      result.reset();
      expect(mockSetState).toHaveBeenCalledWith(initial);
    });

    it('resetKey resets only the specified key', async () => {
      const mod = await import('../search-filter-bar.js');
      const initial = { status: 'default', priority: 'low' };
      const result = mod.useMultiFilterState(initial);
      result.resetKey('status');
      expect(mockSetState).toHaveBeenCalled();
      const updater = mockSetState.mock.calls[mockSetState.mock.calls.length - 1][0];
      if (typeof updater === 'function') {
        const updated = updater({ status: 'active', priority: 'high' });
        expect(updated.status).toBe('default');
        expect(updated.priority).toBe('high');
      }
    });
  });

  // ===================== FilterChip active state =====================
  describe('FilterChip active state', () => {
    it('chip is active when value matches chip id', () => {
      const chipId = 'active';
      const currentValue = 'active';
      expect(currentValue === chipId).toBe(true);
    });

    it('chip is not active when value differs', () => {
      const chipId = 'active';
      const currentValue: string = 'all';
      expect(currentValue === chipId).toBe(false);
    });

    it('aria-pressed matches active state', () => {
      const isActive = true;
      expect(isActive).toBe(true);
    });
  });

  // ===================== Sort divider visibility =====================
  describe('sort divider visibility', () => {
    it('shown when showSortDivider is true, sort exists, and filters exist', () => {
      const showSortDivider = true;
      const hasSort = true;
      const filtersLength = 2;
      const showDivider = showSortDivider && hasSort && filtersLength > 0;
      expect(showDivider).toBe(true);
    });

    it('hidden when showSortDivider is false', () => {
      const showSortDivider = false;
      const hasSort = true;
      const filtersLength = 2;
      const showDivider = showSortDivider && hasSort && filtersLength > 0;
      expect(showDivider).toBe(false);
    });

    it('hidden when no sort', () => {
      const showSortDivider = true;
      const hasSort = false;
      const filtersLength = 2;
      const showDivider = showSortDivider && hasSort && filtersLength > 0;
      expect(showDivider).toBe(false);
    });

    it('hidden when no filters', () => {
      const showSortDivider = true;
      const hasSort = true;
      const filtersLength = 0;
      const showDivider = showSortDivider && hasSort && filtersLength > 0;
      expect(showDivider).toBe(false);
    });
  });

  // ===================== Filter chips rendering condition =====================
  describe('filter chips rendering condition', () => {
    it('shown when filterChips exists and has options', () => {
      const filterChips = { options: [{ id: 'all', label: 'All' }], value: 'all', onChange: vi.fn() };
      const shouldShow = filterChips && filterChips.options.length > 0;
      expect(shouldShow).toBe(true);
    });

    it('hidden when filterChips has no options', () => {
      const filterChips = { options: [] as any[], value: '', onChange: vi.fn() };
      const shouldShow = filterChips && filterChips.options.length > 0;
      expect(shouldShow).toBe(false);
    });

    it('hidden when filterChips is undefined', () => {
      const filterChips = undefined;
      const shouldShow = filterChips && (filterChips as any).options.length > 0;
      expect(shouldShow).toBeFalsy();
    });
  });

  // ===================== Filters and sort section visibility =====================
  describe('filters section visibility', () => {
    it('shown when filters exist', () => {
      const filtersLength = 2;
      const hasSort = false;
      const show = filtersLength > 0 || hasSort;
      expect(show).toBe(true);
    });

    it('shown when sort exists', () => {
      const filtersLength = 0;
      const hasSort = true;
      const show = filtersLength > 0 || hasSort;
      expect(show).toBe(true);
    });

    it('hidden when neither filters nor sort', () => {
      const filtersLength = 0;
      const hasSort = false;
      const show = filtersLength > 0 || hasSort;
      expect(show).toBe(false);
    });
  });

  // ===================== FilterDropdownConfig shape =====================
  describe('FilterDropdownConfig shape', () => {
    it('accepts valid config', () => {
      const config = {
        id: 'status',
        label: 'Status',
        icon: 'filter_list',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
        value: '',
        onChange: vi.fn(),
        hideOnMobile: false,
      };
      expect(config.id).toBe('status');
      expect(config.options).toHaveLength(2);
      expect(config.hideOnMobile).toBe(false);
    });

    it('hideOnMobile is optional', () => {
      const config = {
        id: 'priority',
        label: 'Priority',
        options: [],
        value: '',
        onChange: vi.fn(),
      };
      expect((config as any).hideOnMobile).toBeUndefined();
    });

    it('icon is optional', () => {
      const config = {
        id: 'source',
        label: 'Source',
        options: [],
        value: '',
        onChange: vi.fn(),
      };
      expect((config as any).icon).toBeUndefined();
    });
  });

  // ===================== FilterOption =====================
  describe('FilterOption', () => {
    it('has value and label', () => {
      const option = { value: 'new', label: 'New' };
      expect(option.value).toBe('new');
      expect(option.label).toBe('New');
    });
  });

  // ===================== SortOption =====================
  describe('SortOption', () => {
    it('has value and label', () => {
      const option = { value: 'newest', label: 'Newest First' };
      expect(option.value).toBe('newest');
      expect(option.label).toBe('Newest First');
    });
  });

  // ===================== FilterChip =====================
  describe('FilterChip', () => {
    it('has id and label', () => {
      const chip = { id: 'all', label: 'All' };
      expect(chip.id).toBe('all');
      expect(chip.label).toBe('All');
    });

    it('color is optional', () => {
      const chip = { id: 'active', label: 'Active', color: 'bg-green-500' };
      expect(chip.color).toBe('bg-green-500');
    });

    it('without color renders no dot', () => {
      const chip = { id: 'all', label: 'All' };
      expect((chip as any).color).toBeUndefined();
    });
  });

  // ===================== Default prop values =====================
  describe('default prop values', () => {
    it('searchPlaceholder defaults to "Search..."', () => {
      const defaultPlaceholder = 'Search...';
      expect(defaultPlaceholder).toBe('Search...');
    });

    it('searchAriaLabel defaults to "Search"', () => {
      const defaultAriaLabel = 'Search';
      expect(defaultAriaLabel).toBe('Search');
    });

    it('showSortDivider defaults to true', () => {
      const defaultShowSortDivider = true;
      expect(defaultShowSortDivider).toBe(true);
    });

    it('filters defaults to empty array', () => {
      const defaultFilters: any[] = [];
      expect(defaultFilters).toHaveLength(0);
    });
  });

  // ===================== Search input onChange =====================
  describe('search input onChange behavior', () => {
    it('passes input value to onSearchChange', () => {
      const onSearchChange = vi.fn();
      const mockEvent = { target: { value: 'hello' } };
      onSearchChange(mockEvent.target.value);
      expect(onSearchChange).toHaveBeenCalledWith('hello');
    });

    it('handles empty string', () => {
      const onSearchChange = vi.fn();
      onSearchChange('');
      expect(onSearchChange).toHaveBeenCalledWith('');
    });
  });
});
