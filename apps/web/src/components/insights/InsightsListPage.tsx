/**
 * InsightsListPage — Main AI Insights list with pagination
 *
 * Filtering is handled by the sidebar navigation via URL ?type= param.
 *
 * Task: PG-160 — View All AI Insights page
 */

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared';
import { InsightCard } from './InsightCard';
import { InsightTypeBadge } from './InsightTypeBadge';
import type { AIInsightType } from '@intelliflow/validators';

const VALID_TYPES: AIInsightType[] = ['warning', 'opportunity', 'reminder', 'achievement'];

export function InsightsListPage() {
  const searchParams = useSearchParams();
  const typeFromUrl = searchParams.get('type') as AIInsightType | null;

  const selectedType = typeFromUrl && VALID_TYPES.includes(typeFromUrl) ? typeFromUrl : null;
  const types = selectedType ? [selectedType] : undefined;
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, error } = trpc.home.getAllInsights.useQuery({
    limit: 20,
    cursor,
    types,
  });

  const displayInsights = data?.insights ?? [];
  const hasMore = data?.hasMore ?? false;
  const nextCursor = data?.nextCursor;

  function handleLoadMore() {
    if (nextCursor) {
      setCursor(nextCursor);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with breadcrumb */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'AI & Agents', href: '/agent-approvals' },
          {
            label: selectedType
              ? `${selectedType.charAt(0).toUpperCase()}${selectedType.slice(1)}s`
              : 'All Insights',
          },
        ]}
        title={
          selectedType
            ? `${selectedType.charAt(0).toUpperCase()}${selectedType.slice(1)} Insights`
            : 'AI Insights'
        }
        description="AI-generated insights about your deals, leads, tasks, and contacts."
      />

      {/* Content */}
      {error ? (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-red-300 dark:text-red-600">
            error
          </span>
          <p className="text-sm text-red-500 dark:text-red-400 mt-2">
            Failed to load insights. Please try again later.
          </p>
        </div>
      ) : isLoading && !data ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              data-testid="insight-skeleton"
              className="animate-pulse flex gap-4 p-3 rounded-lg border border-slate-100 dark:border-slate-700"
            >
              <div className="shrink-0 w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : displayInsights.length === 0 ? (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">
            lightbulb
          </span>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            No {selectedType ? `${selectedType} ` : ''}insights at this time.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {displayInsights.map((insight) => (
              <div key={insight.id} className="relative">
                <InsightCard insight={insight} />
                <div className="absolute top-3 right-3">
                  <InsightTypeBadge type={insight.type} />
                </div>
              </div>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
