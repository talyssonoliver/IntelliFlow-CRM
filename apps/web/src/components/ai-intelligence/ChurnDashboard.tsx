'use client';

/**
 * ChurnDashboard — AI-powered churn risk analysis dashboard (PG-143)
 *
 * Displays churn risk stats, risk distribution, intervention alerts,
 * trend chart, and at-risk customer list with filters and pagination.
 */

import { useState, useCallback, Suspense, lazy, type ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Skeleton,
  cn,
} from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, useMultiFilterState } from '@/components/shared';
import { useChurnDashboard } from '@/lib/churn-risk/hooks';
import type { ChurnFilters } from '@/lib/churn-risk/hooks';
import type { AtRiskCustomer } from '@/lib/churn-risk/types';
import { CHURN_RISK_LEVELS } from '@intelliflow/domain';
import {
  getRiskBadgeClass,
  getEngagementColor,
  getEngagementBgClass,
  formatSlaCountdown,
} from '@/lib/churn-risk/churn-utils';
import { HealthScoreGauge } from './HealthScoreGauge';
import { RiskIndicators } from './RiskIndicators';
import { InterventionAlerts } from './InterventionAlerts';

const ChurnTrendChart = lazy(() => import('./ChurnTrendChart'));

// ============================================
// Breadcrumb config
// ============================================

const BREADCRUMBS = [{ label: 'AI & Agents', href: '/agent-approvals' }, { label: 'Churn Risk' }];

// ============================================
// Stats Card (internal)
// ============================================

