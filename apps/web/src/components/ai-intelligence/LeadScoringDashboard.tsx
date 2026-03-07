'use client';

/**
 * LeadScoringDashboard — AI-powered lead scoring analysis dashboard (PG-148)
 *
 * Displays lead scoring stats, score distribution, avg confidence,
 * trend chart, and scored leads list with filters and pagination.
 *
 * Design reference: docs/design/mockups/sentiment-analysis.html
 */

import { useState, useCallback, Suspense, lazy } from 'react';
import {
  Card,
  CardContent,
  Button,
  Skeleton,
  cn,
  ConfidenceIndicator,
  ScoreBadge,
} from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, useMultiFilterState } from '@/components/shared';
import { useLeadScoringDashboard } from '@/lib/lead-scoring/hooks';
import type { LeadScoringFilters } from '@/lib/lead-scoring/hooks';
import type { ScoredLead } from '@/lib/lead-scoring/types';
import { formatModelVersion, formatScoredAt } from '@/lib/lead-scoring/lead-scoring-utils';

const LeadScoringTrendChart = lazy(() => import('./LeadScoringTrendChart'));

// ============================================
// Breadcrumb config
// ============================================

const BREADCRUMBS = [{ label: 'AI & Agents', href: '/agent-approvals' }, { label: 'Lead Scoring' }];

// ============================================
// Tier styling helpers
// ============================================

function getTierConfig(tier: string) {
  switch (tier) {
    case 'hot':
      return {
        borderColor: 'border-l-green-500',
        badgeBg: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        label: 'Hot',
      };
    case 'warm':
      return {
        borderColor: 'border-l-orange-500',
        badgeBg: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        label: 'Warm',
      };
    case 'cold':
    default:
      return {
        borderColor: 'border-l-slate-400',
        badgeBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300',
        label: 'Cold',
      };
  }
}

function getFactorBarColor(impact: number) {
  if (impact >= 10) return 'bg-green-500';
  if (impact >= 5) return 'bg-blue-500';
  if (impact >= 0) return 'bg-slate-400';
  return 'bg-red-400';
}

// ============================================
// Stats Card (internal) — with left border accent
// ============================================

function StatCard({
  label,
  value,
  icon,
  iconBgClass,
  borderClass,
  isLoading,
}: Readonly<{
  label: string;
  value: number | string;
  icon: string;
  iconBgClass: string;
  borderClass?: string;
  isLoading: boolean;
}>) {
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

const SORT_OPTIONS = [
  { value: 'score', label: 'Score' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'newest', label: 'Newest' },
];

const DATE_RANGES = ['7d', '30d', '90d'] as const;

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'hot', label: 'Hot', color: 'bg-green-500' },
  { id: 'warm', label: 'Warm', color: 'bg-orange-500' },
  { id: 'needsReview', label: 'Needs Review', color: 'bg-amber-500' },
];

// ============================================
// Lead Card (internal) — matched to sentiment mockup pattern
// ============================================

