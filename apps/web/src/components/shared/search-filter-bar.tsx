'use client';

import * as React from 'react';
import { useState, useCallback, useId } from 'react';
import { cn } from '@intelliflow/ui';

// =============================================================================
// Types
// =============================================================================

export interface FilterOption {
  value: string;
  label: string;
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
  searchValue: string;
  /** Callback when search value changes */
  onSearchChange: (value: string) => void;
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
}: Readonly<SearchFilterBarProps>) {
  const searchId = useId();

  return (
    <div
      className={cn(
        'bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm',
        'flex flex-col gap-4',
        className
      )}
    >
      {/* Main row: Search + Filters + Sort */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        {/* Search Input - white background */}
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
            value={searchValue}
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

        {/* Filters and Sort */}
        {(filters.length > 0 || sort) && (
          <div className="flex flex-wrap items-center gap-2 lg:gap-3">
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
              <SortDropdown
                options={sort.options}
                value={sort.value}
                onChange={sort.onChange}
              />
            )}
          </div>
        )}
      </div>

      {/* Filter Chips Row */}
      {filterChips && filterChips.options.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
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
    </div>
  );
}

// =============================================================================
// Filter Dropdown Component
// =============================================================================

interface FilterDropdownProps extends FilterDropdownConfig {}

function FilterDropdown({
  label,
  icon,
  options,
  value,
  onChange,
  hideOnMobile,
}: FilterDropdownProps) {
  const selectId = useId();

  return (
    <div className={cn('relative', hideOnMobile && 'hidden sm:block')}>
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
            'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary',
            'cursor-pointer transition-all duration-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500'
          )}
        >
          <option value="">{label}</option>
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
// Sort Dropdown Component
// =============================================================================

interface SortDropdownProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
}

function SortDropdown({ options, value, onChange }: Readonly<SortDropdownProps>) {
  const selectId = useId();

  return (
    <div className="relative">
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

function FilterChipButton({ chip, isActive, onClick }: FilterChipButtonProps) {
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
      {chip.color && (
        <span
          className={cn('size-2 rounded-full', chip.color)}
          aria-hidden="true"
        />
      )}
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
export function useFilterState<T>(initialValue: T) {
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
export function useMultiFilterState<T extends Record<string, string>>(
  initialValues: T
) {
  const [values, setValues] = useState<T>(initialValues);

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setValues(initialValues);
  }, [initialValues]);

  const resetKey = useCallback(<K extends keyof T>(key: K) => {
    setValues((prev) => ({ ...prev, [key]: initialValues[key] }));
  }, [initialValues]);

  return { values, set, reset, resetKey };
}
