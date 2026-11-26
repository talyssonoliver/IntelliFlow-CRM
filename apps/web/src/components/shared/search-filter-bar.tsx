'use client';

import * as React from 'react';
import { useState, useCallback, useId } from 'react';
import {
  cn,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@intelliflow/ui';

// =============================================================================
// Types
// =============================================================================

export interface FilterOption {
  value: string;
  label: string;
  /** Optional group name — options with the same group render inside an <optgroup> */
  group?: string;
}

export interface FilterDropdownConfig {
  id: string;
  label: string;
  icon?: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  /** Hide on mobile breakpoints */
  hideOnMobile?: boolean;
}

export interface FilterChip {
  id: string;
  label: string;
  /** Optional dot color indicator (Tailwind class like 'bg-red-500') */
  color?: string;
}

export interface SortOption {
  value: string;
  label: string;
}

export interface SearchFilterBarProps {
  /** Search input value */
  searchValue?: string;
  /**
   * Callback when search value changes. Leave out for a list with nothing to search (Review
   * history rows carry no text): the bar then shows only its filters.
   */
  onSearchChange?: (value: string) => void;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** ARIA label for search input */
  searchAriaLabel?: string;
  /** Filter dropdowns configuration */
  filters?: FilterDropdownConfig[];
  /** Quick filter chips/tabs */
  filterChips?: {
    options: FilterChip[];
    value: string;
    onChange: (value: string) => void;
  };
  /** Sort dropdown configuration */
  sort?: {
    options: SortOption[];
    value: string;
    onChange: (value: string) => void;
  };
  /** Additional class names for the container */
  className?: string;
  /** Show divider before sort dropdown */
  showSortDivider?: boolean;
  /**
   * Page-specific controls the bar has no slot for (a date range, a "clear dates" link). From md
   * they show as a row under the bar; on phones they go into the Filters sheet with the rest.
   */
  extra?: React.ReactNode;
}

// =============================================================================
// SearchFilterBar Component
// =============================================================================

/**
 * Unified Search and Filter Bar Component
 *
 * A consistent, accessible search and filter bar for list pages.
 * Supports search input, filter dropdowns, quick filter chips, and sorting.
 *
 * @example
 * ```tsx
 * <SearchFilterBar
 *   searchValue={search}
 *   onSearchChange={setSearch}
 *   searchPlaceholder="Search by name, email..."
 *   filters={[
 *     { id: 'status', label: 'Status', options: statusOptions, value: statusFilter, onChange: setStatusFilter },
 *   ]}
 *   filterChips={{
 *     options: [{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', color: 'bg-green-500' }],
 *     value: activeChip,
 *     onChange: setActiveChip,
 *   }}
 *   sort={{
 *     options: [{ value: 'newest', label: 'Newest First' }],
 *     value: sortOrder,
 *     onChange: setSortOrder,
 *   }}
 * />
 * ```
 */
/** '' or 'all' (any case) means the filter is not narrowing the list. */
export function isNoFilterValue(value: string): boolean {
  return value === '' || value.toLowerCase() === 'all';
}

export function SearchFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchAriaLabel = 'Search',
  filters = [],
  filterChips,
  sort,
  className,
  showSortDivider = true,
  extra,
}: Readonly<SearchFilterBarProps>) {
  const searchId = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasControls = filters.length > 0 || !!sort || !!extra;
  // Filters a page hides on phones stay hidden in the sheet too (some do nothing yet).
  const phoneFilters = filters.filter((f) => !f.hideOnMobile);
  // A filter is active unless it holds the "no filter" value: '' on most pages, 'all' on some
  // (codex review 26/11: the badge said 1 with nothing filtered).
  const activeCount = phoneFilters.filter((f) => !isNoFilterValue(f.value)).length;

  return (
    <div
      className={cn(
        'bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm',
        'flex flex-col gap-4',
        className
      )}
    >
      {/* Main row: Search + Filters + Sort */}
      {/* Owner 21/11: on phones the fields split over several lines. Below md the row is search +
          one Filters button that opens a sheet with every filter and the sort; from md as before. */}
      <div className="flex flex-row items-center gap-2 md:flex-col md:items-stretch md:gap-4 lg:flex-row lg:items-center">
        {/* Search Input - white background */}
        {onSearchChange && (
          <div className="relative flex-1" role="search">
            <label htmlFor={searchId} className="sr-only">
              {searchAriaLabel}
            </label>
            <span
              className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl"
              aria-hidden="true"
            >
              search
            </span>
            <input
              id={searchId}
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-lg',
                'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
                'text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500',
                'text-sm font-medium',
                'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
                'transition-all duration-200'
              )}
            />
          </div>
        )}

        {/* Filters and Sort */}
        {hasControls && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={cn(
              'md:hidden inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3',
              'border border-slate-200 bg-white text-sm font-medium text-slate-700',
              'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
              'focus:outline-none focus:ring-2 focus:ring-primary/50'
            )}
            aria-haspopup="dialog"
            data-testid="filters-sheet-button"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              tune
            </span>
            Filters
            {activeCount > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        )}

        {(filters.length > 0 || sort) && (
          <div className="hidden md:flex flex-wrap items-center gap-2 lg:gap-3">
            {/* Filter Dropdowns */}
            {filters.map((filter) => (
              <FilterDropdown key={filter.id} {...filter} />
            ))}

            {/* Divider before Sort */}
            {showSortDivider && sort && filters.length > 0 && (
              <div
                className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"
                aria-hidden="true"
              />
            )}

            {/* Sort Dropdown */}
            {sort && (
              <SortDropdown options={sort.options} value={sort.value} onChange={sort.onChange} />
            )}
          </div>
        )}
      </div>

      {/* Not while the phone sheet shows the same controls: two copies would mean duplicate ids
          (codex review 26/11, Review history's date inputs). */}
      {extra && !sheetOpen && (
        <div className="hidden md:flex flex-wrap items-center gap-3">{extra}</div>
      )}

      {/* Filter Chips Row */}
      {filterChips && filterChips.options.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-4 border-t border-slate-200 dark:border-slate-700 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {filterChips.options.map((chip) => (
            <FilterChipButton
              key={chip.id}
              chip={chip}
              isActive={filterChips.value === chip.id}
              onClick={() => filterChips.onChange(chip.id)}
            />
          ))}
        </div>
      )}

      {hasControls && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85svh] overflow-y-auto rounded-t-2xl md:hidden"
          >
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription className="sr-only">Filter and sort this list</SheetDescription>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-3">
              {phoneFilters.map((filter) => (
                <FilterDropdown key={filter.id} {...filter} fullWidth />
              ))}
              {sort && (
                <SortDropdown
                  options={sort.options}
                  value={sort.value}
                  onChange={sort.onChange}
                  fullWidth
                />
              )}
              {extra && <div className="flex flex-col gap-3">{extra}</div>}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="mt-2 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                Done
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// =============================================================================
// Filter Dropdown Component
// =============================================================================

