'use client';

/**
 * ReviewHistory — AI Review History timeline container (PG-150)
 *
 * Filterable, timeline-grouped view of completed AI output reviews.
 * Follows the same architecture as ReviewQueue.tsx (IFC-181).
 *
 * Reuses:
 * - ReviewCard from ai-review (read-only for completed reviews)
 * - SearchFilterBar from shared
 * - Card, Badge, Button, Skeleton, EmptyState from @intelliflow/ui
 * - REVIEW_STATUSES, AI_OUTPUT_TYPES from @intelliflow/domain
 */

import { useState, useCallback, useId, useMemo } from 'react';
import { Card, CardContent, Badge, Button, EmptyState, Skeleton, cn } from '@intelliflow/ui';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useReviewHistory } from '@/lib/ai-review/hooks';
import { ReviewCard } from '@/components/ai-review/ReviewCard';
import type { ReviewResponse } from '@intelliflow/validators/ai-review';
import { AI_OUTPUT_TYPES, type AIOutputType } from '@intelliflow/domain';

// ============================================
// Types
// ============================================

interface DateGroup {
  label: string;
  reviews: ReviewResponse[];
}

// ============================================
// Constants
// ============================================

const HISTORY_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
];

const OUTPUT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  ...AI_OUTPUT_TYPES.map((t) => ({
    value: t,
    label: t
      .replaceAll('_', ' ')
      .toLowerCase()
      .replaceAll(/\b\w/g, (c) => c.toUpperCase()),
  })),
];

const SORT_OPTIONS = [
  { value: 'createdAt_desc', label: 'Most Recent' },
  { value: 'createdAt_asc', label: 'Oldest' },
  { value: 'confidence_asc', label: 'Confidence: Low to High' },
  { value: 'confidence_desc', label: 'Confidence: High to Low' },
];

const BUCKET_ORDER = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'];

// ============================================
// Utility Functions
// ============================================

function groupByDateBucket(reviews: ReviewResponse[]): DateGroup[] {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const buckets = new Map<string, ReviewResponse[]>();

  for (const review of reviews) {
    const date = new Date(review.updatedAt);
    const diffMs =
      startOfToday.getTime() -
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    let label: string;
    if (diffDays <= 0) label = 'Today';
    else if (diffDays === 1) label = 'Yesterday';
    else if (diffDays < 7) label = 'Last 7 Days';
    else if (diffDays < 30) label = 'Last 30 Days';
    else label = 'Older';

    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(review);
  }

  // Return in defined order
  return BUCKET_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    reviews: buckets.get(label)!,
  }));
}

function formatTimeDiff(start: Date | string, end: Date | string): string {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 0) return '—';

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// ============================================
// Sub-components
// ============================================

function HistoryStatCard({
  label,
  value,
  icon,
  colorClass,
  isLoading,
}: Readonly<{
  label: string;
  value: number;
  icon: string;
  colorClass: string;
  isLoading: boolean;
}>) {
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

function TimelineGroup({
  label,
  count,
  children,
  defaultOpen = true,
}: Readonly<{
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}>) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const headingId = useId();
  const contentId = useId();

  return (
    <section aria-labelledby={headingId} className="mb-6">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <h3 id={headingId} className="text-lg font-semibold text-foreground">
          {label}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
        <span
          className={cn(
            'material-symbols-outlined text-muted-foreground transition-transform',
            isOpen ? 'rotate-0' : '-rotate-90'
          )}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {isOpen && (
        <div id={contentId} className="space-y-3 ml-2 border-l-2 border-muted pl-4">
          {children}
        </div>
      )}
    </section>
  );
}

