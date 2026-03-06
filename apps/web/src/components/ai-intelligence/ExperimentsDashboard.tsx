'use client';

/**
 * ExperimentsDashboard (PG-149)
 *
 * Main dashboard for A/B experiment management. Shows experiment list
 * with stats, filters, status badges, and statistical results.
 *
 * Pattern: Follows LeadScoringDashboard (PG-148) architecture.
 */

import { useState, useCallback, lazy, Suspense } from 'react';
import { Card, CardContent, Badge, Button, Skeleton, cn } from '@intelliflow/ui';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { useExperimentsDashboard, useExperimentActions } from '@/lib/experiments/hooks';
import {
  getStatusColor,
  getTypeLabel,
  getExperimentActions,
  computeExperimentStats,
} from '@/lib/experiments/experiment-utils';
import type { ExperimentSummary } from '@/lib/experiments/types';

const ExperimentResultsPanel = lazy(() => import('./ExperimentResultsPanel'));

// ============================================
// Breadcrumb config
// ============================================

const BREADCRUMBS = [{ label: 'AI & Agents', href: '/agent-approvals' }, { label: 'Experiments' }];

// ============================================
// Internal StatCard (defined within file, following LeadScoringDashboard pattern)
// ============================================

function StatCard({
  label,
  value,
  icon,
  iconBgClass,
  borderClass,
  isLoading,
}: {
  label: string;
  value: number | string;
  icon: string;
  iconBgClass: string;
  borderClass?: string;
  isLoading: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm',
        borderClass && `border-l-4 ${borderClass}`
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={cn('material-symbols-outlined p-2 rounded-lg', iconBgClass)}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      {isLoading ? (
        <Skeleton className="h-7 w-14 mt-1" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      )}
    </div>
  );
}

// ============================================
// Filter options
// ============================================

const STATUS_CHIP_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'RUNNING', label: 'Running' },
  { id: 'PAUSED', label: 'Paused' },
  { id: 'COMPLETED', label: 'Completed' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'progress', label: 'Progress' },
];

const ITEMS_PER_PAGE = 20;

// ============================================
// Main Component
// ============================================