type FilterDropdownProps = FilterDropdownConfig & {
  /** In the phone sheet: the full width, 44px tall. */
  fullWidth?: boolean;
};

function FilterDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  hideOnMobile,
  fullWidth = false,
}: Readonly<FilterDropdownProps>) {
  const selectId = useId();

  return (
    <div className={cn('relative', fullWidth ? 'w-full' : hideOnMobile && 'hidden sm:block')}>
      <label htmlFor={selectId} className="sr-only">
        {label}
      </label>
      <div className="relative group">
        {icon && (
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-lg pointer-events-none transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'appearance-none rounded-lg',
            'bg-slate-50 dark:bg-slate-700/50 border border-slate-50 dark:border-slate-600',
            'text-slate-700 dark:text-slate-200 text-sm font-medium',
            'py-2.5 pr-9',
            icon ? 'pl-10' : 'pl-4',
            fullWidth && 'w-full min-h-11',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
            'cursor-pointer transition-all duration-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
          )}
        >
          <option value="">{label}</option>
          <FilterOptions options={options} />
        </select>
        <span
          className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-lg pointer-events-none transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300"
          aria-hidden="true"
        >
          expand_more
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Filter Options (flat or grouped via <optgroup>)
// =============================================================================

function FilterOptions({ options }: Readonly<{ options: FilterOption[] }>) {
  const hasGroups = options.some((o) => o.group);
  if (!hasGroups) {
    return options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ));
  }

  // Group options by their group field, preserving order
  const groups: { name: string; items: FilterOption[] }[] = [];
  const ungrouped: FilterOption[] = [];
  for (const option of options) {
    if (!option.group) {
      ungrouped.push(option);
      continue;
    }
    const existing = groups.find((g) => g.name === option.group);
    if (existing) {
      existing.items.push(option);
    } else {
      groups.push({ name: option.group, items: [option] });
    }
  }

  return (
    <>
      {ungrouped.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={group.name} label={group.name}>
          {group.items.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

// =============================================================================
// Sort Dropdown Component
// =============================================================================

interface SortDropdownProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  fullWidth?: boolean;
}

function SortDropdown({
  options,
  value,
  onChange,
  fullWidth = false,
}: Readonly<SortDropdownProps>) {
  const selectId = useId();

  return (
    <div className={cn('relative', fullWidth && 'w-full')}>
      <label htmlFor={selectId} className="sr-only">
        Sort order
      </label>
      <div className="relative group">
        <span
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-lg pointer-events-none transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300"
          aria-hidden="true"
        >
          sort
        </span>
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'appearance-none rounded-lg',
            'bg-slate-50 dark:bg-slate-700/50 border border-slate-50 dark:border-slate-600',
            'text-slate-700 dark:text-slate-200 text-sm font-medium',
            'py-2.5 pl-10 pr-9',
            fullWidth && 'w-full min-h-11',
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
            'cursor-pointer transition-all duration-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-lg pointer-events-none transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300"
          aria-hidden="true"
        >
          expand_more
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Filter Chip Button Component
// =============================================================================

interface FilterChipButtonProps {
  readonly chip: FilterChip;
  readonly isActive: boolean;
  readonly onClick: () => void;
}

function FilterChipButton({ chip, isActive, onClick }: Readonly<FilterChipButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 px-4 rounded-full text-xs font-semibold',
        'flex items-center gap-2 transition-all duration-200',
        isActive
          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
          : 'bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-500'
      )}
      aria-pressed={isActive}
    >
      {chip.color && <span className={cn('size-2 rounded-full', chip.color)} aria-hidden="true" />}
      {chip.label}
    </button>
  );
}

// =============================================================================
// Convenience Hooks
// =============================================================================

/**
 * Hook to manage filter state for SearchFilterBar
 *
 * @example
 * ```tsx
 * const { value, onChange, reset } = useFilterState('');
 * ```
 */
export function useFilterState<T>(initialValue: Readonly<T>) {
  const [value, setValue] = useState<T>(initialValue);

  const onChange = useCallback((newValue: T) => {
    setValue(newValue);
  }, []);

  const reset = useCallback(() => {
    setValue(initialValue);
  }, [initialValue]);

  return { value, onChange, reset };
}

/**
 * Hook to manage multiple filter states
 *
 * @example
 * ```tsx
 * const filters = useMultiFilterState({
 *   status: '',
 *   priority: '',
 *   search: '',
 * });
 * // filters.values.status, filters.set('status', 'active'), filters.reset()
 * ```
 */
export function useMultiFilterState<T extends Record<string, string>>(initialValues: T) {
  type Widened = { [K in keyof T]: string };
  const [values, setValues] = useState<Widened>(initialValues as Widened);

  const set = useCallback(<K extends keyof Widened>(key: K, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setValues(initialValues as Widened);
  }, [initialValues]);

  const resetKey = useCallback(
    <K extends keyof Widened>(key: K) => {
      setValues((prev) => ({ ...prev, [key]: (initialValues as Widened)[key] }));
    },
    [initialValues]
  );

  /** True when any key outside `ignore` (e.g. `sort`) differs from its initial value. */
  const isFiltered = useCallback(
    (ignore: readonly (keyof Widened)[] = []) =>
      (Object.keys(values) as (keyof Widened)[]).some(
        (k) => !ignore.includes(k) && values[k] !== (initialValues as Widened)[k]
      ),
    [values, initialValues]
  );

  /** Reset every key outside `ignore` (keeps e.g. the sort order). */
  const resetFilters = useCallback(
    (ignore: readonly (keyof Widened)[] = []) => {
      setValues((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(prev) as (keyof Widened)[]) {
          if (!ignore.includes(k)) next[k] = (initialValues as Widened)[k];
        }
        return next;
      });
    },
    [initialValues]
  );

  return { values, set, reset, resetKey, isFiltered, resetFilters };
}

/** The part of `useMultiFilterState` that `clearFiltersAction` uses. */
interface ResettableFilters {
  isFiltered(ignore?: readonly string[]): boolean;
  resetFilters(ignore?: readonly string[]): void;
}

/**
 * The empty-state "Clear filters" action for a list filtered by `useMultiFilterState`
 * AND a quick-filter chip held in its own state (`'all'` = no chip). The chip counts as a
 * filter and is reset with the rest, so a chip that empties the list always offers Clear,
 * and Clear never leaves a chip selected over an unfiltered list. `ignore` keys (the sort
 * order by default) are neither counted nor reset.
 */
export function clearFiltersAction(
  filters: ResettableFilters,
  chip: { value: string; reset: () => void },
  ignore: readonly string[] = ['sort']
): { label: string; onClick: () => void } | undefined {
  if (!filters.isFiltered(ignore) && chip.value === 'all') return undefined;
  return {
    label: 'Clear filters',
    onClick: () => {
      filters.resetFilters(ignore);
      chip.reset();
    },
  };
}
