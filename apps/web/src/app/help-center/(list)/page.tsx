'use client';

import { Suspense, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageHeader, SearchFilterBar } from '@/components/shared';
import { HelpCategories } from '@/components/support';
import {
  searchHelpContent,
  DEFAULT_SEARCH_FILTERS,
} from '@/components/support/search-algorithm';
import type { SortMode } from '@/components/support/search-algorithm';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';

// ---------------------------------------------------------------------------
// Filter options derived from help category data
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  ...DEFAULT_HELP_CATEGORIES.map((cat) => ({
    value: cat.id,
    label: cat.title,
  })),
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'a-z', label: 'A-Z' },
  { value: 'most-articles', label: 'Most Articles' },
];

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function HelpCenterSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-64 bg-muted rounded" />
      <div className="h-10 w-full bg-muted rounded" />
      <div className="h-10 w-96 bg-muted rounded" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="h-32 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function HelpCenterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const query = searchParams.get('q') ?? '';
  const categoryFilter = searchParams.get('category') ?? '';
  const sortBy = (searchParams.get('sort') as SortMode) ?? 'relevance';
  const popularOnly = searchParams.get('popular') === 'true';

  const filters = useMemo(
    () => ({
      categoryId: categoryFilter,
      sortMode: sortBy,
      popularOnly,
    }),
    [categoryFilter, sortBy, popularOnly]
  );

  const results = useMemo(
    () => searchHelpContent(query, DEFAULT_HELP_CATEGORIES, filters),
    [query, filters]
  );

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === '' || value === DEFAULT_SEARCH_FILTERS.categoryId && key === 'category' ||
            value === DEFAULT_SEARCH_FILTERS.sortMode && key === 'sort' ||
            value === 'false' && key === 'popular') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '/help-center');
    },
    [searchParams, router]
  );

  const handleSearchChange = useCallback(
    (value: string) => updateParams({ q: value }),
    [updateParams]
  );

  const handlePopularChipChange = useCallback(
    (chipValue: string) => {
      updateParams({ popular: chipValue === 'popular' ? 'true' : 'false' });
    },
    [updateParams]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <PageHeader
          title="Help Center"
          description="Find answers, guides, and documentation for IntelliFlow CRM"
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center' }]}
        />

        <div className="mb-6">
          <SearchFilterBar
            searchValue={query}
            onSearchChange={handleSearchChange}
            searchPlaceholder="Search help topics..."
            searchAriaLabel="Search help topics"
            filters={[
              {
                id: 'category',
                label: 'Category',
                icon: 'category',
                options: CATEGORY_OPTIONS,
                value: categoryFilter,
                onChange: (v) => updateParams({ category: v }),
              },
            ]}
            filterChips={{
              options: [
                { id: 'all', label: 'All' },
                { id: 'popular', label: 'Popular' },
              ],
              value: popularOnly ? 'popular' : 'all',
              onChange: handlePopularChipChange,
            }}
            sort={{
              options: SORT_OPTIONS,
              value: sortBy,
              onChange: (v) => updateParams({ sort: v }),
            }}
          />
        </div>

        <HelpCategories categories={results.map((r) => r.item)} />
      </div>
    </div>
  );
}

export default function HelpCenterPage() {
  return (
    <Suspense fallback={<HelpCenterSkeleton />}>
      <HelpCenterContent />
    </Suspense>
  );
}
