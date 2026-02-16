'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SearchInput } from '@intelliflow/ui';
import { useDebouncedCallback } from 'use-debounce';
import type { DocCategory } from '@/test/fixtures/docs-data';

interface DocsSearchProps {
  categories: DocCategory[];
  onFilter: (filtered: DocCategory[]) => void;
}

export function DocsSearch({ categories, onFilter }: DocsSearchProps) {
  const [query, setQuery] = useState('');
  const [resultCount, setResultCount] = useState(categories.length);
  const inputRef = useRef<HTMLInputElement>(null);

  const filterCategories = useDebouncedCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      onFilter(categories);
      setResultCount(categories.length);
      return;
    }

    const lower = searchQuery.toLowerCase();
    const filtered = categories.filter(
      (c) => c.title.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower)
    );
    onFilter(filtered);
    setResultCount(filtered.length);
  }, 300);

  // Initial call to set all categories — only on mount
  useEffect(() => {
    onFilter(categories);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      filterCategories(value);
    },
    [filterCategories]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    onFilter(categories);
    setResultCount(categories.length);
  }, [categories, onFilter]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setQuery('');
        onFilter(categories);
        setResultCount(categories.length);
      }
    },
    [categories, onFilter]
  );

  const hasQuery = query.trim().length > 0;

  return (
    <div>
      <SearchInput
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onClear={handleClear}
        onKeyDown={handleKeyDown}
        placeholder="Search documentation..."
        aria-label="Search documentation"
      />
      <div aria-live="polite" className="sr-only">
        {hasQuery && resultCount === 0
          ? 'No results found'
          : hasQuery
            ? `${resultCount} result${resultCount === 1 ? '' : 's'} found`
            : ''}
      </div>
      {hasQuery && resultCount === 0 && (
        <p className="text-sm text-muted-foreground mt-4 text-center">
          No results found for &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  );
}
