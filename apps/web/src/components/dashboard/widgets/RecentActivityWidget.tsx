'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { WidgetProps } from './index';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import {
  ActivityFeedItem,
  ActivityFeedTypeFilter,
  type ActivityFeedTypeFilterValue,
} from '@/components/shared/activity-feed';
import type { ActivityFeedType } from '@intelliflow/domain';

const DEFAULT_MAX_ITEMS = 3;

export function RecentActivityWidget({ config }: Readonly<WidgetProps>) {
  const maxItems = (config?.maxItems as number) || DEFAULT_MAX_ITEMS;
  const [feedFilter, setFeedFilter] = useState<ActivityFeedTypeFilterValue>('all');

  const feedTypes = useMemo(
    () => (feedFilter === 'all' ? undefined : [feedFilter as ActivityFeedType]),
    [feedFilter]
  );

  const { items, isLoading } = useActivityFeed({ limit: maxItems, types: feedTypes });
  const displayActivities = items.slice(0, maxItems);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-6 pb-6 border-b border-border">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Activity</h3>
        <div className="flex items-center gap-2">
          <ActivityFeedTypeFilter value={feedFilter} onChange={setFeedFilter} />
          <Link href="/activity" className="text-sm text-ds-primary hover:underline">
            View All
          </Link>
        </div>
      </div>

      <div className="flex flex-col flex-1 divide-y divide-border overflow-hidden">
        {displayActivities.length > 0 &&
          displayActivities.map((activity) => (
            <ActivityFeedItem
              key={activity.id}
              id={activity.id}
              source={activity.source}
              type={activity.type}
              title={activity.title}
              description={activity.description}
              timestamp={activity.timestamp}
              actor={activity.actor}
              entity={activity.entity}
              metadata={activity.metadata}
            />
          ))}
        {displayActivities.length === 0 && !isLoading && (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border m-5 p-4">
            <p className="text-xs text-muted-foreground text-center">No recent activity yet.</p>
          </div>
        )}
        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">Loading activity...</p>
          </div>
        )}
      </div>
    </div>
  );
}
