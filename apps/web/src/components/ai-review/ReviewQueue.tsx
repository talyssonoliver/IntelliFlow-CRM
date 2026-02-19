'use client';

/**
 * ReviewQueue — AI Output Review queue container (IFC-181)
 *
 * Uses existing shared components:
 * - SearchFilterBar + useMultiFilterState from shared
 * - EmptyState, Skeleton, Card from @intelliflow/ui
 * - ReviewCard from ./ReviewCard
 * - useReviewQueue from hooks
 */

import { useCallback } from 'react';
import {
  Card,
  CardContent,
  Button,
  Skeleton,
  EmptyState,
  Switch,
  Slider,
  cn,
} from '@intelliflow/ui';
import { SearchFilterBar, useMultiFilterState } from '@/components/shared/search-filter-bar';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useReviewQueue } from '@/lib/ai-review/hooks';
import { ReviewCard } from './ReviewCard';
import type { ReviewListFilter, ReviewResponse } from '@intelliflow/validators/ai-review';
import { REVIEW_STATUSES, AI_OUTPUT_TYPES } from '@intelliflow/domain';

// ============================================
// Stats Card (internal)
// ============================================

function StatCard({
  label,
  value,
  icon,
  colorClass,
  isLoading,
}: {
  label: string;
  value: number;
  icon: string;
  colorClass: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', colorClass)}>
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {icon}
            </span>
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Filter options
// ============================================

const STATUS_OPTIONS = REVIEW_STATUSES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' '),
}));

const OUTPUT_TYPE_OPTIONS = AI_OUTPUT_TYPES.map((t) => ({
  value: t,
  label: t
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()),
}));

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Newest First' },
  { value: 'createdAt_asc', label: 'Oldest First' },
  { value: 'slaDeadline_asc', label: 'SLA Deadline (Closest)' },
  { value: 'confidence_asc', label: 'Confidence (Low to High)' },
  { value: 'confidence_desc', label: 'Confidence (High to Low)' },
];

// ============================================
// ReviewQueue Component
// ============================================

