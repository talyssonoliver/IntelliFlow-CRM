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
import { SystemUpdatesGroup } from '@/components/leads/SystemUpdatesGroup';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { useActivityFeedSearch } from '@/hooks/useActivityFeedSearch';
import type { ActivityFeedItemProps } from '@/components/shared/activity-feed/ActivityFeedItem';
import { emptyFeedMessage, splitActivityLog } from '@/lib/activity/activity-log-split';
import type { ActivityFeedType } from '@intelliflow/domain';

const DEFAULT_FILTER: ActivityFeedTypeFilterValue = 'all';
/** Keep loading older pages while the person-written feed is this short (the system writes most). */
const MIN_PERSONAL_ENTRIES = 10;
/** ...but never request more than this many pages (of 50) just to find them. */
const MAX_AUTO_PAGES = 10;

export default function ActivityPage() {
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const [feedFilter, setFeedFilter] = useState<ActivityFeedTypeFilterValue>(DEFAULT_FILTER);
  const [mineOnly, setMineOnly] = useState(false);
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

  // "All Activity" folds the system's entries into one group; picking a type shows that type as is.
  // The feed is read whole and split here: the API filters by type after limiting each source's
  // rows, so asking it for "everything but the system's types" could hide older entries.
  const foldSystem = feedFilter === 'all';
  const feedTypes = useMemo(
    () => (foldSystem ? undefined : [feedFilter as ActivityFeedType]),
    [feedFilter, foldSystem]
  );

  const search = useActivityFeedSearch({
    query: deferredSearch,
    limit: 50,
    types: feedTypes,
    enabled: isAuthenticated,
  });
  const personalFeed = useActivityFeed({
    limit: 50,
    types: feedTypes,
    enabled: isAuthenticated && !search.isSearchActive,
  });
  const source: {
    items: ActivityFeedItemProps[];
    isLoading: boolean;
    isError: boolean;
    error: { message: string } | null;
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => void;
  } = search.isSearchActive ? search : personalFeed;
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const { personal: personalItems, system: systemItems } = useMemo(
    () =>
      splitActivityLog(source.items, {
        fold: foldSystem,
        mine: mineOnly,
        userId,
        userEmail,
      }),
    [source.items, foldSystem, mineOnly, userId, userEmail]
  );

  // The system writes most of this workspace's entries, so a page of 50 may hold few or none of
  // the person-written ones: keep loading older pages (bounded) until the feed has some.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = source;
  const personalShort = personalItems.length < MIN_PERSONAL_ENTRIES;
  // The budget counts the page requests made, not the entries shown: the feed drops entries that
  // repeat (same title, text and minute), so a count of what is shown would not bound the loading.
  const [autoPages, setAutoPages] = useState(0);
  const autoLoadCapReached = autoPages >= MAX_AUTO_PAGES;
  const viewKey = `${feedFilter}|${mineOnly}|${search.isSearchActive ? deferredSearch : ''}`;
  useEffect(() => setAutoPages(0), [viewKey]);
  // A failed page is not retried by itself (it would fail again in a loop): the button below is.
  const loadFailed = source.isError;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || !personalShort || autoLoadCapReached) return;
    if (loadFailed) return;
    setAutoPages((n) => n + 1);
    fetchNextPage();
  }, [
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    personalShort,
    autoLoadCapReached,
    loadFailed,
  ]);
  // Past the cap, or after a failure, the empty feed has no Load More of its own: offer one here.
  const showLoadOlder = hasNextPage && personalShort && (autoLoadCapReached || loadFailed);

  const hasActiveFilter = feedFilter !== DEFAULT_FILTER || searchInput.length > 0 || mineOnly;
  const deepLinkedSystemId =
    selectedActivityId && systemItems.some((item) => item.id === selectedActivityId)
      ? selectedActivityId
      : null;

  const handleClearFilters = useCallback(() => {
    setFeedFilter(DEFAULT_FILTER);
    setSearchInput('');
    setMineOnly(false);
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
              hideOnMobile: true,
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
                  className="w-48 sm:w-56 pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2a78f6]/30 focus:border-[#2a78f6]"
                  aria-label="Search activity feed"
                />
              </div>
              <button
                type="button"
                onClick={() => setMineOnly((v) => !v)}
                aria-pressed={mineOnly}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  mineOnly
                    ? 'border-[#2a78f6] bg-[#2a78f6]/10 text-[#2a78f6]'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                My activity
              </button>
              <ActivityFeedTypeFilter value={feedFilter} onChange={setFeedFilter} />
            </div>
          </div>
          {/* IFC-202: Activity stats summary */}
          <div className="px-5 py-2.5 border-b border-[#e2e8f0] dark:border-[#334155] bg-slate-50/50 dark:bg-slate-800/20">
            <ActivityFeedStatsBar
              timeWindow="30d"
              enabled={isAuthenticated}
              maxTypes={5}
              showBreakdown
            />
          </div>
          <ActivityFeed
            items={personalItems}
            isLoading={source.isLoading}
            isError={source.isError}
            error={source.error}
            isFetchingNextPage={source.isFetchingNextPage}
            hasNextPage={source.hasNextPage}
            fetchNextPage={source.fetchNextPage}
            height={680}
            className="p-3 sm:p-4"
            emptyMessage={emptyFeedMessage({
              mine: mineOnly,
              filtered: feedFilter !== DEFAULT_FILTER,
              searching: search.isSearchActive,
              systemCount: systemItems.length,
            })}
            selectedId={selectedActivityId}
          />
          {showLoadOlder && (
            <div className="px-5 pb-4 text-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading older activity…' : 'Load older activity'}
              </button>
            </div>
          )}
          {systemItems.length > 0 && (
            <div className="p-3 sm:p-4 border-t border-[#e2e8f0] dark:border-[#334155]">
              <SystemUpdatesGroup
                count={systemItems.length}
                more={hasNextPage}
                deepLinkedId={deepLinkedSystemId}
              >
                <ActivityFeed
                  items={systemItems}
                  hasNextPage={hasNextPage}
                  fetchNextPage={fetchNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  height={480}
                  selectedId={selectedActivityId}
                />
              </SystemUpdatesGroup>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
