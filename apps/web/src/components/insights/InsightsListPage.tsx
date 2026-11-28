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
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, EmptyState } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
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

const VALID_TYPES = new Set<AIInsightType>(['warning', 'opportunity', 'reminder', 'achievement']);

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

function InsightsEmptyState({
  filtered,
  onClearFilter,
}: Readonly<{ filtered: boolean; onClearFilter: () => void }>) {
  return (
    <Card className="p-12">
      <EmptyState
        entity="insights"
        variant={filtered ? 'filtered' : 'empty'}
        showCta={false}
        action={filtered ? { label: 'Clear filters', onClick: onClearFilter } : undefined}
      />
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

  const selectedType = typeFromUrl && VALID_TYPES.has(typeFromUrl) ? typeFromUrl : null;
  const types = selectedType ? [selectedType] : undefined;
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = trpc.home.getAllInsights.useQuery({
    limit: 20,
    cursor,
    types,
  });

  const allInsights = useMemo<SerializedAIInsight[]>(
    () => (data?.insights ?? []) as SerializedAIInsight[],
    [data?.insights]
  );
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
      {/* Owner 21/11: the shared hero and the shared toolbar, like every list page. */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'AI & Agents', href: '/agent-approvals' },
        ]}
        title="AI Insights"
        description="AI-generated insights about your deals, leads, tasks, and contacts"
      >
        <p className="text-sm text-white/75">
          {allInsights.length} insight{allInsights.length === 1 ? '' : 's'}
        </p>
      </PageHeader>

      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search insights..."
        searchAriaLabel="Search insights"
        filterChips={{
          options: TYPE_FILTERS.map(({ key, label }) => ({ id: key, label })),
          value: selectedType ?? 'all',
          onChange: (id) => handleTypeFilter(id as AIInsightType | 'all'),
        }}
      />

      {/* Content */}
      {error && <InsightsErrorState />}

      {isLoading && !data && <InsightsLoadingState />}

      {!error && !isLoading && displayInsights.length === 0 && (
        <InsightsEmptyState
          // The type (URL) and the search box both narrow the list: either one makes the
          // empty list a filtered one, and Clear resets both.
          filtered={Boolean(selectedType) || searchQuery.trim() !== ''}
          onClearFilter={() => {
            setSearchQuery('');
            handleTypeFilter('all');
          }}
        />
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
            className="px-4 py-2 text-sm font-medium text-[#2a78f6] bg-[#2a78f6]/10 rounded-lg hover:bg-[#2a78f6]/20 transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
