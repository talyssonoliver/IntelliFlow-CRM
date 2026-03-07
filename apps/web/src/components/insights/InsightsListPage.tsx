/**
 * InsightsListPage — Main AI Insights list with inline filtering and search
 *
 * Follows the same layout pattern as /agent-approvals (breadcrumb, title,
 * Card-wrapped filter bar, Card-wrapped content).
 *
 * Task: PG-160 — View All AI Insights page
 */

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { InsightCard, type SerializedAIInsight } from './InsightCard';
import { InsightTypeBadge } from './InsightTypeBadge';
import type { AIInsightType } from '@intelliflow/validators';

// Material Symbols icon helper (same pattern as agent-approvals)
const Icon = ({ name, className = '' }: Readonly<{ name: string; className?: string }>) => (
  <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
    {name}
  </span>
);

const VALID_TYPES: AIInsightType[] = ['warning', 'opportunity', 'reminder', 'achievement'];

const TYPE_FILTERS: Array<{ key: AIInsightType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'warning', label: 'Warnings' },
  { key: 'opportunity', label: 'Opportunities' },
  { key: 'reminder', label: 'Reminders' },
  { key: 'achievement', label: 'Achievements' },
];

// =============================================================================
// Sub-components
// =============================================================================

function InsightsLoadingState() {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center justify-center">
        <Icon name="hourglass_empty" className="text-4xl text-slate-400 animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400">Loading insights...</p>
      </div>
    </Card>
  );
}

function InsightsEmptyState({ selectedType }: Readonly<{ selectedType: string | null }>) {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <Icon name="lightbulb" className="text-3xl text-slate-400" />
        </div>
        <h2 className="text-lg font-medium text-slate-900 dark:text-white mb-1">
          No insights found
        </h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm">
          {selectedType
            ? `No ${selectedType} insights at this time. Try a different filter.`
            : 'No AI insights at this time. Check back later.'}
        </p>
      </div>
    </Card>
  );
}

function InsightsErrorState() {
  return (
    <Card className="p-4 bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
      <h2 className="text-red-800 dark:text-red-300 font-medium">Error loading insights</h2>
      <p className="text-red-600 dark:text-red-400 text-sm mt-1">
        Failed to load insights. Please try again later.
      </p>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function InsightsListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const typeFromUrl = searchParams.get('type') as AIInsightType | null;

  const selectedType = typeFromUrl && VALID_TYPES.includes(typeFromUrl) ? typeFromUrl : null;
  const types = selectedType ? [selectedType] : undefined;
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = trpc.home.getAllInsights.useQuery({
    limit: 20,
    cursor,
    types,
  });

  const allInsights = (data?.insights ?? []) as SerializedAIInsight[];
  const hasMore = data?.hasMore ?? false;
  const nextCursor = data?.nextCursor;

  const displayInsights = useMemo(() => {
    if (!searchQuery.trim()) return allInsights;
    const q = searchQuery.toLowerCase();
    return allInsights.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.suggestedAction?.toLowerCase().includes(q)
    );
  }, [allInsights, searchQuery]);

  function handleLoadMore() {
    if (nextCursor) {
      setCursor(nextCursor);
    }
  }

  function handleTypeFilter(type: AIInsightType | 'all') {
    setCursor(undefined);
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
        <Link href="/dashboard" className="hover:text-[#137fec]">
          Dashboard
        </Link>
        <span>/</span>
        <Link href="/agent-approvals" className="hover:text-[#137fec]">
          AI &amp; Agents
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white font-medium">All Insights</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            AI Insights
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            AI-generated insights about your deals, leads, tasks, and contacts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {allInsights.length} insight{allInsights.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filter & Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Icon name="filter_list" className="text-base text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Filter:
              </span>
            </div>
            <div className="flex flex-wrap gap-2" data-testid="filter-buttons">
              {TYPE_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleTypeFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    (key === 'all' && !selectedType) || selectedType === key
                      ? 'bg-[#137fec] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative sm:ml-auto w-full sm:w-64">
            <Icon
              name="search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg"
            />
            <input
              type="text"
              placeholder="Search insights..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec]/40"
            />
          </div>
        </div>
      </Card>

      {/* Content */}
      {error && <InsightsErrorState />}

      {isLoading && !data && <InsightsLoadingState />}

      {!error && !isLoading && displayInsights.length === 0 && (
        <InsightsEmptyState selectedType={selectedType} />
      )}

      {!error && displayInsights.length > 0 && (
        <div className="space-y-4">
          {displayInsights.map((insight) => (
            <Card key={insight.id} className="overflow-hidden relative">
              <InsightCard insight={insight} />
              <div className="absolute top-3 right-3">
                <InsightTypeBadge type={insight.type} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {hasMore && !searchQuery.trim() && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 text-sm font-medium text-[#137fec] bg-[#137fec]/10 rounded-lg hover:bg-[#137fec]/20 transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
