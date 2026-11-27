'use client';

import type { ActivityType } from '@/lib/leads/lead-format';
import { ACTIVITY_TYPE_FILTERS } from '@/lib/leads/activity-feed';

function getSentimentTrendStyle(trend?: string): string {
  switch (trend) {
    case 'improving':
      return 'text-green-600';
    case 'declining':
      return 'text-red-600';
    default:
      return 'text-slate-600';
  }
}

// Lead activity tab filter bar (moved out of the lead page) ──────────────────────────────────────────────────

interface ActivityFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activityTypeFilter: ActivityType | 'all';
  onTypeFilterChange: (f: ActivityType | 'all') => void;
  personFilter: string;
  onPersonFilterChange: (p: string) => void;
  personFilters: { value: string; label: string }[];
  showPeople: boolean;
  aiInsightsSentimentTrend: string | null;
  aiInsightsLastEngagementDays: number;
  onClearFilters: () => void;
}

export function ActivityFilterBar({
  searchQuery,
  onSearchChange,
  activityTypeFilter,
  onTypeFilterChange,
  personFilter,
  onPersonFilterChange,
  personFilters,
  showPeople,
  aiInsightsSentimentTrend,
  aiInsightsLastEngagementDays,
  onClearFilters,
}: ActivityFilterBarProps) {
  return (
    <div className="mb-6 space-y-4">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 !text-[18px] text-slate-400">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search activities..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-[#2a78f6] focus:ring-1 focus:ring-[#2a78f6] placeholder:text-slate-400"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {ACTIVITY_TYPE_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onTypeFilterChange(filter.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activityTypeFilter === filter.value
                ? 'bg-[#2a78f6] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>{filter.icon}</span> {filter.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {showPeople && (
          <>
            <span className="text-xs text-slate-500 font-medium">Filter by:</span>
            <select
              value={personFilter}
              onChange={(e) => onPersonFilterChange(e.target.value)}
              aria-label="Filter by person"
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-[#2a78f6] focus:ring-1 focus:ring-[#2a78f6]"
            >
              {personFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </>
        )}
        {(activityTypeFilter !== 'all' || personFilter !== 'all' || searchQuery) && (
          <button onClick={onClearFilters} className="text-xs text-[#2a78f6] hover:underline">
            Clear filters
          </button>
        )}
      </div>
      {aiInsightsSentimentTrend && (
        <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-lg border border-blue-100 dark:border-slate-700">
          <div className="w-8 h-8 rounded-full bg-[#2a78f6]/10 flex items-center justify-center">
            <span className="material-symbols-outlined !text-[18px] text-[#2a78f6]">
              auto_awesome
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Sentiment is{' '}
              <span className={getSentimentTrendStyle(aiInsightsSentimentTrend)}>
                {aiInsightsSentimentTrend}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              Last engagement: {aiInsightsLastEngagementDays} day
              {aiInsightsLastEngagementDays === 1 ? '' : 's'} ago
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
