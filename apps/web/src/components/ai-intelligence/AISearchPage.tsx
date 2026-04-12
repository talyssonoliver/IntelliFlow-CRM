'use client';

/**
 * AISearchPage — AI-powered universal search dashboard (PG-144)
 *
 * Enables hybrid (fulltext + semantic) search across all CRM entity types
 * with citation display, source highlighting, and relevance scoring.
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge, Button, EmptyState, Skeleton, Input, cn } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { useAISearch } from '@/lib/ai-search/hooks';
import { SourceHighlight } from './SourceHighlight';
import { CitationDisplay } from './CitationDisplay';
import {
  getSourceIcon,
  getSourceColor,
  getSourceLabel,
  getSourceHref,
  getRelevanceBadgeClass,
  formatRelevanceScore,
} from '@/lib/ai-search/search-utils';
import type {
  SearchResultItem,
  SearchSource,
  SearchType,
  DateRange,
  SortOption,
} from '@/lib/ai-search/types';

// ============================================
// Breadcrumbs
// ============================================

const BREADCRUMBS = [{ label: 'AI & Agents', href: '/agent-approvals' }, { label: 'AI Search' }];

// ============================================
// Stats Card
// ============================================

function StatCard({
  label,
  value,
  icon,
  colorClass,
  isLoading,
}: Readonly<{
  label: string;
  value: string | number;
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

const SOURCE_OPTIONS: { value: SearchSource; label: string }[] = [
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'documents', label: 'Documents' },
  { value: 'notes', label: 'Notes' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'messages', label: 'Messages' },
  { value: 'tickets', label: 'Tickets' },
];

const SEARCH_TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'fulltext', label: 'Fulltext' },
  { value: 'semantic', label: 'Semantic' },
];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'relevance', label: 'By Relevance' },
  { value: 'newest', label: 'Newest First' },
  { value: 'source', label: 'By Source' },
];

const FILTER_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'documents', label: 'Documents' },
  { value: 'leads', label: 'Leads' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'conversations', label: 'Conversations' },
  { value: 'high-relevance', label: 'High Relevance' },
];

const PAGE_LIMIT = 20;

// ============================================
// Main component
// ============================================

export function AISearchPage() {
  // Search state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sources, setSources] = useState<SearchSource[]>([]);
  const [searchType, setSearchType] = useState<SearchType>('hybrid');
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [offset, setOffset] = useState(0);
  const [activeChip, setActiveChip] = useState('all');

  // Debounce query input (500ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setOffset(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch data
  const {
    results,
    totalResults,
    avgRelevance,
    executionTimeMs,
    sourceCounts,
    isLoading,
    error,
    refetch,
  } = useAISearch({
    query: debouncedQuery,
    sources: sources.length > 0 ? sources : undefined,
    searchType,
    dateRange,
    limit: PAGE_LIMIT,
    offset,
    minRelevance: activeChip === 'high-relevance' ? 0.8 : undefined,
  });

  // Sort results client-side
  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'newest')
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sortBy === 'source') return a.source.localeCompare(b.source);
    return b.relevanceScore - a.relevanceScore;
  });

  const activeSources = Object.keys(sourceCounts).length;

  // Handlers
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        setDebouncedQuery(query);
        setOffset(0);
      }
    },
    [query]
  );

  const handleChipClick = useCallback((chip: string) => {
    setActiveChip(chip);
    setOffset(0);
    if (chip === 'all' || chip === 'high-relevance') {
      setSources([]);
    } else {
      setSources([chip as SearchSource]);
    }
  }, []);

  const handleSourceToggle = useCallback((source: SearchSource) => {
    setSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
    setOffset(0);
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_LIMIT);
  }, []);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    setOffset(0);
    setSources([]);
    setActiveChip('all');
  }, []);

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasMore = results.length > 0 && results.length + offset < totalResults;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={BREADCRUMBS}
        title="AI Search"
        description="Search across your entire CRM using AI-powered hybrid retrieval"
      />

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <span
                className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              >
                search
              </span>
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search across leads, contacts, documents, conversations..."
                className="pl-10 pr-10"
                aria-label="Search query"
              />
              {query && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search type */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Mode:</span>{' '}
                {SEARCH_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSearchType(opt.value);
                      setOffset(0);
                    }}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      searchType === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Date range */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Period:</span>{' '}
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setDateRange(opt.value);
                      setOffset(0);
                    }}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      dateRange === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Sort */}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Sort:</span>{' '}
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      sortBy === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  onClick={() => handleChipClick(chip.value)}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full transition-colors',
                    activeChip === chip.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Source Multi-Select */}
            <div className="flex flex-wrap gap-1">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSourceToggle(opt.value)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors',
                    sources.includes(opt.value)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  )}
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {getSourceIcon(opt.value)}
                  </span>{' '}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {hasQuery && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            label="Total Results"
            value={totalResults}
            icon="database"
            colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            isLoading={isLoading}
          />
          <StatCard
            label="Documents Found"
            value={sourceCounts['documents'] ?? 0}
            icon="description"
            colorClass="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
            isLoading={isLoading}
          />
          <StatCard
            label="Avg Relevance"
            value={formatRelevanceScore(avgRelevance)}
            icon="analytics"
            colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            isLoading={isLoading}
          />
          <StatCard
            label="Response Time"
            value={`${executionTimeMs}ms`}
            icon="speed"
            colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
            isLoading={isLoading}
          />
          <StatCard
            label="Active Sources"
            value={activeSources}
            icon="hub"
            colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Result count announcement for screen readers */}
      <div aria-live="polite" className="sr-only">
        {hasQuery && !isLoading && `${totalResults} results found`}
      </div>

      {/* Content States */}
      {!hasQuery && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-muted-foreground mb-4">
              search
            </span>
            <p className="text-lg font-medium text-muted-foreground">
              Enter a search query to find information across your CRM
            </p>
          </CardContent>
        </Card>
      )}

      {hasQuery && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              {' '}
              {/* NOSONAR typescript:S6479 */}
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {hasQuery && error && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <span className="material-symbols-outlined text-5xl text-destructive mb-4">error</span>
            <p className="text-lg font-medium text-destructive mb-2">Search failed</p>
            <p className="text-sm text-muted-foreground mb-4">
              {error.message || 'An unexpected error occurred'}
            </p>
            <Button onClick={() => refetch()} variant="outline">
              <span className="material-symbols-outlined mr-2 text-sm">refresh</span> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {hasQuery && !isLoading && !error && results.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState entity="search" phase="passive" />
          </CardContent>
        </Card>
      )}

      {/* Results List */}
      {hasQuery && !isLoading && !error && sortedResults.length > 0 && (
        <ul className="space-y-3" aria-label="Search results">
          {sortedResults.map((result) => (
            <li key={result.id}>
              <SearchResultCard result={result} query={debouncedQuery} />
            </li>
          ))}
        </ul>
      )}

      {/* Load More */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button onClick={handleLoadMore} variant="outline">
            <span className="material-symbols-outlined mr-2 text-sm">expand_more</span> Load More
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Search Result Card
// ============================================

function SearchResultCard({
  result,
  query,
}: Readonly<{ result: SearchResultItem; query: string }>) {
  const href = getSourceHref(result.source, result.id);
  const sourceColor = getSourceColor(result.source);
  const isLinked = href !== '#';

  const card = (
    <Card className={cn('transition-shadow', isLinked && 'hover:shadow-md cursor-pointer')}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          {/* Title + Source Badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Badge className={cn('text-xs shrink-0', sourceColor)}>
                <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                  {getSourceIcon(result.source)}
                </span>{' '}
                {getSourceLabel(result.source)}
              </Badge>
              <h3 className="font-medium text-foreground truncate">{result.title}</h3>
            </div>
            <Badge
              className={cn('text-xs shrink-0', getRelevanceBadgeClass(result.relevanceScore))}
            >
              {formatRelevanceScore(result.relevanceScore)}
            </Badge>
          </div>

          {/* Snippet with highlighting */}
          <p className="text-sm text-muted-foreground">
            <SourceHighlight text={result.snippet} query={query} maxLength={300} />
          </p>

          {/* Citation metadata (disableLink to avoid nested <a> tags) */}
          <CitationDisplay
            source={result.source}
            sourceId={result.id}
            title={result.title}
            relevanceScore={result.relevanceScore}
            createdAt={result.createdAt}
            disableLink
          />
        </div>
      </CardContent>
    </Card>
  );

  if (isLinked) {
    return (
      <Link
        href={href}
        className="block focus:outline-none focus:ring-2 focus:ring-primary rounded-lg"
        tabIndex={0}
      >
        {card}
      </Link>
    );
  }

  return card;
}