function AuditTrailSummary({ review }: Readonly<{ review: ReviewResponse }>) {
  const [isOpen, setIsOpen] = useState(false);
  const trailId = useId();

  const hasAuditData = review.reviewerId || review.reviewDecision || review.reviewNotes;
  if (!hasAuditData && review.escalationDepth === 0) return null;

  return (
    <div className="mt-1 mb-2">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={trailId}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>{' '}
        Audit Trail Details
      </button>
      {isOpen && (
        <dl
          id={trailId}
          className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs bg-muted/30 rounded-md p-3"
        >
          {review.reviewerId && (
            <>
              <dt className="text-muted-foreground font-medium">Reviewer</dt>
              <dd className="text-foreground">{review.reviewerId}</dd>
            </>
          )}
          {review.reviewDecision && (
            <>
              <dt className="text-muted-foreground font-medium">Decision</dt>
              <dd>
                <Badge
                  variant={review.reviewDecision === 'APPROVED' ? 'default' : 'destructive'}
                  className="text-[10px]"
                >
                  {review.reviewDecision}
                </Badge>
              </dd>
            </>
          )}
          {review.reviewNotes && (
            <>
              <dt className="text-muted-foreground font-medium">Notes</dt>
              <dd className="text-foreground col-span-1">{review.reviewNotes}</dd>
            </>
          )}
          {review.escalationDepth > 0 && (
            <>
              <dt className="text-muted-foreground font-medium">Escalations</dt>
              <dd className="text-foreground">
                {review.escalationDepth} escalation{review.escalationDepth === 1 ? '' : 's'}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground font-medium">Time to Decision</dt>
          <dd className="text-foreground">{formatTimeDiff(review.createdAt, review.updatedAt)}</dd>
        </dl>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function ReviewHistory() {
  const { user } = useRequireAuth();
  const { reviews, total, hasMore, stats, isLoading, isStatsLoading, setFilters } =
    useReviewHistory();

  // Local date range state (client-side filtering)
  const [afterDate, setAfterDate] = useState('');
  const [beforeDate, setBeforeDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [outputTypeFilter, setOutputTypeFilter] = useState('');
  const [sortValue, setSortValue] = useState('createdAt_desc');

  // Client-side date filtering
  const filteredReviews = useMemo(() => {
    if (!afterDate && !beforeDate) return reviews;
    return reviews.filter((r: ReviewResponse) => {
      const updated = new Date(r.updatedAt);
      if (afterDate && updated < new Date(afterDate)) return false;
      if (beforeDate) {
        const endOfDay = new Date(beforeDate);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
        if (updated >= endOfDay) return false;
      }
      return true;
    });
  }, [reviews, afterDate, beforeDate]);

  // Group into timeline buckets
  const dateGroups = useMemo(() => groupByDateBucket(filteredReviews), [filteredReviews]);

  // Filter handlers
  const handleStatusChange = useCallback(
    (value: string) => {
      setStatusFilter(value);
      setFilters((prev) => ({
        ...prev,
        status: value
          ? [value as 'APPROVED' | 'REJECTED' | 'EXPIRED']
          : ['APPROVED', 'REJECTED', 'EXPIRED'],
        page: 1,
      }));
    },
    [setFilters]
  );

  const handleOutputTypeChange = useCallback(
    (value: string) => {
      setOutputTypeFilter(value);
      setFilters((prev) => ({
        ...prev,
        outputType: value ? [value as AIOutputType] : undefined,
        page: 1,
      }));
    },
    [setFilters]
  );

  const handleSortChange = useCallback(
    (value: string) => {
      setSortValue(value);
      const [sortBy, sortOrder] = value.split('_') as [string, 'asc' | 'desc'];
      setFilters((prev) => ({
        ...prev,
        sortBy: sortBy as 'createdAt' | 'confidence' | 'slaDeadline' | 'escalationDepth',
        sortOrder,
        page: 1,
      }));
    },
    [setFilters]
  );

  const handleFromDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAfterDate(e.target.value);
      setFilters((prev) => ({ ...prev, page: 1 }));
    },
    [setFilters]
  );

  const handleToDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBeforeDate(e.target.value);
      setFilters((prev) => ({ ...prev, page: 1 }));
    },
    [setFilters]
  );

  const handleClearFilters = useCallback(() => {
    setStatusFilter('');
    setOutputTypeFilter('');
    setSortValue('createdAt_desc');
    setAfterDate('');
    setBeforeDate('');
    setFilters({
      status: ['APPROVED', 'REJECTED', 'EXPIRED'],
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }, [setFilters]);

  const handleLoadMore = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      page: (prev.page ?? 1) + 1,
    }));
  }, [setFilters]);

  // No-op handlers for ReviewCard (read-only mode)
  const noop = () => {};

  // Computed stats
  const approvedCount = stats?.approved ?? 0;
  const rejectedCount = stats?.rejected ?? 0;
  const expiredCount = stats?.expired ?? 0;
  const totalCompleted = approvedCount + rejectedCount + expiredCount;

  // Loading state
  if (isLoading && reviews.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" data-testid="skeleton" /> // NOSONAR typescript:S6479
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-lg" data-testid="skeleton" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" data-testid="skeleton" /> // NOSONAR typescript:S6479
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Review History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete audit trail of all AI output review decisions.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HistoryStatCard
          label="Approved"
          value={approvedCount}
          icon="check_circle"
          colorClass="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          isLoading={isStatsLoading}
        />
        <HistoryStatCard
          label="Rejected"
          value={rejectedCount}
          icon="cancel"
          colorClass="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          isLoading={isStatsLoading}
        />
        <HistoryStatCard
          label="Expired"
          value={expiredCount}
          icon="schedule"
          colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          isLoading={isStatsLoading}
        />
        <HistoryStatCard
          label="Total Completed"
          value={totalCompleted}
          icon="history"
          colorClass="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          isLoading={isStatsLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label
            htmlFor="history-status-filter"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            Status
          </label>
          <select
            id="history-status-filter"
            aria-label="Status"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {HISTORY_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label
            htmlFor="history-type-filter"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            Output Type
          </label>
          <select
            id="history-type-filter"
            aria-label="Output Type"
            value={outputTypeFilter}
            onChange={(e) => handleOutputTypeChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {OUTPUT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label
            htmlFor="history-sort"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            Sort By
          </label>
          <select
            id="history-sort"
            aria-label="Sort by"
            value={sortValue}
            onChange={(e) => handleSortChange(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Date Range */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="history-from-date"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            From
          </label>
          <input
            id="history-from-date"
            type="date"
            aria-label="Filter from date"
            value={afterDate}
            onChange={handleFromDateChange}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="history-to-date"
            className="text-xs font-medium text-muted-foreground mb-1 block"
          >
            To
          </label>
          <input
            id="history-to-date"
            type="date"
            aria-label="Filter to date"
            value={beforeDate}
            onChange={handleToDateChange}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          aria-label="Clear all filters"
        >
          <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
            filter_list_off
          </span>{' '}
          Reset Filters
        </Button>
      </div>

      {/* Results Count */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {filteredReviews.length} of {total} reviews
      </p>

      {/* Timeline Groups */}
      {filteredReviews.length === 0 && !isLoading ? (
        <EmptyState entity="insights" phase="passive" />
      ) : (
        dateGroups.map((group) => (
          <TimelineGroup key={group.label} label={group.label} count={group.reviews.length}>
            {group.reviews.map((review) => (
              <div key={review.id} data-review-id={review.id}>
                <ReviewCard
                  review={review}
                  lockToken={null}
                  currentUserId={user?.id ?? ''}
                  onClaim={noop}
                  onApprove={noop}
                  onReject={noop}
                  onEscalate={noop}
                  isMutating={false}
                />
                <AuditTrailSummary review={review} />
              </div>
            ))}
          </TimelineGroup>
        ))
      )}

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={handleLoadMore} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
