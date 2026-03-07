'use client';

/**
 * Activity Feed Filters Component
 * IFC-069: Unified Activity Feed Service
 *
 * Provides filtering controls for the activity feed:
 * - Search by text (title/description)
 * - Filter by activity type (chip toggles)
 * - Filter by source
 * - Date range selection
 */

import { useState, useCallback, useMemo } from 'react';
import type { ActivityFeedType, ActivityFeedSource } from '@intelliflow/domain';
import { ACTIVITY_FEED_TYPES, ACTIVITY_FEED_SOURCES } from '@intelliflow/domain';

export interface ActivityFeedFilterValues {
  search: string;
  types: ActivityFeedType[];
  sources: ActivityFeedSource[];
  after?: Date;
  before?: Date;
}

export interface ActivityFeedFiltersProps {
  /** Current filter values */
  values?: Partial<ActivityFeedFilterValues>;
  /** Called when any filter changes */
  onChange: (filters: Readonly<ActivityFeedFilterValues>) => void;
  /** Show search input. Defaults to true. */
  showSearch?: boolean;
  /** Show source filter chips. Defaults to false. */
  showSources?: boolean;
  /** Show date range inputs. Defaults to false. */
  showDateRange?: boolean;
  /** CSS class for the root container */
  className?: string;
}

/** Human-readable labels for activity types */
const TYPE_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  CALL: 'Call',
  MEETING: 'Meeting',
  NOTE: 'Note',
  TASK: 'Task',
  CHAT: 'Chat',
  DOCUMENT: 'Document',
  DEAL: 'Deal',
  TICKET: 'Ticket',
  STAGE_CHANGE: 'Stage Change',
  STATUS_CHANGE: 'Status Change',
  SCORE_UPDATE: 'Score Update',
  QUALIFICATION: 'Qualification',
  AGENT_ACTION: 'AI Action',
  SLA_ALERT: 'SLA Alert',
  ASSIGNMENT: 'Assignment',
  SYSTEM: 'System',
};

/** Human-readable labels for sources */
const SOURCE_LABELS: Record<string, string> = {
  LEAD_ACTIVITY: 'Leads',
  CONTACT_ACTIVITY: 'Contacts',
  OPPORTUNITY_EVENT: 'Deals',
  TICKET_ACTIVITY: 'Tickets',
  EMAIL: 'Email',
  CALL: 'Calls',
  CHAT: 'Chat',
};

const DEFAULT_VALUES: ActivityFeedFilterValues = {
  search: '',
  types: [],
  sources: [],
};

export function ActivityFeedFilters({
  values,
  onChange,
  showSearch = true,
  showSources = false,
  showDateRange = false,
  className = '',
}: Readonly<ActivityFeedFiltersProps>) {
  const current = useMemo(() => ({ ...DEFAULT_VALUES, ...values }), [values]);

  const [searchInput, setSearchInput] = useState(current.search);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchInput(value);
      onChange({ ...current, search: value });
    },
    [current, onChange]
  );

  const toggleType = useCallback(
    (type: Readonly<ActivityFeedType>) => {
      const next = current.types.includes(type)
        ? current.types.filter((t) => t !== type)
        : [...current.types, type];
      onChange({ ...current, types: next });
    },
    [current, onChange]
  );

  const toggleSource = useCallback(
    (source: Readonly<ActivityFeedSource>) => {
      const next = current.sources.includes(source)
        ? current.sources.filter((s) => s !== source)
        : [...current.sources, source];
      onChange({ ...current, sources: next });
    },
    [current, onChange]
  );

  const handleAfterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value ? new Date(e.target.value) : undefined;
      onChange({ ...current, after: value });
    },
    [current, onChange]
  );

  const handleBeforeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value ? new Date(e.target.value) : undefined;
      onChange({ ...current, before: value });
    },
    [current, onChange]
  );

  const hasActiveFilters =
    current.search.length > 0 ||
    current.types.length > 0 ||
    current.sources.length > 0 ||
    current.after !== undefined ||
    current.before !== undefined;

  const clearFilters = useCallback(() => {
    setSearchInput('');
    onChange({ ...DEFAULT_VALUES });
  }, [onChange]);

  return (
    <div className={`space-y-3 ${className}`} data-testid="activity-feed-filters">
      {/* Search */}
      {showSearch && (
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            search
          </span>
          <input
            type="text"
            placeholder="Search activity..."
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec]/30 focus:border-[#137fec]"
            aria-label="Search activity feed"
          />
        </div>
      )}

      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by activity type">
        {ACTIVITY_FEED_TYPES.map((type) => {
          const isActive = current.types.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                isActive
                  ? 'bg-[#137fec] text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
              aria-pressed={isActive}
              aria-label={`Filter by ${TYPE_LABELS[type] || type}`}
            >
              {TYPE_LABELS[type] || type}
            </button>
          );
        })}
      </div>

      {/* Source filter chips (optional) */}
      {showSources && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by source">
          {ACTIVITY_FEED_SOURCES.map((source) => {
            const isActive = current.sources.includes(source);
            return (
              <button
                key={source}
                onClick={() => toggleSource(source)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  isActive
                    ? 'bg-[#137fec] text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
                aria-pressed={isActive}
                aria-label={`Filter by ${SOURCE_LABELS[source] || source}`}
              >
                {SOURCE_LABELS[source] || source}
              </button>
            );
          })}
        </div>
      )}

      {/* Date range (optional) */}
      {showDateRange && (
        <div className="flex gap-2 items-center">
          <label htmlFor="activity-filter-after" className="text-xs text-slate-500">
            From:
          </label>
          <input
            id="activity-filter-after"
            type="date"
            onChange={handleAfterChange}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            aria-label="Activity after date"
          />
          <label htmlFor="activity-filter-before" className="text-xs text-slate-500">
            To:
          </label>
          <input
            id="activity-filter-before"
            type="date"
            onChange={handleBeforeChange}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            aria-label="Activity before date"
          />
        </div>
      )}

      {/* Clear button */}
      {hasActiveFilters && (
        <button onClick={clearFilters} className="text-xs text-[#137fec] hover:underline">
          Clear all filters
        </button>
      )}
    </div>
  );
}
