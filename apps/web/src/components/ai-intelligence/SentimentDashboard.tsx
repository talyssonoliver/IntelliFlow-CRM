'use client';

/**
 * SentimentDashboard — AI Sentiment Analysis dashboard container (PG-142)
 *
 * Displays sentiment analysis results across leads and contacts with
 * stats cards, trend chart, emotion badges, urgency labels, and key phrases.
 *
 * Uses shared PageHeader + SearchFilterBar components for consistency
 * with other list pages (Leads, Contacts, Tasks, etc.).
 */

import { useState, useCallback, Suspense, lazy } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  cn,
} from '@intelliflow/ui';
import { PageHeader, SearchFilterBar, useMultiFilterState } from '@/components/shared';

import { useSentimentDashboard } from '@/lib/sentiment/hooks';
import type { SentimentFilters } from '@/lib/sentiment/hooks';
import type { SentimentAnalysis } from '@/lib/sentiment/types';
import {
  getSentimentBadgeClass,
  getSentimentIcon,
  getEmotionIcon,
  getEmotionColor,
  getUrgencyBadgeClass,
} from '@/lib/sentiment/sentiment-utils';
import { SENTIMENT_LABELS, URGENCY_LEVELS } from '@intelliflow/domain';

const SentimentTrend = lazy(() => import('./SentimentTrend'));

// ============================================
// Breadcrumb config (shared by error + main)
// ============================================

const BREADCRUMBS = [
  { label: 'AI & Agents', href: '/agent-approvals' },
  { label: 'Sentiment Analysis' },
];

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

const SENTIMENT_OPTIONS = [
  { value: '', label: 'All Sentiments' },
  ...SENTIMENT_LABELS.map((s) => ({
    value: s,
    label: s
      .replaceAll('_', ' ')
      .toLowerCase()
      .replaceAll(/\b\w/g, (c) => c.toUpperCase()),
  })),
];

const URGENCY_OPTIONS = [
  { value: '', label: 'All Urgency' },
  ...URGENCY_LEVELS.map((u) => ({
    value: u,
    label: u.charAt(0) + u.slice(1).toLowerCase(),
  })),
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'score', label: 'By Score' },
  { value: 'urgency', label: 'By Urgency' },
];

const DATE_RANGES = ['7d', '30d', '90d'] as const;

const FILTER_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'positive', label: 'Positive', color: 'bg-green-500' },
  { id: 'negative', label: 'Negative', color: 'bg-red-500' },
  { id: 'urgent', label: 'Urgent', color: 'bg-amber-500' },
];

// ============================================
// Analysis Card (internal)
// ============================================

