'use client';

import { useId } from 'react';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';
import type { SortMode } from './search-algorithm';

export interface SearchFiltersProps {
  categoryFilter: string;
  onCategoryChange: (id: string) => void;
  sortBy: SortMode;
  onSortChange: (sort: Readonly<SortMode>) => void;
  popularOnly: boolean;
  onPopularOnlyChange: (value: boolean) => void;
  resultCount?: number;
}

export function SearchFilters({
  categoryFilter,
  onCategoryChange,
  sortBy,
  onSortChange,
  popularOnly,
  onPopularOnlyChange,
  resultCount,
}: Readonly<SearchFiltersProps>) {
  const categoryId = useId();
  const sortId = useId();

  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="sr-only">Filter options</legend>

      <div className="flex items-center gap-2">
        <label htmlFor={categoryId} className="sr-only">
          Category
        </label>
        <select
          id={categoryId}
          value={categoryFilter}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="">All Categories</option>
          {DEFAULT_HELP_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={sortId} className="sr-only">
          Sort by
        </label>
        <select
          id={sortId}
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="relevance">Relevance</option>
          <option value="a-z">A-Z</option>
          <option value="most-articles">Most Articles</option>
        </select>
      </div>

      <button
        type="button"
        onClick={() => onPopularOnlyChange(!popularOnly)}
        aria-pressed={popularOnly}
        aria-label="Popular only"
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
          popularOnly
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-input bg-background text-foreground'
        }`}
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          star
        </span>
        {' '}Popular
      </button>

      {resultCount !== undefined && (
        <span className="text-sm text-muted-foreground ml-auto">
          {resultCount} {resultCount === 1 ? 'result' : 'results'} found
        </span>
      )}
    </fieldset>
  );
}
