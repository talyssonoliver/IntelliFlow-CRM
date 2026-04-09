'use client';

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { api } from '@/lib/api';

export interface EntitySearchFieldProps {
  readonly entityType: 'lead' | 'contact' | 'opportunity' | 'account';
  readonly value: string;
  readonly valueName: string;
  readonly onChange: (id: string, name: string) => void;
  readonly accountId?: string;
  readonly disabled?: boolean;
}

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const ENTITY_LABELS: Record<string, string> = {
  lead: 'Lead',
  contact: 'Contact',
  opportunity: 'Deal',
  account: 'Account',
};

export function EntitySearchField({
  entityType,
  value,
  valueName,
  onChange,
  accountId,
  disabled,
}: Readonly<EntitySearchFieldProps>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debouncedSearch = useDebounce(search, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsId = useId();
  const nativeSuggestionsId = useId();
  const suggestionsHintId = useId();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: Readonly<MouseEvent>) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  // Query based on entity type
  const leadQuery = api.lead.list.useQuery(
    { search: debouncedSearch, limit: 5, page: 1 },
    { enabled: entityType === 'lead' && open && debouncedSearch.length > 0 }
  );
  const contactQuery = api.contact.list.useQuery(
    { search: debouncedSearch, limit: 5, page: 1, accountId },
    { enabled: entityType === 'contact' && open && debouncedSearch.length > 0 }
  );
  const opportunityQuery = api.opportunity.list.useQuery(
    { search: debouncedSearch, limit: 5, page: 1 },
    { enabled: entityType === 'opportunity' && open && debouncedSearch.length > 0 }
  );
  const accountQuery = api.account.list.useQuery(
    { search: debouncedSearch, limit: 5, page: 1 },
    { enabled: entityType === 'account' && open && debouncedSearch.length > 0 }
  );

  const getResults = useCallback((): Array<{ id: string; name: string }> => {
    if (entityType === 'lead' && leadQuery.data) {
      return (
        leadQuery.data.data?.map((l) => ({
          id: l.id,
          name: `${l.firstName} ${l.lastName}`,
        })) ?? []
      );
    }
    if (entityType === 'contact' && contactQuery.data) {
      return (
        contactQuery.data.contacts?.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
        })) ?? []
      );
    }
    if (entityType === 'opportunity' && opportunityQuery.data) {
      return (
        opportunityQuery.data.opportunities?.map((o) => ({
          id: o.id,
          name: o.name,
        })) ?? []
      );
    }
    if (entityType === 'account' && accountQuery.data) {
      return (
        accountQuery.data.accounts?.map((a: { id: string; name: string }) => ({
          id: a.id,
          name: a.name,
        })) ?? []
      );
    }
    return [];
  }, [entityType, leadQuery.data, contactQuery.data, opportunityQuery.data, accountQuery.data]);

  const results = getResults();
  let isLoading: boolean;
  if (entityType === 'lead') {
    isLoading = leadQuery.isLoading;
  } else if (entityType === 'contact') {
    isLoading = contactQuery.isLoading;
  } else if (entityType === 'account') {
    isLoading = accountQuery.isLoading;
  } else {
    isLoading = opportunityQuery.isLoading;
  }

  function handleSelect(id: string, name: string) {
    onChange(id, name);
    setSearch('');
    setOpen(false);
    setHighlightIndex(-1);
  }

  function handleClear() {
    onChange('', '');
    setSearch('');
  }

  const handleInputChange = useCallback((nextValue: string) => {
    setSearch(nextValue);
    setHighlightIndex(-1);
    if (!open) setOpen(true);
  }, [open]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!open) setOpen(true);
        setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }

      if (event.key === 'Escape') {
        setOpen(false);
        setHighlightIndex(-1);
        return;
      }

      if (event.key !== 'Enter') return;

      if (highlightIndex >= 0 && highlightIndex < results.length) {
        event.preventDefault();
        const selected = results[highlightIndex];
        handleSelect(selected.id, selected.name);
        return;
      }

      const normalizedSearch = search.trim().toLowerCase();
      const exactMatch = results.find((item) => item.name.toLowerCase() === normalizedSearch);
      if (exactMatch) {
        event.preventDefault();
        handleSelect(exactMatch.id, exactMatch.name);
      }
    },
    [highlightIndex, open, results, search]
  );

  const highlightedResult = highlightIndex >= 0 ? results[highlightIndex] : undefined;
  let suggestionsHint = `Type to search ${ENTITY_LABELS[entityType].toLowerCase()} records.`;
  if (isLoading) {
    suggestionsHint = `Searching ${ENTITY_LABELS[entityType].toLowerCase()} suggestions.`;
  } else if (highlightedResult) {
    suggestionsHint = `${results.length} suggestions available. ${highlightedResult.name} highlighted. Press Enter to select.`;
  } else if (results.length > 0) {
    suggestionsHint = `${results.length} suggestions available. Use arrow keys to choose and Enter to select.`;
  } else if (debouncedSearch.length > 0) {
    suggestionsHint = `No ${ENTITY_LABELS[entityType].toLowerCase()} results found.`;
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-foreground mb-1">
        {ENTITY_LABELS[entityType]}
      </label>
      {value ? (
        <div className="flex items-center gap-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <span className="flex-1 truncate">{valueName}</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Clear selection"
          >
            <span className="material-symbols-outlined !text-[16px]">close</span>
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={search}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${ENTITY_LABELS[entityType].toLowerCase()}s...`}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
          aria-label={`Search ${ENTITY_LABELS[entityType].toLowerCase()}s`}
          autoComplete="off"
          list={nativeSuggestionsId}
          aria-controls={suggestionsId}
          aria-describedby={suggestionsHintId}
        />
      )}
      <p id={suggestionsHintId} aria-live="polite" className="sr-only">
        {suggestionsHint}
      </p>
      {results.length > 0 ? (
        <datalist id={nativeSuggestionsId}>
          {results.map((item) => (
            <option key={`${item.id}-native`} value={item.name} />
          ))}
        </datalist>
      ) : null}

      {open && !value && debouncedSearch.length > 0 && (
        <ul
          id={suggestionsId}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-input bg-background shadow-lg"
          aria-label={`${ENTITY_LABELS[entityType]} suggestions`}
        >
          {isLoading && <li className="px-3 py-2 text-sm text-muted-foreground">Searching...</li>}
          {!isLoading && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No results found</li>
          )}
          {!isLoading &&
            results.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(item.id, item.name)}
                  onFocus={() => setHighlightIndex(index)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(item.id, item.name);
                  }}
                  data-highlighted={index === highlightIndex ? 'true' : undefined}
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent data-[highlighted=true]:bg-accent"
                >
                  {item.name}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
