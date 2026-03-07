'use client';

/**
 * Activity Feed Component
 * IFC-069: Unified Activity Feed Service
 *
 * Matches home-authenticated.html mockup layout:
 * - divide-y separators between items
 * - "Load More Updates" button at bottom
 * - Virtualized rendering for large lists
 * - Supports internal (hook-driven) and external (parent-provided) data modes
 */

import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useActivityFeed, type UseActivityFeedOptions } from '@/hooks/useActivityFeed';
import { ActivityFeedItem, type ActivityFeedItemProps } from './ActivityFeedItem';

interface ActivityFeedBaseProps {
  /** Height of the feed container. Defaults to 400. */
  height?: number | string;
  /** CSS class for the root container */
  className?: string;
  /** Empty state message */
  emptyMessage?: string;
}

/** Internal mode: component fetches its own data */
interface ActivityFeedInternalProps extends ActivityFeedBaseProps, UseActivityFeedOptions {
  /** If items is provided, operates in external data mode */
  items?: never;
}

/** External mode: parent provides items and pagination */
interface ActivityFeedExternalProps extends ActivityFeedBaseProps {
  items: ActivityFeedItemProps[];
  isLoading?: boolean;
  isError?: boolean;
  error?: { message: string } | null;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
}

export type ActivityFeedProps = ActivityFeedInternalProps | ActivityFeedExternalProps;

/** Estimated height of each feed item in pixels (for virtualizer) — increased for mockup layout */
const ESTIMATED_ITEM_SIZE = 120;

interface ResolvedFeedData {
  items: ActivityFeedItemProps[];
  isLoading: boolean;
  isError: boolean;
  error: { message: string } | null;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}

function resolveDataSource(
  props: ActivityFeedProps,
  internal: ReturnType<typeof useActivityFeedConditional>
): ResolvedFeedData {
  const isExternal = 'items' in props && props.items !== undefined;
  if (!isExternal) {
    return {
      items: internal.items,
      isLoading: internal.isLoading,
      isError: internal.isError,
      error: internal.error,
      isFetchingNextPage: internal.isFetchingNextPage,
      hasNextPage: internal.hasNextPage,
      fetchNextPage: internal.fetchNextPage,
    };
  }
  const ext = props as ActivityFeedExternalProps;
  return {
    items: ext.items,
    isLoading: ext.isLoading ?? false,
    isError: ext.isError ?? false,
    error: ext.error ?? null,
    isFetchingNextPage: ext.isFetchingNextPage ?? false,
    hasNextPage: ext.hasNextPage ?? false,
    fetchNextPage: ext.fetchNextPage ?? (() => {}),
  };
}

export function ActivityFeed(props: Readonly<ActivityFeedProps>) {
  const { height = 400, className = '', emptyMessage = 'No recent activity' } = props;

  // Resolve data source: internal hook or external props
  const internal = useActivityFeedConditional(props);

  const { items, isLoading, isError, error, isFetchingNextPage, hasNextPage, fetchNextPage } =
    resolveDataSource(props, internal);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ITEM_SIZE,
    overscan: 5,
  });

  // Infinite scroll: load more when the user scrolls near the bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    const nearBottom = scrollTop + clientHeight >= scrollHeight - 200;

    if (nearBottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Loading state — skeleton matching mockup layout (p-5 padding, size-10 avatar)
  if (isLoading) {
    return (
      <div className={`divide-y divide-[#e2e8f0] dark:divide-[#334155] ${className}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-3 p-5"> {/* NOSONAR typescript:S6479 */}
            <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <span className="material-symbols-outlined text-4xl mb-2 text-slate-400">error</span>
        <p className="text-sm text-red-500">{error?.message || 'Failed to load activity feed'}</p>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className={`p-8 text-center text-slate-500 dark:text-slate-400 ${className}`}>
        <span className="material-symbols-outlined text-4xl mb-2 block">inbox</span>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const containerStyle =
    typeof height === 'number'
      ? { height: `${height}px`, overflow: 'auto' as const }
      : { height, overflow: 'auto' as const };

  return (
    <div className={className} role="feed" aria-busy={isLoading}>
      <div ref={parentRef} style={containerStyle}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index];
            if (!item) return null;

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
              >
                {/* Divider between items (not before first) */}
                {virtualItem.index > 0 && (
                  <div className="border-t border-[#e2e8f0] dark:border-[#334155]" />
                )}
                <ActivityFeedItem
                  id={item.id}
                  source={item.source}
                  type={item.type}
                  title={item.title}
                  description={item.description}
                  timestamp={item.timestamp}
                  actor={item.actor}
                  entity={item.entity}
                  metadata={item.metadata}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* "Load More Updates" footer — matching mockup */}
      <div className="p-4 border-t border-[#e2e8f0] dark:border-[#334155] text-center">
        {isFetchingNextPage && (
          <span className="flex items-center gap-2 justify-center text-sm text-slate-500">
            <span className="material-symbols-outlined animate-spin text-sm">
              progress_activity
            </span>{' '}
            Loading...
          </span>
        )}
        {!isFetchingNextPage && hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            className="text-sm font-medium text-slate-500 hover:text-[#137fec] transition-colors"
          >
            Load More Updates
          </button>
        )}
        {!isFetchingNextPage && !hasNextPage && (
          <span className="text-sm text-slate-400">You&apos;re all caught up</span>
        )}
      </div>
    </div>
  );
}

/**
 * Conditional hook: only fetches when in internal data mode.
 * When items are provided externally, returns no-op defaults.
 */
function useActivityFeedConditional(props: Readonly<ActivityFeedProps>) {
  const isExternal = 'items' in props && props.items !== undefined;

  // Always call the hook (React rules) but disable it when external data is provided
  const feedOptions: UseActivityFeedOptions = isExternal
    ? { enabled: false }
    : (props as ActivityFeedInternalProps);

  return useActivityFeed(feedOptions);
}