export function ExperimentsDashboard() {
  const { experiments, isLoading, error, refetch } = useExperimentsDashboard();
  const { startMutation, pauseMutation, completeMutation, archiveMutation } =
    useExperimentActions();

  const [searchValue, setSearchValue] = useState('');
  const [statusChip, setStatusChip] = useState('all');
  const [sortValue, setSortValue] = useState('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const statusFilter = statusChip === 'all' ? null : statusChip;

  // Filter experiments
  const filtered = experiments.filter((exp: ExperimentSummary) => {
    if (statusFilter && exp.status !== statusFilter) return false;
    if (searchValue) {
      const q = searchValue.toLowerCase();
      const nameMatch = exp.name.toLowerCase().includes(q);
      const hypothesisMatch = exp.hypothesis?.toLowerCase().includes(q);
      if (!nameMatch && !hypothesisMatch) return false;
    }
    return true;
  });

  // Sort experiments
  const sorted = [...filtered].sort((a, b) => {
    switch (sortValue) {
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'progress':
        return b.progressPercent - a.progressPercent;
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  // Paginate
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = sorted.slice(0, page * ITEMS_PER_PAGE);

  const stats = computeExperimentStats(experiments);

  // Action handler
  const handleAction = useCallback(
    (experimentId: string, action: string) => {
      switch (action) {
        case 'start':
          startMutation.mutate({ experimentId });
          break;
        case 'pause':
          pauseMutation.mutate({ experimentId });
          break;
        case 'complete':
          completeMutation.mutate({ experimentId });
          break;
        case 'archive':
          archiveMutation.mutate({ experimentId });
          break;
      }
    },
    [startMutation, pauseMutation, completeMutation, archiveMutation]
  );

  // Loading state
  if (isLoading) {
    return (
      <div data-testid="experiments-loading">
        <PageHeader breadcrumbs={BREADCRUMBS} title="A/B Experiments" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-xl mt-6" />
        <div className="space-y-3 mt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div data-testid="experiments-error">
        <PageHeader breadcrumbs={BREADCRUMBS} title="A/B Experiments" />
        <Card className="mt-6">
          <CardContent className="p-8 text-center">
            <span
              className="material-symbols-outlined text-4xl text-red-400 mb-3"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-slate-700 dark:text-slate-200 font-medium mb-2">
              Failed to load experiments
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{error.message}</p>
            <Button onClick={() => refetch()} aria-label="Retry loading experiments">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state
  if (experiments.length === 0) {
    return (
      <div data-testid="experiments-empty">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="A/B Experiments"
          description="Manage experiments, track statistical significance, and compare AI vs manual scoring."
        />
        <Card className="mt-6">
          <CardContent className="p-12 text-center">
            <span
              className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4"
              aria-hidden="true"
            >
              science
            </span>
            <p className="text-slate-700 dark:text-slate-200 font-medium mb-1">
              No experiments yet
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Create your first A/B experiment to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="experiments-dashboard">
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="A/B Experiments"
        description="Manage experiments, track statistical significance, and compare AI vs manual scoring."
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
        <StatCard
          label="Total Experiments"
          value={stats.total}
          icon="science"
          iconBgClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          isLoading={false}
        />
        <StatCard
          label="Running"
          value={stats.running}
          icon="play_circle"
          iconBgClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
          borderClass="border-l-blue-500"
          isLoading={false}
        />
        <StatCard
          label="Completed"
          value={stats.completed}
          icon="check_circle"
          iconBgClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300"
          borderClass="border-l-green-500"
          isLoading={false}
        />
        <StatCard
          label="Significant Results"
          value={stats.significant}
          icon="verified"
          iconBgClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
          borderClass="border-l-emerald-500"
          isLoading={false}
        />
        <StatCard
          label="Avg Progress"
          value={`${stats.avgProgress}%`}
          icon="speed"
          iconBgClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300"
          borderClass="border-l-indigo-500"
          isLoading={false}
        />
      </div>

      {/* Search & Filters */}
      <div className="mt-6">
        <SearchFilterBar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search by name or hypothesis..."
          filterChips={{
            options: STATUS_CHIP_OPTIONS,
            value: statusChip,
            onChange: setStatusChip,
          }}
          sort={{
            options: SORT_OPTIONS,
            value: sortValue,
            onChange: setSortValue,
          }}
        />
      </div>

      {/* Experiment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {paginated.map((exp: ExperimentSummary) => {
          const actions = getExperimentActions(exp.status);
          const isExpanded = expandedId === exp.id;

          return (
            <Card
              key={exp.id}
              className="border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                {/* Header: Name + badges */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                      {exp.name}
                    </h3>
                    <div className="flex gap-2 mt-1">
                      <Badge
                        className={cn('text-xs', getStatusColor(exp.status))}
                        aria-label={`Status: ${exp.status}`}
                      >
                        {exp.status}
                      </Badge>
                      <Badge
                        className="text-xs bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        aria-label={`Type: ${getTypeLabel(exp.type)}`}
                      >
                        {getTypeLabel(exp.type)}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Hypothesis */}
                {exp.hypothesis && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                    {exp.hypothesis}
                  </p>
                )}

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>Sample Progress</span>
                    <span>{exp.progressPercent}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={exp.progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Sample collection progress: ${exp.progressPercent}%`}
                    className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
                      style={{ width: `${exp.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Results badges for completed experiments */}
                {exp.hasResult && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Badge
                      className={cn(
                        'text-xs',
                        exp.isSignificant
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      )}
                      aria-label={
                        exp.isSignificant
                          ? 'Result is statistically significant'
                          : 'Result is not statistically significant'
                      }
                    >
                      <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                        {exp.isSignificant ? 'verified' : 'do_not_disturb'}
                      </span>
                      {exp.isSignificant ? 'Significant' : 'Not Significant'}
                    </Badge>

                    {exp.winner && (
                      <Badge
                        className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        aria-label={`Winner: ${exp.winner}`}
                      >
                        <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                          emoji_events
                        </span>
                        {exp.winner === 'treatment' ? 'Treatment' : 'Control'}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {actions.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {actions.map((action) => (
                      <Button
                        key={action.action}
                        size="sm"
                        variant={action.action === 'start' ? 'default' : 'outline'}
                        onClick={() => handleAction(exp.id, action.action)}
                        aria-label={`${action.label} experiment: ${exp.name}`}
                      >
                        <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                          {action.icon}
                        </span>
                        {action.label}
                      </Button>
                    ))}

                    {exp.hasResult && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(isExpanded ? null : exp.id)}
                        aria-label={`${isExpanded ? 'Hide' : 'View'} results for ${exp.name}`}
                      >
                        <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                        {isExpanded ? 'Hide Results' : 'View Results'}
                      </Button>
                    )}
                  </div>
                )}

                {/* Expanded Results Panel */}
                {isExpanded && exp.hasResult && (
                  <Suspense
                    fallback={
                      <div className="mt-3 space-y-2">
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-24 w-full" />
                      </div>
                    }
                  >
                    <ExperimentResultsPanel experimentId={exp.id} />
                  </Suspense>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Load More Pagination */}
      {page < totalPages && (
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            onClick={() => setPage((p) => p + 1)}
            aria-label="Load more experiments"
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
