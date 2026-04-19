'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import {
  ActivityFeed,
  ActivityFeedTypeFilter,
  ActivityFeedStatsBar,
  type ActivityFeedTypeFilterValue,
} from '@/components/shared/activity-feed';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useActivityFeedSearch } from '@/hooks/useActivityFeedSearch';
import type { ActivityFeedType } from '@intelliflow/domain';

const DEFAULT_FILTER: ActivityFeedTypeFilterValue = 'all';

export default function ActivityPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const [feedFilter, setFeedFilter] = useState<ActivityFeedTypeFilterValue>(DEFAULT_FILTER);
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const deferredSearch = useDeferredValue(searchInput);
  const selectedActivityId = searchParams.get('activityId');

  // Sync URL ?q= param when navigating from header search.
  // Functional update avoids reading searchInput from closure, so the effect
  // only fires on URL changes without needing searchInput as a dep.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setSearchInput((prev) => (q === prev ? prev : q));
    }
  }, [searchParams]);

  const feedTypes = useMemo(
    () => (feedFilter === 'all' ? undefined : [feedFilter as ActivityFeedType]),
    [feedFilter]
  );

  const search = useActivityFeedSearch({
    query: deferredSearch,
    limit: 50,
    types: feedTypes,
    enabled: isAuthenticated,
  });

  const hasActiveFilter = feedFilter !== DEFAULT_FILTER || searchInput.length > 0;

  const handleClearFilters = useCallback(() => {
    setFeedFilter(DEFAULT_FILTER);
    setSearchInput('');
  }, []);

  if (authLoading) {
    return (
      <div className="p-6 lg:p-8 bg-background-light dark:bg-background-dark min-h-[calc(100vh-4rem)]">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-4">
          <div className="h-8 w-48 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-4 w-80 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-[520px] rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="p-6 lg:p-8 bg-background-light dark:bg-background-dark min-h-[calc(100vh-4rem)]">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
        <PageHeader
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Activity' }]}
          title="Activity Log"
          description="Unified activity across leads, contacts, accounts, deals, tickets, email, calls, and chat."
          actions={[
            {
              label: 'Clear Filter',
              icon: 'filter_alt_off',
              variant: 'secondary',
              onClick: handleClearFilters,
              disabled: !hasActiveFilter,
            },
          ]}
        />

        <Card className="p-0 overflow-hidden">
          <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              All Activity
            </h2>
            <div className="flex items-center gap-3">
              {/* IFC-203: Full-text search input wired to activityFeed.search */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search activity..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-48 sm:w-56 pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec]/30 focus:border-[#137fec]"
                  aria-label="Search activity feed"
                />
              </div>
              <ActivityFeedTypeFilter value={feedFilter} onChange={setFeedFilter} />
            </div>
          </div>
          {/* IFC-202: Activity stats summary */}
          <div className="px-5 py-2.5 border-b border-[#e2e8f0] dark:border-[#334155] bg-slate-50/50 dark:bg-slate-800/20">
            <ActivityFeedStatsBar timeWindow="30d" enabled={isAuthenticated} maxTypes={5} />
          </div>
          {search.isSearchActive ? (
            <ActivityFeed
              items={search.items}
              isLoading={search.isLoading}
              isError={search.isError}
              error={search.error}
              isFetchingNextPage={search.isFetchingNextPage}
              hasNextPage={search.hasNextPage}
              fetchNextPage={search.fetchNextPage}
              height={680}
              className="p-3 sm:p-4"
              emptyMessage="No activity matches your search"
              selectedId={selectedActivityId}
            />
          ) : (
            <ActivityFeed
              limit={50}
              types={feedTypes}
              enabled={isAuthenticated}
              height={680}
              className="p-3 sm:p-4"
              emptyMessage={
                hasActiveFilter
                  ? 'No activity matches the selected filter'
                  : 'No activity recorded yet'
              }
              selectedId={selectedActivityId}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