function AnalysisCard({ analysis }: Readonly<{ analysis: SentimentAnalysis }>) {
  const topEmotions = analysis.emotions.slice(0, 3);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Header: entity + sentiment badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
                  getSentimentBadgeClass(analysis.sentiment)
                )}
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  {getSentimentIcon(analysis.sentiment)}
                </span>
                {analysis.sentiment.replaceAll('_', ' ')}
              </span>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  getUrgencyBadgeClass(analysis.urgency)
                )}
              >
                {analysis.urgency}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTimeAgo(analysis.analyzedAt)}
            </span>
          </div>

          {/* Entity info */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{analysis.entityName}</span>
            <Badge variant="outline" className="text-xs">
              {analysis.entityType}
            </Badge>
          </div>

          {/* Emotions */}
          {topEmotions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" data-testid="emotion-badges">
              {topEmotions.map((e) => (
                <span
                  key={e.emotion}
                  className={cn(
                    'inline-flex items-center gap-1 text-xs',
                    getEmotionColor(e.emotion)
                  )}
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {getEmotionIcon(e.emotion)}
                  </span>
                  {e.emotion.toLowerCase()} ({Math.round(e.intensity * 100)}%)
                </span>
              ))}
            </div>
          ) : null}

          {/* Key phrases */}
          {analysis.keyPhrases.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" data-testid="key-phrases">
              {analysis.keyPhrases.map((kp) => (
                <span
                  key={kp.phrase}
                  className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-xs truncate max-w-[200px]',
                    (() => {
                      if (kp.sentiment === 'positive')
                        return 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400';
                      if (kp.sentiment === 'negative')
                        return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';
                      return 'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400';
                    })()
                  )}
                  title={kp.phrase}
                >
                  {kp.phrase}
                </span>
              ))}
            </div>
          ) : null}

          {/* Confidence */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Confidence: {Math.round(analysis.confidence * 100)}%</span>
            {analysis.confidence < 0.3 ? (
              <span
                className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5"
                data-testid="low-confidence-warning"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                  warning
                </span>{' '}
                Low confidence
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ============================================
// SentimentDashboard Component
// ============================================

export function SentimentDashboard() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [page, setPage] = useState(1);
  const [activeChip, setActiveChip] = useState('all');

  const filterState = useMultiFilterState({
    entityType: 'all',
    sentiment: '',
    urgency: '',
    sort: 'newest',
    search: '',
  });

  const filters: SentimentFilters = {
    entityType: filterState.values.entityType as 'all' | 'lead' | 'contact',
    dateRange,
    page,
    limit: 20,
  };

  const { stats, recentAnalyses, trends, isLoading, error, refetch } =
    useSentimentDashboard(filters);

  const handleChipChange = useCallback(
    (chipId: string) => {
      setActiveChip(chipId);
      if (chipId === 'positive') {
        filterState.set('sentiment', 'POSITIVE');
      } else if (chipId === 'negative') {
        filterState.set('sentiment', 'NEGATIVE');
      } else if (chipId === 'urgent') {
        filterState.set('urgency', 'CRITICAL');
      } else {
        filterState.set('sentiment', '');
        filterState.set('urgency', '');
      }
    },
    [filterState]
  );

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // Apply client-side filters on recentAnalyses
  let filteredAnalyses = recentAnalyses;

  if (filterState.values.sentiment) {
    filteredAnalyses = filteredAnalyses.filter((a) => a.sentiment === filterState.values.sentiment);
  }

  if (filterState.values.urgency) {
    filteredAnalyses = filteredAnalyses.filter((a) => a.urgency === filterState.values.urgency);
  }

  if (filterState.values.search) {
    const searchLower = filterState.values.search.toLowerCase();
    filteredAnalyses = filteredAnalyses.filter((a) =>
      a.entityName.toLowerCase().includes(searchLower)
    );
  }

  if (filterState.values.sort === 'score') {
    filteredAnalyses = [...filteredAnalyses].sort((a, b) => b.sentimentScore - a.sentimentScore);
  } else if (filterState.values.sort === 'urgency') {
    const urgencyOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      NONE: 4,
    };
    filteredAnalyses = [...filteredAnalyses].sort(
      (a, b) => (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4)
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          breadcrumbs={BREADCRUMBS}
          title="Sentiment Analysis"
          description="AI-powered sentiment insights across leads and contacts."
        />
        <Card>
          <CardContent className="p-8 text-center">
            <span
              className="material-symbols-outlined text-4xl text-red-500 mb-2"
              aria-hidden="true"
            >
              error
            </span>
            <p className="text-sm text-muted-foreground mb-4">Failed to load sentiment data</p>
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
      {/* Header — matches Leads, Contacts, Tasks, etc. */}
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="Sentiment Analysis"
        description="AI-powered sentiment insights across leads and contacts."
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Total"
          value={stats?.total ?? 0}
          icon="analytics"
          colorClass="bg-primary/10 text-primary"
          isLoading={isLoading}
        />
        <StatCard
          label="Positive"
          value={stats?.positive ?? 0}
          icon="thumb_up"
          colorClass="bg-success/10 text-success"
          isLoading={isLoading}
        />
        <StatCard
          label="Negative"
          value={stats?.negative ?? 0}
          icon="thumb_down"
          colorClass="bg-destructive/10 text-destructive"
          isLoading={isLoading}
        />
        <StatCard
          label="Neutral"
          value={stats?.neutral ?? 0}
          icon="remove_circle_outline"
          colorClass="bg-muted text-muted-foreground"
          isLoading={isLoading}
        />
        <StatCard
          label="Urgent"
          value={stats?.urgentCount ?? 0}
          icon="priority_high"
          colorClass="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          isLoading={isLoading}
        />
      </div>

      {/* Date Range + SearchFilterBar */}
      <div className="flex flex-col gap-3">
        <fieldset className="flex items-center gap-2 border-0 p-0 m-0">
          <legend className="sr-only">Date range</legend>
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
        </fieldset>

        <SearchFilterBar
          searchValue={filterState.values.search}
          onSearchChange={(v) => filterState.set('search', v)}
          searchPlaceholder="Search by entity name..."
          searchAriaLabel="Search sentiment analyses"
          filters={[
            {
              id: 'entityType',
              label: 'Entity Type',
              options: ENTITY_TYPE_OPTIONS,
              value: filterState.values.entityType,
              onChange: (v) => filterState.set('entityType', v),
            },
            {
              id: 'sentiment',
              label: 'Sentiment',
              options: SENTIMENT_OPTIONS,
              value: filterState.values.sentiment,
              onChange: (v) => filterState.set('sentiment', v),
            },
            {
              id: 'urgency',
              label: 'Urgency',
              options: URGENCY_OPTIONS,
              value: filterState.values.urgency,
              onChange: (v) => filterState.set('urgency', v),
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

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sentiment Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <SentimentTrend trends={trends} />
          </Suspense>
        </CardContent>
      </Card>

      {/* Recent Analyses */}
      {(() => {
        if (isLoading)
          return (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-lg" /> // NOSONAR typescript:S6479
              ))}
            </div>
          );
        if (filteredAnalyses.length === 0)
          return (
            <div data-testid="empty-state">
              <EmptyState entity="insights" phase="passive" />
            </div>
          );
        return (
          <div className="space-y-3">
            {filteredAnalyses.map((analysis) => (
              <AnalysisCard key={analysis.id} analysis={analysis} />
            ))}
            {recentAnalyses.length >= 20 ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={handleLoadMore} data-testid="load-more-button">
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}
