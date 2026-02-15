'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export interface EntitySearchFieldProps {
  readonly entityType: 'lead' | 'contact' | 'opportunity';
  readonly value: string;
  readonly valueName: string;
  readonly onChange: (id: string, name: string) => void;
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
};

export function EntitySearchField({ entityType, value, valueName, onChange, disabled }: EntitySearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
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
    { enabled: entityType === 'lead' && open && debouncedSearch.length > 0 },
  );
  const contactQuery = api.contact.list.useQuery(
    { search: debouncedSearch, limit: 5, page: 1 },
    { enabled: entityType === 'contact' && open && debouncedSearch.length > 0 },
  );
  const opportunityQuery = api.opportunity.list.useQuery(
    { search: debouncedSearch, limit: 5, page: 1 },
    { enabled: entityType === 'opportunity' && open && debouncedSearch.length > 0 },
  );

  const getResults = useCallback((): Array<{ id: string; name: string }> => {
    if (entityType === 'lead' && leadQuery.data) {
      return (leadQuery.data as any).leads?.map((l: any) => ({
        id: l.id,
        name: `${l.firstName} ${l.lastName}`,
      })) ?? [];
    }
    if (entityType === 'contact' && contactQuery.data) {
      return (contactQuery.data as any).contacts?.map((c: any) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
      })) ?? [];
    }
    if (entityType === 'opportunity' && opportunityQuery.data) {
      return (opportunityQuery.data as any).opportunities?.map((o: any) => ({
        id: o.id,
        name: o.name,
      })) ?? [];
    }
    return [];
  }, [entityType, leadQuery.data, contactQuery.data, opportunityQuery.data]);

  const results = getResults();
  const isLoading = entityType === 'lead' ? leadQuery.isLoading
    : entityType === 'contact' ? contactQuery.isLoading
    : opportunityQuery.isLoading;

  function handleSelect(id: string, name: string) {
    onChange(id, name);
    setSearch('');
    setOpen(false);
  }

  function handleClear() {
    onChange('', '');
    setSearch('');
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
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${ENTITY_LABELS[entityType].toLowerCase()}s...`}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
          aria-label={`Search ${ENTITY_LABELS[entityType].toLowerCase()}s`}
          role="combobox"
          aria-expanded={open}
        />
      )}

      {open && !value && debouncedSearch.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-lg max-h-48 overflow-y-auto"
          role="listbox"
        >
          {isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
          )}
          {!isLoading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found</div>
          )}
          {!isLoading && results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id, item.name)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              role="option"
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
