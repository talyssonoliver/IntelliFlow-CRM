/**
 * DealFilters Component (PG-135)
 *
 * Filter bar with owner filter, date range, and view mode toggle.
 * New component (not extraction).
 *
 * @module DealFilters
 * AC-9: Filter bar supports owner filter and date range filter
 */

import * as React from 'react';
import type { DealFiltersValue } from './types';

interface DealFiltersProps {
  readonly value: DealFiltersValue;
  readonly onChange: (filters: DealFiltersValue) => void;
  readonly viewMode?: 'kanban' | 'list';
  readonly onViewModeChange?: (mode: 'kanban' | 'list') => void;
}

const DATE_RANGE_OPTIONS = [
  { value: '', label: 'All Time' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
] as const;

export const DealFilters = React.memo(function DealFilters({
  value,
  onChange,
  viewMode = 'kanban',
  onViewModeChange,
}: DealFiltersProps) {
  const handleOwnerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ownerId = e.target.value || undefined;
    onChange({ ...value, ownerId });
  };

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dateRange = (e.target.value || undefined) as DealFiltersValue['dateRange'];
    onChange({ ...value, dateRange });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4" role="toolbar" aria-label="Deal filters">
      {/* Owner Filter */}
      <div className="flex items-center gap-2">
        <label htmlFor="deal-owner-filter" className="text-sm text-muted-foreground sr-only">
          Owner
        </label>
        <select
          id="deal-owner-filter"
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={value.ownerId ?? ''}
          onChange={handleOwnerChange}
          aria-label="Filter by owner"
        >
          <option value="">All Deals</option>
          <option value="me">My Deals</option>
        </select>
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2">
        <label htmlFor="deal-date-filter" className="text-sm text-muted-foreground sr-only">
          Date Range
        </label>
        <select
          id="deal-date-filter"
          className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
      </div>

      {/* More Filters */}
      <button
        type="button"
        className="h-9 px-3 rounded-md border border-input bg-background text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="More filters"
      >
        <span className="material-symbols-outlined text-sm mr-1">filter_list</span>
        More Filters
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 border border-input rounded-md" role="group" aria-label="View mode">
        <button
          type="button"
          className={`h-9 px-3 text-sm rounded-l-md transition-colors ${
            viewMode === 'kanban'
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => onViewModeChange?.('kanban')}
          aria-pressed={viewMode === 'kanban'}
          aria-label="Kanban view"
        >
          <span className="material-symbols-outlined text-sm">view_kanban</span>
        </button>
        <button
          type="button"
          className="h-9 px-3 text-sm rounded-r-md bg-background text-muted-foreground cursor-not-allowed opacity-50"
          disabled
          title="Coming soon"
          aria-label="List view (coming soon)"
        >
          <span className="material-symbols-outlined text-sm">view_list</span>
        </button>
      </div>
    </div>
  );
});
