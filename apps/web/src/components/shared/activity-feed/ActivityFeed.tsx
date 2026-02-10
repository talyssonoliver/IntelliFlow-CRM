'use client';

/**
 * Activity Feed Component
 * IFC-069: Unified Activity Feed Service
 *
 * Virtualized infinite-scrolling activity feed with type/source filtering.
 * Uses @tanstack/react-virtual for efficient rendering of large lists.
 */

import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useActivityFeed, type UseActivityFeedOptions } from '@/hooks/useActivityFeed';
import { ActivityFeedItem } from './ActivityFeedItem';

interface ActivityFeedProps extends UseActivityFeedOptions {
  /** Height of the feed container. Defaults to 'auto' (no scroll container). */
  height?: number | string;
  /** CSS class for the root container */
  className?: string;
  /** Empty state message */
  emptyMessage?: string;
}

/** Estimated height of each feed item in pixels (for virtualizer) */
const ESTIMATED_ITEM_SIZE = 88;

export function ActivityFeed({
  height = 600,
  className = '',
  emptyMessage = 'No activities yet',
  ...feedOptions
}: ActivityFeedProps) {
  const {
    items,
    isLoading,
    isError,
    error,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useActivityFeed(feedOptions);

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

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex gap-3 py-3 px-4">
            <div className="w-8 h-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={`p-4 text-center ${className}`}>
        <p className="text-sm text-destructive">
          Failed to load activity feed: {error?.message || 'Unknown error'}
        </p>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const containerStyle = typeof height === 'number'
    ? { height: `${height}px`, overflow: 'auto' as const }
    : { height, overflow: 'auto' as const };

  return (
    <div ref={parentRef} className={className} style={containerStyle}>
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
              <ActivityFeedItem
                id={item.id}
                source={item.source}
                type={item.type}
                title={item.title}
                description={item.description}
                timestamp={item.timestamp as Date | string}
                actor={item.actor}
                entity={item.entity}
              />
            </div>
          );
        })}
      </div>

      {/* Loading indicator at bottom */}
      {isFetchingNextPage && (
        <div className="py-4 text-center">
          <span className="text-xs text-muted-foreground">Loading more...</span>
        </div>
      )}
    </div>
  );
}