function StatCard({
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

// ============================================
// Filter options
// ============================================

const ENTITY_TYPE_OPTIONS = [
  { value: 'all', label: 'All Entities' },
  { value: 'lead', label: 'Leads' },
  { value: 'contact', label: 'Contacts' },
];

const RISK_LEVEL_OPTIONS = [
  { value: '', label: 'All Risk Levels' },
  ...CHURN_RISK_LEVELS.map((level) => ({
    value: level,
    label: level.charAt(0) + level.slice(1).toLowerCase(),
  })),
];

const SORT_OPTIONS = [
  { value: 'risk', label: 'Risk Level' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'sla', label: 'SLA Deadline' },
  { value: 'newest', label: 'Newest' },
];

const DATE_RANGES = ['7d', '30d', '90d'] as const;

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical', color: 'bg-red-500' },
  { id: 'high', label: 'High', color: 'bg-orange-500' },
  { id: 'atRisk', label: 'At Risk', color: 'bg-amber-500' },
];

// ============================================
// Customer Card (internal)
// ============================================

function CustomerCard({ customer }: Readonly<{ customer: AtRiskCustomer }>) {
  const sla = formatSlaCountdown(customer.slaDeadline);

  return (
    <Card data-testid="customer-card">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Header: name + badges */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{customer.entityName}</span>
              <Badge variant="outline" className="text-xs">
                {customer.entityType}
              </Badge>
            </div>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                getRiskBadgeClass(customer.riskLevel)
              )}
              data-testid="risk-badge"
            >
              {customer.riskLevel}
            </span>
          </div>

          {/* Engagement bar */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-24">Engagement</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  getEngagementColor(customer.engagementScore)
                )}
                style={{ width: `${Math.min(100, customer.engagementScore)}%` }}
              />
            </div>
            <span
              className={cn(
                'text-xs font-medium w-8 text-right',
                getEngagementBgClass(customer.engagementScore)
                  .split(' ')
                  .find((c) => c.startsWith('text-'))
              )}
            >
              {customer.engagementScore}
            </span>
          </div>

          {/* SLA + last engagement */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              SLA:{' '}
              <span
                className={cn(
                  'font-medium',
                  sla.isOverdue ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                )}
                data-testid="sla-countdown"
              >
                {sla.text}
              </span>
            </span>
            <span>Last engaged: {customer.lastEngagementDays}d ago</span>
          </div>

          {/* Next best action */}
          {customer.nextBestAction && (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-blue-500" aria-hidden="true">
                tips_and_updates
              </span>
              <span className="text-xs text-foreground">{customer.nextBestAction}</span>
            </div>
          )}

          {/* Recommendations (top 2) */}
          {customer.recommendations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customer.recommendations.slice(0, 2).map((rec) => (
                <span
                  key={rec}
                  className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400"
                >
                  {rec}
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// ChurnDashboard Component
// ============================================

export function ChurnDashboard() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [page, setPage] = useState(1);
  const [activeChip, setActiveChip] = useState('all');

  const filterState = useMultiFilterState({
    entityType: 'all',
    riskLevel: '',
    sort: 'risk',
    search: '',
  });

  const filters: ChurnFilters = {
    entityType: filterState.values.entityType as 'all' | 'lead' | 'contact',
    dateRange,
    page,
    limit: 20,
  };

  const { stats, atRiskCustomers, trends, distribution, isLoading, error, refetch } =
    useChurnDashboard(filters);

  const handleChipChange = useCallback(
    (chipId: string) => {
      setActiveChip(chipId);
      if (chipId === 'critical') {
        filterState.set('riskLevel', 'CRITICAL');
      } else if (chipId === 'high') {
        filterState.set('riskLevel', 'HIGH');
      } else if (chipId === 'atRisk') {
        filterState.set('riskLevel', ''); // show CRITICAL + HIGH + MEDIUM
      } else {
        filterState.set('riskLevel', '');
      }
    },
    [filterState]
  );

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // Client-side filtering
  let filteredCustomers = atRiskCustomers;

  if (filterState.values.riskLevel) {
    filteredCustomers = filteredCustomers.filter(
      (c) => c.riskLevel === filterState.values.riskLevel
    );
  }

  if (activeChip === 'atRisk') {
    filteredCustomers = filteredCustomers.filter(
      (c) => c.riskLevel === 'CRITICAL' || c.riskLevel === 'HIGH' || c.riskLevel === 'MEDIUM'
    );
  }

  if (filterState.values.search) {
    const searchLower = filterState.values.search.toLowerCase();
    filteredCustomers = filteredCustomers.filter((c) =>
      c.entityName.toLowerCase().includes(searchLower)
    );
  }

  // Sorting
  if (filterState.values.sort === 'engagement') {
    filteredCustomers = [...filteredCustomers].sort(
      (a, b) => a.engagementScore - b.engagementScore
    );
  } else if (filterState.values.sort === 'sla') {
    filteredCustomers = [...filteredCustomers].sort(
      (a, b) => new Date(a.slaDeadline).getTime() - new Date(b.slaDeadline).getTime()
    );
  } else if (filterState.values.sort === 'newest') {
    filteredCustomers = [...filteredCustomers].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
  // Default 'risk' sort is already applied by the backend

  // Error state
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Churn Risk"
          description="AI-powered churn risk analysis and intervention recommendations."
        />
        <Card>
          <CardContent className="p-8 text-center">
            <span
              className="material-symbols-outlined text-4xl text-red-500 mb-2"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-sm text-muted-foreground mb-4">Failed to load churn risk data</p>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  let customerListContent: ReactNode;
  if (isLoading) {
    customerListContent = (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" /> // NOSONAR typescript:S6479
        ))}
      </div>
    );
  } else if (filteredCustomers.length === 0) {
    customerListContent = (
      <Card>
        <CardContent className="p-8 text-center" data-testid="empty-state">
          <span
            className="material-symbols-outlined text-4xl text-muted-foreground mb-2"
            aria-hidden="true"
          >
            shield
          </span>
          <p className="text-sm text-muted-foreground">No churn risk data available</p>
        </CardContent>
      </Card>
    );
  } else {
    customerListContent = (
      <div className="space-y-3">
        {filteredCustomers.map((customer) => (
          <CustomerCard key={customer.id} customer={customer} />
        ))}
        {atRiskCustomers.length >= 20 && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleLoadMore} data-testid="load-more-button">
              Load more
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="Churn Risk"
        description="AI-powered churn risk analysis and intervention recommendations."
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Critical"
          value={stats?.critical ?? 0}
          icon="error"
          colorClass="bg-destructive/10 text-destructive"
          isLoading={isLoading}
        />
        <StatCard
          label="High"
          value={stats?.high ?? 0}
          icon="warning"
          colorClass="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
          isLoading={isLoading}
        />
        <StatCard
          label="Medium"
          value={stats?.medium ?? 0}
          icon="info"
          colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          isLoading={isLoading}
        />
        <StatCard
          label="Low"
          value={stats?.low ?? 0}
          icon="check_circle"
          colorClass="bg-primary/10 text-primary"
          isLoading={isLoading}
        />
        <StatCard
          label="Minimal"
          value={stats?.minimal ?? 0}
          icon="verified"
          colorClass="bg-success/10 text-success"
          isLoading={isLoading}
        />
      </div>

      {/* Date Range + SearchFilterBar */}
      <div className="flex flex-col gap-3">
        <div
          className="flex items-center gap-2"
          role="group" // NOSONAR typescript:S6819 — ARIA group for date-range filter buttons; <fieldset> requires <legend> and changes layout
          aria-label="Date range"
        >
          {DATE_RANGES.map((dr) => (
            <Button
              key={dr}
              variant={dateRange === dr ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateRange(dr)}
            >
              {dr}
            </Button>
          ))}
        </div>

        <SearchFilterBar
          searchValue={filterState.values.search}
          onSearchChange={(v) => filterState.set('search', v)}
          searchPlaceholder="Search by entity name..."
          searchAriaLabel="Search churn risk analyses"
          filters={[
            {
              id: 'entityType',
              label: 'Entity Type',
              options: ENTITY_TYPE_OPTIONS,
              value: filterState.values.entityType,
              onChange: (v) => filterState.set('entityType', v),
            },
            {
              id: 'riskLevel',
              label: 'Risk Level',
              options: RISK_LEVEL_OPTIONS,
              value: filterState.values.riskLevel,
              onChange: (v) => filterState.set('riskLevel', v),
            },
          ]}
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

      {/* Gauge + Risk Distribution side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HealthScoreGauge score={stats?.avgEngagement ?? 0} label="Avg Engagement" />
        <RiskIndicators distribution={distribution ?? {}} total={stats?.total ?? 0} />
      </div>

      {/* Intervention Alerts */}
      <InterventionAlerts customers={atRiskCustomers} />

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Churn Risk Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <ChurnTrendChart trends={trends} />
          </Suspense>
        </CardContent>
      </Card>

      {/* At-Risk Customer List */}
      {customerListContent}
    </div>
  );
}
