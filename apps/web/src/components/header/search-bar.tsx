'use client';

/**
 * Global Search Bar
 *
 * Inline header search input with a dropdown results panel.
 * Searches across all CRM entities (leads, contacts, accounts, deals,
 * tickets, tasks) via the globalSearch.query tRPC endpoint.
 * Ctrl+K / Cmd+K focuses the input from anywhere.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

// ── Entity display config ───────────────────────────────────────────────

const ENTITY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  LEAD: { label: 'Leads', icon: 'person_add', color: 'text-blue-600 dark:text-blue-400' },
  CONTACT: { label: 'Contacts', icon: 'contacts', color: 'text-emerald-600 dark:text-emerald-400' },
  ACCOUNT: { label: 'Accounts', icon: 'business', color: 'text-purple-600 dark:text-purple-400' },
  DEAL: { label: 'Deals', icon: 'handshake', color: 'text-amber-600 dark:text-amber-400' },
  TICKET: { label: 'Tickets', icon: 'confirmation_number', color: 'text-red-600 dark:text-red-400' },
  TASK: { label: 'Tasks', icon: 'task_alt', color: 'text-indigo-600 dark:text-indigo-400' },
};

// ── Component ───────────────────────────────────────────────────────────

interface SearchBarProps {
  placeholder?: string;
  className?: string;
}

export function SearchBar({ placeholder = 'Search...', className = '' }: Readonly<SearchBarProps>) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const deferredQuery = React.useDeferredValue(query);

  const isQueryValid = deferredQuery.trim().length >= 2;

  const searchResult = trpc.globalSearch.query.useQuery(
    { query: deferredQuery.trim(), limit: 5 },
    { enabled: isQueryValid }
  );

  // Group results by entity type
  const grouped = React.useMemo(() => {
    if (!searchResult.data?.results) return [];
    const map = new Map<string, typeof searchResult.data.results>();
    for (const hit of searchResult.data.results) {
      const group = map.get(hit.entityType) ?? [];
      group.push(hit);
      map.set(hit.entityType, group);
    }
    return Array.from(map.entries());
  }, [searchResult.data]);

  // Show dropdown when typing, hide when empty
  React.useEffect(() => {
    setIsOpen(query.trim().length > 0);
  }, [query]);

  // Ctrl+K / Cmd+K to focus
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const navigateTo = React.useCallback(
    (href: string) => {
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
      router.push(href);
    },
    [router]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      if (e.key === 'Enter' && grouped.length > 0) {
        e.preventDefault();
        const firstHit = grouped[0]?.[1]?.[0];
        if (firstHit) navigateTo(firstHit.href);
      }
    },
    [grouped, navigateTo]
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input */}
      <span
        className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground pointer-events-none z-10"
        aria-hidden="true"
      >
        search
      </span>
      <input
        ref={inputRef}
        type="search"
        aria-label="Search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (query.trim().length > 0) setIsOpen(true); }}
        onKeyDown={handleKeyDown}
        className="w-full pl-10 pr-4 py-2 text-sm border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />

      {/* Results dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {/* Not enough chars */}
          {!isQueryValid && (
            <div className="px-4 py-3 text-xs text-muted-foreground text-center">
              Type at least 2 characters to search
            </div>
          )}

          {/* Loading */}
          {isQueryValid && searchResult.isLoading && (
            <div className="px-4 py-3 text-xs text-muted-foreground text-center">
              <span className="material-symbols-outlined text-sm animate-spin mr-1 align-middle">
                progress_activity
              </span>
              Searching...
            </div>
          )}

          {/* No results */}
          {isQueryValid && !searchResult.isLoading && searchResult.data?.results.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground text-center">
              No results for &ldquo;{deferredQuery.trim()}&rdquo;
            </div>
          )}

          {/* Grouped results */}
          {grouped.map(([entityType, hits]) => {
            const config = ENTITY_CONFIG[entityType] ?? {
              label: entityType, icon: 'category', color: 'text-slate-600',
            };
            return (
              <div key={entityType}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/40 border-t border-border first:border-t-0">
                  <span className={`material-symbols-outlined text-xs align-middle mr-1 ${config.color}`}>
                    {config.icon}
                  </span>
                  {config.label}
                </div>
                {hits.map((hit) => (
                  <button
                    key={hit.id}
                    onClick={() => navigateTo(hit.href)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-accent/50 transition-colors focus:outline-none focus:bg-accent/50"
                  >
                    <span className={`material-symbols-outlined text-base ${config.color}`} aria-hidden="true">
                      {config.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">{hit.title}</div>
                      {hit.subtitle && (
                        <div className="text-[11px] text-muted-foreground truncate">{hit.subtitle}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}

          {/* Footer */}
          {searchResult.data && searchResult.data.results.length > 0 && (
            <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-right border-t border-border">
              {searchResult.data.totalCount} results in {searchResult.data.durationMs}ms
            </div>
          )}
        </div>
      )}
    </div>
  );
}
