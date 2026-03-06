'use client';

import { useCallback, useMemo, useState } from 'react';
import { Card } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import {
  ActivityFeed,
  ActivityFeedTypeFilter,
  type ActivityFeedTypeFilterValue,
} from '@/components/shared/activity-feed';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import type { ActivityFeedType } from '@intelliflow/domain';

const DEFAULT_FILTER: ActivityFeedTypeFilterValue = 'all';

export default function ActivityPage() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const [feedFilter, setFeedFilter] = useState<ActivityFeedTypeFilterValue>(DEFAULT_FILTER);

  const feedTypes = useMemo(
    () => (feedFilter === 'all' ? undefined : [feedFilter as ActivityFeedType]),
    [feedFilter]
  );

  const hasActiveFilter = feedFilter !== DEFAULT_FILTER;

  const handleClearFilters = useCallback(() => {
    setFeedFilter(DEFAULT_FILTER);
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
          <div className="p-5 border-b border-[#e2e8f0] dark:border-[#334155] flex justify-between items-center">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
              All Activity
            </h2>
            <ActivityFeedTypeFilter value={feedFilter} onChange={setFeedFilter} />
          </div>
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
          />
        </Card>
      </div>
    </div>
  );
}