function LeadCard({ lead }: Readonly<{ lead: ScoredLead }>) {
  const tierConfig = getTierConfig(lead.tier);

  return (
    <div
      data-testid="lead-card"
      className={cn(
        'bg-white dark:bg-slate-900 p-6 rounded-xl border-l-4 shadow-sm',
        'border border-slate-200 dark:border-slate-700',
        'group hover:shadow-md transition-shadow',
        tierConfig.borderColor
      )}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Main content */}
        <div className="flex-1 min-w-0">
          {/* Name + tier badge + time */}
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <a
              href={`/leads/${lead.leadId}`}
              className="text-base font-bold text-primary hover:underline truncate"
            >
              {lead.leadName}
            </a>
            {lead.company && <span className="text-xs text-slate-400">— {lead.company}</span>}
            <span
              className={cn(
                'px-2 py-0.5 text-[10px] font-bold rounded uppercase',
                tierConfig.badgeBg
              )}
            >
              {tierConfig.label}
            </span>
            {lead.requiresReview && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold rounded uppercase">
                Needs Review
              </span>
            )}
            <span className="text-xs text-slate-400">{formatScoredAt(lead.scoredAt)}</span>
          </div>

          {/* Factor breakdown — horizontal progress bars like sentiment mockup */}
          {lead.factors.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                {lead.factors.slice(0, 3).map((factor) => (
                  <div key={factor.name} className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-tighter text-slate-400">
                      {factor.name}
                    </span>
                    <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', getFactorBarColor(factor.impact))}
                        style={{
                          width: `${Math.min(100, Math.max(5, Math.abs(factor.impact) * 5))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confidence + model */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Confidence</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {Math.round(lead.confidence * 100)}%
              </span>
            </div>
            <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-600" />
            <span className="text-xs text-slate-400">
              Model: {formatModelVersion(lead.modelVersion)}
            </span>
          </div>
        </div>

        {/* Right: Score badge */}
        <div className="shrink-0 flex items-start">
          <ScoreBadge
            score={lead.score}
            confidence={lead.confidence}
            factors={lead.factors}
            mode="expanded"
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Score Distribution mini chart
// ============================================

function ScoreDistributionChart({
  distribution,
  total: _total,
}: Readonly<{
  distribution: { hot: number; warm: number; cold: number } | null;
  total: number;
}>) {
  const tiers = [
    { key: 'hot', label: 'Hot', color: 'bg-green-500', count: distribution?.hot ?? 0 },
    { key: 'warm', label: 'Warm', color: 'bg-orange-500', count: distribution?.warm ?? 0 },
    { key: 'cold', label: 'Cold', color: 'bg-slate-400', count: distribution?.cold ?? 0 },
  ];
  const maxCount = Math.max(...tiers.map((t) => t.count), 1);

  return (
    <div className="flex items-end gap-6 justify-center h-32">
      {tiers.map((tier) => {
        const height = Math.max(8, (tier.count / maxCount) * 100);
        return (
          <div key={tier.key} className="flex flex-col items-center gap-2 w-16">
            <span className="text-lg font-bold text-slate-900 dark:text-white">{tier.count}</span>
            <div className="w-full h-20 flex items-end">
              <div
                className={cn('w-full rounded-t-lg transition-all', tier.color)}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-500">{tier.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// LeadScoringDashboard Component
// ============================================

export function LeadScoringDashboard() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [page, setPage] = useState(1);
  const [activeChip, setActiveChip] = useState('all');

  const filterState = useMultiFilterState({
    sort: 'score',
    search: '',
  });

  const filters: LeadScoringFilters = {
    dateRange,
    page,
    limit: 20,
  };

  const { stats, scoredLeads, trends, distribution, isLoading, error, refetch } =
    useLeadScoringDashboard(filters);

  const handleChipChange = useCallback((chipId: string) => {
    setActiveChip(chipId);
  }, []);

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // Client-side filtering by chip
  let filteredLeads = scoredLeads;

  if (activeChip === 'hot') {
    filteredLeads = filteredLeads.filter((l) => l.tier === 'hot');
  } else if (activeChip === 'warm') {
    filteredLeads = filteredLeads.filter((l) => l.tier === 'warm');
  } else if (activeChip === 'needsReview') {
    filteredLeads = filteredLeads.filter((l) => l.requiresReview);
  }

  // Client-side search
  if (filterState.values.search) {
    const searchLower = filterState.values.search.toLowerCase();
    filteredLeads = filteredLeads.filter((l) => l.leadName.toLowerCase().includes(searchLower));
  }

  // Client-side sorting
  if (filterState.values.sort === 'confidence') {
    filteredLeads = [...filteredLeads].sort((a, b) => b.confidence - a.confidence);
  } else if (filterState.values.sort === 'newest') {
    filteredLeads = [...filteredLeads].sort(
      (a, b) => new Date(b.scoredAt).getTime() - new Date(a.scoredAt).getTime()
    );
  }
  // Default 'score' sort is applied by backend (score DESC)

  // Error state
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Lead Scoring"
          description="AI-powered lead scoring analysis and factor breakdown."
        />
        <Card>
          <CardContent className="p-8 text-center">
            <span
              className="material-symbols-outlined text-4xl text-red-500 mb-2"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-sm text-muted-foreground mb-4">Failed to load lead scoring data</p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="Lead Scoring"
        description="AI-powered lead scoring analysis and factor breakdown."
      />

      {/* Stats Row — matching sentiment mockup card style */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Scored"
          value={stats?.total ?? 0}
          icon="leaderboard"
          iconBgClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          isLoading={isLoading}
        />
        <StatCard
          label="Hot Leads"
          value={stats?.hot ?? 0}
          icon="local_fire_department"
          iconBgClass="bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
          borderClass="border-l-green-500"
          isLoading={isLoading}
        />
        <StatCard
          label="Warm Leads"
          value={stats?.warm ?? 0}
          icon="wb_sunny"
          iconBgClass="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400"
          borderClass="border-l-orange-500"
          isLoading={isLoading}
        />
        <StatCard
          label="Cold Leads"
          value={stats?.cold ?? 0}
          icon="ac_unit"
          iconBgClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          borderClass="border-l-slate-400"
          isLoading={isLoading}
        />
        <StatCard
          label="Avg Score"
          value={stats?.avgScore ?? 0}
          icon="analytics"
          iconBgClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
          borderClass="border-l-indigo-500"
          isLoading={isLoading}
        />
      </div>

      {/* Trend Chart + Score Distribution side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend Chart — 2/3 width */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Scoring Trend
                </h3>
                <p className="text-xs text-slate-500">
                  Score averages and tier distribution over time
                </p>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {DATE_RANGES.map((dr) => (
                  <button
                    key={dr}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-md transition-all',
                      dateRange === dr
                        ? 'bg-white dark:bg-slate-700 shadow-sm font-bold'
                        : 'hover:bg-white/50 dark:hover:bg-slate-600/50'
                    )}
                    onClick={() => setDateRange(dr)}
                  >
                    {dr}
                  </button>
                ))}
              </div>
            </div>
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <LeadScoringTrendChart trends={trends} />
            </Suspense>
          </div>
        </div>

        {/* Right column: Confidence + Distribution */}
        <div className="flex flex-col gap-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Average Confidence
            </h3>
            <ConfidenceIndicator
              confidence={stats?.avgConfidence ?? 0}
              size="lg"
              showLabel
              showDescription
            />
          </div>
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Score Distribution
            </h3>
            <ScoreDistributionChart distribution={distribution} total={stats?.total ?? 1} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <SearchFilterBar
          searchValue={filterState.values.search}
          onSearchChange={(v) => filterState.set('search', v)}
          searchPlaceholder="Search by lead name..."
          searchAriaLabel="Search by lead name"
          filters={[]}
          filterChips={{
            options: FILTER_CHIPS,
            value: activeChip,
            onChange: handleChipChange,
          }}
          sort={{
            options: SORT_OPTIONS,
            value: filterState.values.sort,
            onChange: (v) => filterState.set('sort', v),
          }}
        />
      </div>

      {/* Scored Leads List */}
      {(() => {
        if (isLoading) return (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" /> // NOSONAR typescript:S6479
          ))}
        </div>
        );
        if (filteredLeads.length === 0) return (
        <div
          className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-center"
          data-testid="empty-state"
        >
          <span
            className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2"
            aria-hidden="true"
          >
            leaderboard
          </span>
          <p className="text-sm text-slate-500">No lead scoring data available</p>
        </div>
        );
        return (
        <div className="space-y-4">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
          {scoredLeads.length >= 20 && (
            <div className="flex justify-center pt-4 pb-8">
              <button
                className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                onClick={handleLoadMore}
                data-testid="load-more-button"
              >
                Load More Leads{' '}
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  expand_more
                </span>
              </button>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}
