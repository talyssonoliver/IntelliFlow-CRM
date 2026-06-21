/**
 * DealFilters Component (PG-135)
 *
 * Filter bar with owner filter, date range, and view mode toggle.
 * Styled to match the SearchFilterBar pattern used across the CRM.
 *
 * @module DealFilters
 * AC-9: Filter bar supports owner filter and date range filter
 */

import * as React from 'react';
import type { DealFiltersValue } from './types';

/** An owner option for the owner dropdown (matches the dynamic-filter shape). */
export interface DealOwnerOption {
  readonly value: string;
  readonly label: string;
}

interface DealFiltersProps {
  readonly value: DealFiltersValue;
  readonly onChange: (filters: DealFiltersValue) => void;
  readonly viewMode?: 'kanban' | 'list';
  readonly onViewModeChange?: (mode: 'kanban' | 'list') => void;
  /** Real tenant owners for the owner filter (IFC-287 F-12). */
  readonly owners?: ReadonlyArray<DealOwnerOption>;
}

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All Time' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
] as const;

const SELECT_CLASS =
  'appearance-none rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium py-2.5 pr-9 pl-10 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors cursor-pointer';

export const DealFilters = React.memo(function DealFilters({
  value,
  onChange,
  viewMode = 'kanban',
  onViewModeChange,
  owners = [],
}: Readonly<DealFiltersProps>) {
  const [showMore, setShowMore] = React.useState(false);

  const handleOwnerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ownerId = e.target.value || undefined;
    onChange({ ...value, ownerId });
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dateRange = (e.target.value || undefined) as DealFiltersValue['dateRange'];
    onChange({ ...value, dateRange });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, search: e.target.value || undefined });
  };

  const parseMoney = (raw: string): number | undefined => {
    if (raw === '') return undefined;
    const n = Number(raw);
    // The server schema (opportunityQuerySchema.min/maxValue) is z.number().positive(),
    // so 0 and negatives are not valid filter bounds — sending them yields a BAD_INPUT
    // ("Failed to load deals"). A 0 lower bound is meaningless anyway. Treat any
    // non-positive (or non-finite) entry as "no filter". (#450)
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const handleMinValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, minValue: parseMoney(e.target.value) });
  };

  const handleMaxValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, maxValue: parseMoney(e.target.value) });
  };

  return (
    <div className="mb-4">
      <div
        className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm"
        role="toolbar"
        aria-label="Deal filters"
      >
        {/* Owner Filter */}
        <div className="relative">
          <label htmlFor="deal-owner-filter" className="sr-only">
            Owner
          </label>
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-[18px] pointer-events-none">
            person
          </span>
          <select
            id="deal-owner-filter"
            className={SELECT_CLASS}
            value={value.ownerId ?? ''}
            onChange={handleOwnerChange}
            aria-label="Filter by owner"
          >
            <option value="">All Deals</option>
            {owners.map((owner) => (
              <option key={owner.value} value={owner.value}>
                {owner.label}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-[18px] pointer-events-none">
            expand_more
          </span>
        </div>

        {/* Date Range Filter */}
        <div className="relative">
          <label htmlFor="deal-date-filter" className="sr-only">
            Date Range
          </label>
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-[18px] pointer-events-none">
            calendar_today
          </span>
          <select
            id="deal-date-filter"
            className={SELECT_CLASS}
            value={value.dateRange ?? ''}
            onChange={handleDateRangeChange}
            aria-label="Filter by date range"
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-[18px] pointer-events-none">
            expand_more
          </span>
        </div>

        {/* More Filters (IFC-287 F-11) */}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-medium py-2.5 px-4 hover:bg-slate-100 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
          aria-label="More filters"
          aria-expanded={showMore}
          aria-controls="deal-advanced-filters"
          onClick={() => setShowMore((prev) => !prev)}
        >
          <span className="material-symbols-outlined text-[18px]">tune</span> More Filters
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View Mode Toggle */}
        <fieldset
          className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden"
          aria-label="View mode"
        >
          <legend className="sr-only">View mode</legend>
          <button
            type="button"
            className={`inline-flex items-center justify-center h-10 w-10 transition-colors ${
              viewMode === 'kanban'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            onClick={() => onViewModeChange?.('kanban')}
            aria-pressed={viewMode === 'kanban'}
            aria-label="Kanban view"
          >
            <span className="material-symbols-outlined text-[20px]">view_kanban</span>
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center h-10 w-10 transition-colors ${
              viewMode === 'list'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            onClick={() => onViewModeChange?.('list')}
            aria-pressed={viewMode === 'list'}
            aria-label="List view"
          >
            <span className="material-symbols-outlined text-[20px]">view_list</span>
          </button>
        </fieldset>
      </div>

      {/* Advanced Filters Panel (IFC-287 F-11) — wires to real list query params */}
      {showMore && (
        <div
          id="deal-advanced-filters"
          className="flex flex-wrap items-end gap-3 p-4 mt-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="deal-search-filter"
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Search
            </label>
            <input
              id="deal-search-filter"
              type="search"
              value={value.search ?? ''}
              onChange={handleSearchChange}
              placeholder="Name or description"
              className="rounded-lg bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="deal-min-value-filter"
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Min Value
            </label>
            <input
              id="deal-min-value-filter"
              type="number"
              min={0}
              value={value.minValue ?? ''}
              onChange={handleMinValueChange}
              placeholder="0"
              className="w-32 rounded-lg bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="deal-max-value-filter"
              className="text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              Max Value
            </label>
            <input
              id="deal-max-value-filter"
              type="number"
              min={0}
              value={value.maxValue ?? ''}
              onChange={handleMaxValueChange}
              placeholder="Any"
              className="w-32 rounded-lg bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
});
