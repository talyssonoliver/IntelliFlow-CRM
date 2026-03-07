'use client';

/**
 * NotificationFilters — Filter bar for the Notifications Inbox
 *
 * Composes SearchFilterBar with notification-specific filter configuration:
 * tab pills (all/unread/high), type dropdown (grouped), priority dropdown,
 * and search input with proper ARIA attributes.
 *
 * Task: PG-130 — Notifications Inbox Page
 */

import { useMemo } from 'react';
import { SearchFilterBar, type FilterOption } from '@/components/shared';
import { getTypeFilterOptions } from './notification-utils';

export interface NotificationFiltersProps {
  /** Current search query */
  searchQuery: string;
  /** Callback when search changes */
  onSearchChange: (value: string) => void;
  /** Current type filter value */
  typeFilter: string;
  /** Callback when type filter changes */
  onTypeChange: (value: string) => void;
  /** Current priority filter value */
  priorityFilter: string;
  /** Callback when priority filter changes */
  onPriorityChange: (value: string) => void;
  /** Active tab: 'all' | 'unread' | 'high' */
  activeTab: string;
  /** Callback when tab changes */
  onTabChange: (value: string) => void;
  /** Number of unread notifications */
  unreadCount?: number;
  /** Number of high-priority unread notifications */
  highPriorityCount?: number;
  /** Callback to clear all filters */
  onClearFilters?: () => void;
}

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export function NotificationFilters({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeChange,
  priorityFilter,
  onPriorityChange,
  activeTab,
  onTabChange,
  unreadCount = 0,
  highPriorityCount = 0,
  onClearFilters,
}: Readonly<NotificationFiltersProps>) {
  const typeOptions = getTypeFilterOptions();

  const filterChips = useMemo(
    () => ({
      options: [
        { id: 'all', label: 'All' },
        { id: 'unread', label: 'Unread' + (unreadCount > 0 ? ` (${unreadCount})` : '') },
        {
          id: 'high',
          label: 'High Priority' + (highPriorityCount > 0 ? ` (${highPriorityCount})` : ''),
          color: 'bg-red-500',
        },
      ],
      value: activeTab,
      onChange: onTabChange,
    }),
    [activeTab, onTabChange, unreadCount, highPriorityCount]
  );

  const hasActiveFilters = searchQuery || typeFilter || priorityFilter || activeTab !== 'all';

  return (
    <div role="search" aria-label="Filter notifications">
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search notifications..."
        searchAriaLabel="Search notifications"
        filters={[
          {
            id: 'type',
            label: 'Type',
            icon: 'category',
            options: typeOptions,
            value: typeFilter,
            onChange: onTypeChange,
          },
          {
            id: 'priority',
            label: 'Priority',
            icon: 'flag',
            options: PRIORITY_OPTIONS,
            value: priorityFilter,
            onChange: onPriorityChange,
          },
        ]}
        filterChips={filterChips}
      />
      {hasActiveFilters && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
