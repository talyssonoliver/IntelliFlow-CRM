'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'email'
  | 'call'
  | 'meeting'
  | 'chat'
  | 'document'
  | 'deal'
  | 'ticket'
  | 'note';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  user: string;
  metadata?: Record<string, unknown>;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ActivityTimelineProps {
  contactId: string;
  activities: Activity[];
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSearch?: (query: string) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const activityTypeFilters: { value: ActivityType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: 'list' },
  { value: 'email', label: 'Emails', icon: 'mail' },
  { value: 'call', label: 'Calls', icon: 'phone' },
  { value: 'meeting', label: 'Meetings', icon: 'event' },
  { value: 'chat', label: 'Chats', icon: 'chat' },
  { value: 'document', label: 'Documents', icon: 'description' },
  { value: 'deal', label: 'Deals', icon: 'handshake' },
  { value: 'ticket', label: 'Tickets', icon: 'confirmation_number' },
  { value: 'note', label: 'Notes', icon: 'note' },
];

const activityIconBg: Record<ActivityType, string> = {
  email: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
  call: 'bg-green-100 dark:bg-green-900/30 text-green-600',
  meeting: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
  chat: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
  document: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600',
  deal: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600',
  ticket: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600',
  note: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
};

const activityIcons: Record<ActivityType, string> = {
  email: 'mail',
  call: 'phone',
  meeting: 'event',
  chat: 'chat',
  document: 'description',
  deal: 'handshake',
  ticket: 'confirmation_number',
  note: 'note',
};

const sentimentConfig: Record<string, { icon: string; label: string; className: string }> = {
  positive: {
    icon: 'sentiment_satisfied',
    label: 'Positive sentiment',
    className: 'text-green-500',
  },
  neutral: { icon: 'sentiment_neutral', label: 'Neutral sentiment', className: 'text-slate-400' },
  negative: {
    icon: 'sentiment_dissatisfied',
    label: 'Negative sentiment',
    className: 'text-red-500',
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string, timezone: string = 'Europe/London') {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone });
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function ActivityTimeline({
  activities,
  isLoading,
  hasMore,
  onLoadMore,
  onSearch,
}: Readonly<ActivityTimelineProps>) {
  const { timezone } = useTimezoneContext();
  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const resultCountId = 'activity-result-count';

  // Filter activities
  const filtered = activities.filter((a) => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.user.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      onSearch?.(value);
    },
    [onSearch]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!hasMore || !onLoadMore || !loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (isLoading) {
    return (
      <div
        role="status" // NOSONAR typescript:S6819 — loading state indicator; <output> is for form computation results
        aria-busy="true"
        className="space-y-4 p-6"
      >
        <span className="sr-only">Loading activities...</span>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search activities..."
          aria-label="Search activities"
          aria-describedby={resultCountId}
          className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-slate-400"
        />
      </div>

      {/* Type Filters (radio group) */}
      <div role="radiogroup" aria-label="Filter by activity type" className="flex flex-wrap gap-2">
        {activityTypeFilters.map((filter) => (
          <button
            key={filter.value}
            role="radio" // NOSONAR typescript:S6819 — styled button acts as radio button in a radiogroup; <input type="radio"> cannot contain icon/label children
            aria-checked={typeFilter === filter.value}
            onClick={() => setTypeFilter(filter.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              typeFilter === filter.value
                ? 'bg-primary text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {filter.icon}
            </span>
            {filter.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div id={resultCountId} aria-live="polite" className="text-sm text-slate-500">
        Showing {filtered.length} of {activities.length} activities
      </div>

      {/* Timeline */}
      {filtered.length > 0 ? (
        <ol aria-label="Activity timeline, newest first" className="relative space-y-4 pl-4">
          {filtered.map((activity) => {
            const isExpanded = expandedIds.has(activity.id);
            const detailPanelId = `detail-${activity.id}`;
            const sentiment = activity.sentiment ? sentimentConfig[activity.sentiment] : null;

            return (
              <li key={activity.id} className="relative">
                {/* Timeline line */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700 -ml-4"
                  aria-hidden="true"
                />

                {/* Activity Card */}
                <div className="relative ml-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                  {/* Timeline dot */}
                  <div
                    className={`absolute -left-8 top-4 w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center z-10 ${activityIconBg[activity.type]}`}
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined text-base">
                      {activityIcons[activity.type]}
                    </span>
                  </div>

                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {activity.title}
                        </p>
                        {sentiment && (
                          <span className={sentiment.className} title={sentiment.label}>
                            <span
                              className="material-symbols-outlined text-base"
                              aria-hidden="true"
                            >
                              {sentiment.icon}
                            </span>
                            <span className="sr-only">{sentiment.label}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                        {activity.description}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {activity.user} &bull;{' '}
                        <time dateTime={activity.timestamp}>
                          {formatRelativeTime(activity.timestamp, timezone)}
                        </time>
                      </p>
                    </div>
                    <button
                      aria-expanded={isExpanded}
                      aria-controls={detailPanelId}
                      aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      onClick={() => toggleExpand(activity.id)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      <span
                        className={`material-symbols-outlined text-lg transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        expand_more
                      </span>
                    </button>
                  </div>

                  {/* Expandable Details */}
                  {isExpanded && (
                    <div
                      id={detailPanelId}
                      className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800"
                    >
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Full details for {activity.title}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="text-center py-12">
          <span
            className="material-symbols-outlined text-4xl text-slate-300 mb-4"
            aria-hidden="true"
          >
            search_off
          </span>
          <p className="text-slate-500">No activities match your filters</p>
        </div>
      )}

      {/* Infinite scroll trigger */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          <span className="text-sm text-slate-500">Load more...</span>
        </div>
      )}
    </div>
  );
}