export function ReviewQueue() {
  const { user } = useRequireAuth();
  const filterState = useMultiFilterState({
    status: '',
    outputType: '',
    sort: 'createdAt_desc',
    search: '',
  });

  const {
    reviews,
    total,
    hasMore,
    stats,
    isLoading,
    isStatsLoading,
    filters: _filters,
    setFilters,
    claim,
    approve,
    reject,
    escalate,
    isMutating,
    getLockToken,
  } = useReviewQueue();

  // Sync search-filter-bar state to query filters
  const updateQueryFilters = useCallback(
    (partial: Partial<ReviewListFilter>) => {
      setFilters((prev: Partial<ReviewListFilter>) => ({ ...prev, ...partial, page: 1 }));
    },
    [setFilters]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      filterState.set('status', value);
      updateQueryFilters({
        status: value ? [value as (typeof REVIEW_STATUSES)[number]] : undefined,
      });
    },
    [filterState, updateQueryFilters]
  );

  const handleOutputTypeChange = useCallback(
    (value: string) => {
      filterState.set('outputType', value);
      updateQueryFilters({
        outputType: value ? [value as (typeof AI_OUTPUT_TYPES)[number]] : undefined,
      });
    },
    [filterState, updateQueryFilters]
  );

  const handleSortChange = useCallback(
    (value: string) => {
      filterState.set('sort', value);
      const [sortBy, sortOrder] = value.split('_') as [
        ReviewListFilter['sortBy'],
        ReviewListFilter['sortOrder'],
      ];
      updateQueryFilters({ sortBy, sortOrder });
    },
    [filterState, updateQueryFilters]
  );

  const handleSlaBreachedToggle = useCallback(
    (checked: boolean) => {
      updateQueryFilters({ slaBreached: checked || undefined });
    },
    [updateQueryFilters]
  );

  const handleConfidenceChange = useCallback(
    (value: number[]) => {
      updateQueryFilters({
        minConfidence: value[0] / 100,
        maxConfidence: value[1] / 100,
      });
    },
    [updateQueryFilters]
  );

  const handleLoadMore = useCallback(() => {
    setFilters((prev: Partial<ReviewListFilter>) => ({ ...prev, page: (prev.page ?? 1) + 1 }));
  }, [setFilters]);

  // Mutation handlers
  const handleClaim = useCallback((reviewId: string) => claim({ reviewId }), [claim]);
  const handleApprove = useCallback(
    (reviewId: string, lockToken: string, feedback?: string) =>
      approve({ reviewId, lockToken, feedback }),
    [approve]
  );
  const handleReject = useCallback(
    (reviewId: string, lockToken: string, notes: string) => reject({ reviewId, lockToken, notes }),
    [reject]
  );
  const handleEscalate = useCallback(
    (reviewId: string, lockToken: string, reason: string) =>
      escalate({ reviewId, lockToken, reason }),
    [escalate]
  );

  const currentUserId = user?.id ?? '';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Review Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and triage AI-generated outputs before they reach customers.
        </p>
      </div>

      {/* Stats cards row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Pending"
          value={stats?.pending ?? 0}
          icon="hourglass_empty"
          colorClass="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          isLoading={isStatsLoading}
        />
        <StatCard
          label="In Review"
          value={stats?.inReview ?? 0}
          icon="rate_review"
          colorClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          isLoading={isStatsLoading}
        />
        <StatCard
          label="Approved"
          value={stats?.approved ?? 0}
          icon="check_circle"
          colorClass="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
          isLoading={isStatsLoading}
        />
        <StatCard
          label="Escalated"
          value={stats?.escalated ?? 0}
          icon="arrow_upward"
          colorClass="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          isLoading={isStatsLoading}
        />
        <StatCard
          label="SLA Breached"
          value={stats?.slaBreachedCount ?? 0}
          icon="warning"
          colorClass="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
          isLoading={isStatsLoading}
        />
      </div>

      {/* Filter bar */}
      <div className="space-y-4">
        <SearchFilterBar
          searchValue={filterState.values.search}
          onSearchChange={(v) => filterState.set('search', v)}
          searchPlaceholder="Search reviews..."
          searchAriaLabel="Search AI reviews"
          filters={[
            {
              id: 'status',
              label: 'Status',
              icon: 'filter_list',
              options: STATUS_OPTIONS,
              value: filterState.values.status,
              onChange: handleStatusChange,
            },
            {
              id: 'outputType',
              label: 'Output Type',
              icon: 'smart_toy',
              options: OUTPUT_TYPE_OPTIONS,
              value: filterState.values.outputType,
              onChange: handleOutputTypeChange,
            },
          ]}
          sort={{
            options: SORT_OPTIONS,
            value: filterState.values.sort,
            onChange: handleSortChange,
          }}
        />

        {/* Additional filters: Confidence slider + SLA breached toggle */}
        <div className="flex flex-wrap items-center gap-4 px-1">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Confidence
            </label>
            <div className="w-40">
              <Slider
                defaultValue={[0, 100]}
                max={100}
                step={5}
                onValueCommit={handleConfidenceChange}
                aria-label="Confidence range filter"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="sla-breached"
              onCheckedChange={handleSlaBreachedToggle}
              aria-label="Show only SLA breached reviews"
            />
            <label
              htmlFor="sla-breached"
              className="text-xs font-medium text-muted-foreground cursor-pointer"
            >
              SLA Breached Only
            </label>
          </div>
        </div>
      </div>

      {/* Results count */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          Showing {reviews.length} of {total} reviews
        </p>
      )}

      {/* Review cards or empty/loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No pending reviews"
          description="All AI outputs have been reviewed or there are no items matching your filters."
          action={{
            label: 'Clear Filters',
            onClick: () => {
              filterState.reset();
              setFilters({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
            },
            icon: 'filter_list_off',
          }}
        />
      ) : (
        <div className="space-y-3">
          {reviews.map((review: ReviewResponse) => (
            <ReviewCard
              key={review.id}
              review={review}
              lockToken={getLockToken(review.id)}
              currentUserId={currentUserId}
              onClaim={handleClaim}
              onApprove={handleApprove}
              onReject={handleReject}
              onEscalate={handleEscalate}
              isMutating={isMutating}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={handleLoadMore}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
