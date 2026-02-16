/**
 * @vitest-environment happy-dom
 * Supplementary tests for search-filter-bar.tsx
 *
 * Covers: SearchFilterBar component rendering, search input changes,
 * filter dropdowns, sort dropdown, filter chips, useFilterState,
 * useMultiFilterState hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import {
  SearchFilterBar,
  useFilterState,
  useMultiFilterState,
  type FilterDropdownConfig,
  type FilterChip,
  type SortOption,
} from '../search-filter-bar';

// ---------------------------------------------------------------------------
// SearchFilterBar Tests
// ---------------------------------------------------------------------------

describe('SearchFilterBar', () => {
  const defaultProps = {
    searchValue: '',
    onSearchChange: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onSearchChange = vi.fn();
  });

  it('renders search input with default placeholder', () => {
    render(<SearchFilterBar {...defaultProps} />);

    const input = screen.getByRole('searchbox');
    expect(input).toBeDefined();
    expect(input.getAttribute('placeholder')).toBe('Search...');
  });

  it('renders custom placeholder', () => {
    render(<SearchFilterBar {...defaultProps} searchPlaceholder="Search contacts..." />);

    const input = screen.getByRole('searchbox');
    expect(input.getAttribute('placeholder')).toBe('Search contacts...');
  });

  it('renders custom ARIA label for search input', () => {
    render(<SearchFilterBar {...defaultProps} searchAriaLabel="Search leads" />);

    expect(screen.getByLabelText('Search leads')).toBeDefined();
  });

  it('calls onSearchChange when search input value changes', () => {
    render(<SearchFilterBar {...defaultProps} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'test query' } });

    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('test query');
  });

  it('renders filter dropdowns', () => {
    const onFilterChange = vi.fn();
    const filters: FilterDropdownConfig[] = [
      {
        id: 'status',
        label: 'Status',
        icon: 'filter_list',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ],
        value: '',
        onChange: onFilterChange,
      },
    ];

    render(<SearchFilterBar {...defaultProps} filters={filters} />);

    // Should render a select element with options
    const select = screen.getByLabelText('Status');
    expect(select).toBeDefined();
  });

  it('calls filter onChange when filter value changes', () => {
    const onFilterChange = vi.fn();
    const filters: FilterDropdownConfig[] = [
      {
        id: 'priority',
        label: 'Priority',
        options: [
          { value: 'high', label: 'High' },
          { value: 'low', label: 'Low' },
        ],
        value: '',
        onChange: onFilterChange,
      },
    ];

    render(<SearchFilterBar {...defaultProps} filters={filters} />);

    const select = screen.getByLabelText('Priority');
    fireEvent.change(select, { target: { value: 'high' } });

    expect(onFilterChange).toHaveBeenCalledWith('high');
  });

  it('renders sort dropdown', () => {
    const sortOptions: SortOption[] = [
      { value: 'newest', label: 'Newest First' },
      { value: 'oldest', label: 'Oldest First' },
    ];
    const onSortChange = vi.fn();

    render(
      <SearchFilterBar
        {...defaultProps}
        sort={{
          options: sortOptions,
          value: 'newest',
          onChange: onSortChange,
        }}
      />
    );

    const sortSelect = screen.getByLabelText('Sort order');
    expect(sortSelect).toBeDefined();
  });

  it('calls sort onChange when sort value changes', () => {
    const onSortChange = vi.fn();
    const sortOptions: SortOption[] = [
      { value: 'newest', label: 'Newest First' },
      { value: 'oldest', label: 'Oldest First' },
    ];

    render(
      <SearchFilterBar
        {...defaultProps}
        sort={{
          options: sortOptions,
          value: 'newest',
          onChange: onSortChange,
        }}
      />
    );

    const sortSelect = screen.getByLabelText('Sort order');
    fireEvent.change(sortSelect, { target: { value: 'oldest' } });

    expect(onSortChange).toHaveBeenCalledWith('oldest');
  });

  it('renders filter chips', () => {
    const chips: FilterChip[] = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active', color: 'bg-green-500' },
      { id: 'closed', label: 'Closed' },
    ];
    const onChipChange = vi.fn();

    render(
      <SearchFilterBar
        {...defaultProps}
        filterChips={{
          options: chips,
          value: 'all',
          onChange: onChipChange,
        }}
      />
    );

    expect(screen.getByText('All')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Closed')).toBeDefined();
  });

  it('marks active chip with aria-pressed', () => {
    const chips: FilterChip[] = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
    ];

    render(
      <SearchFilterBar
        {...defaultProps}
        filterChips={{
          options: chips,
          value: 'active',
          onChange: vi.fn(),
        }}
      />
    );

    const activeChip = screen.getByText('Active');
    expect(activeChip.getAttribute('aria-pressed')).toBe('true');

    const allChip = screen.getByText('All');
    expect(allChip.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls chip onChange when chip is clicked', () => {
    const onChipChange = vi.fn();
    const chips: FilterChip[] = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
    ];

    render(
      <SearchFilterBar
        {...defaultProps}
        filterChips={{
          options: chips,
          value: 'all',
          onChange: onChipChange,
        }}
      />
    );

    fireEvent.click(screen.getByText('Active'));
    expect(onChipChange).toHaveBeenCalledWith('active');
  });

  it('renders chip color dot when color is provided', () => {
    const chips: FilterChip[] = [{ id: 'active', label: 'Active', color: 'bg-green-500' }];

    const { container } = render(
      <SearchFilterBar
        {...defaultProps}
        filterChips={{
          options: chips,
          value: '',
          onChange: vi.fn(),
        }}
      />
    );

    // Should have a span with the color class
    const dot = container.querySelector('.bg-green-500');
    expect(dot).not.toBeNull();
  });

  it('does not render filter chips row when no chips provided', () => {
    const { container } = render(<SearchFilterBar {...defaultProps} />);

    // No border-t separator for chips row should be present
    const chipsRow = container.querySelector('[class*="border-t"]');
    expect(chipsRow).toBeNull();
  });

  it('does not render filter chips row when chips array is empty', () => {
    const { container } = render(
      <SearchFilterBar
        {...defaultProps}
        filterChips={{
          options: [],
          value: '',
          onChange: vi.fn(),
        }}
      />
    );

    const chipButtons = container.querySelectorAll('[aria-pressed]');
    expect(chipButtons.length).toBe(0);
  });

  it('renders sort divider between filters and sort', () => {
    const filters: FilterDropdownConfig[] = [
      {
        id: 'status',
        label: 'Status',
        options: [{ value: 'active', label: 'Active' }],
        value: '',
        onChange: vi.fn(),
      },
    ];

    const { container } = render(
      <SearchFilterBar
        {...defaultProps}
        filters={filters}
        sort={{
          options: [{ value: 'newest', label: 'Newest' }],
          value: 'newest',
          onChange: vi.fn(),
        }}
        showSortDivider={true}
      />
    );

    // Divider should be present
    const divider = container.querySelector('[aria-hidden="true"]');
    expect(divider).not.toBeNull();
  });

  it('does not render sort divider when showSortDivider is false', () => {
    const filters: FilterDropdownConfig[] = [
      {
        id: 'status',
        label: 'Status',
        options: [{ value: 'active', label: 'Active' }],
        value: '',
        onChange: vi.fn(),
      },
    ];

    const { container } = render(
      <SearchFilterBar
        {...defaultProps}
        filters={filters}
        sort={{
          options: [{ value: 'newest', label: 'Newest' }],
          value: 'newest',
          onChange: vi.fn(),
        }}
        showSortDivider={false}
      />
    );

    // The divider element (w-px h-8 bg-slate-200) should not be present
    const dividers = container.querySelectorAll('.w-px');
    expect(dividers.length).toBe(0);
  });

  it('applies custom className', () => {
    const { container } = render(<SearchFilterBar {...defaultProps} className="my-custom-class" />);

    expect(container.firstElementChild?.className).toContain('my-custom-class');
  });

  it('hides filter on mobile when hideOnMobile is set', () => {
    const filters: FilterDropdownConfig[] = [
      {
        id: 'hidden',
        label: 'Hidden Filter',
        options: [{ value: 'a', label: 'A' }],
        value: '',
        onChange: vi.fn(),
        hideOnMobile: true,
      },
    ];

    const { container } = render(<SearchFilterBar {...defaultProps} filters={filters} />);

    // The filter container should have 'hidden sm:block' classes
    expect(container.innerHTML).toContain('hidden sm:block');
  });

  it('renders filter icon when provided', () => {
    const filters: FilterDropdownConfig[] = [
      {
        id: 'status',
        label: 'Status',
        icon: 'filter_list',
        options: [{ value: 'active', label: 'Active' }],
        value: '',
        onChange: vi.fn(),
      },
    ];

    render(<SearchFilterBar {...defaultProps} filters={filters} />);

    expect(screen.getByText('filter_list')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// useFilterState Hook Tests
// ---------------------------------------------------------------------------

describe('useFilterState', () => {
  it('initializes with the given value', () => {
    const { result } = renderHook(() => useFilterState(''));

    expect(result.current.value).toBe('');
  });

  it('updates value via onChange', () => {
    const { result } = renderHook(() => useFilterState(''));

    act(() => {
      result.current.onChange('active');
    });

    expect(result.current.value).toBe('active');
  });

  it('resets to initial value', () => {
    const { result } = renderHook(() => useFilterState('initial'));

    act(() => {
      result.current.onChange('changed');
    });
    expect(result.current.value).toBe('changed');

    act(() => {
      result.current.reset();
    });
    expect(result.current.value).toBe('initial');
  });

  it('works with non-string types', () => {
    const { result } = renderHook(() => useFilterState(0));

    act(() => {
      result.current.onChange(42);
    });

    expect(result.current.value).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// useMultiFilterState Hook Tests
// ---------------------------------------------------------------------------

describe('useMultiFilterState', () => {
  it('initializes with all given values', () => {
    const { result } = renderHook(() =>
      useMultiFilterState({ status: '', priority: '', search: '' })
    );

    expect(result.current.values).toEqual({
      status: '',
      priority: '',
      search: '',
    });
  });

  it('sets individual filter values', () => {
    const { result } = renderHook(() => useMultiFilterState({ status: '', priority: '' }));

    act(() => {
      result.current.set('status', 'active');
    });

    expect(result.current.values.status).toBe('active');
    expect(result.current.values.priority).toBe('');
  });

  it('resets all values to initial', () => {
    const { result } = renderHook(() =>
      useMultiFilterState({ status: 'default', priority: 'all' })
    );

    act(() => {
      result.current.set('status', 'active');
      result.current.set('priority', 'high');
    });

    expect(result.current.values.status).toBe('active');
    expect(result.current.values.priority).toBe('high');

    act(() => {
      result.current.reset();
    });

    expect(result.current.values).toEqual({
      status: 'default',
      priority: 'all',
    });
  });

  it('resets individual key to initial value', () => {
    const { result } = renderHook(() => useMultiFilterState({ status: 'all', priority: 'normal' }));

    act(() => {
      result.current.set('status', 'active');
      result.current.set('priority', 'high');
    });

    act(() => {
      result.current.resetKey('status');
    });

    expect(result.current.values.status).toBe('all');
    expect(result.current.values.priority).toBe('high');
  });
});
