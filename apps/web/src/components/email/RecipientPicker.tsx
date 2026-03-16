'use client';

import { useState, useRef, useCallback, useId, useMemo } from 'react';
import { X, User, Briefcase, Mail } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

export interface Recipient {
  name: string;
  email: string;
}

type SuggestionSource = 'contact' | 'lead' | 'email';

interface ScoredSuggestion {
  name: string;
  email: string;
  source: SuggestionSource;
  detail?: string;
  score: number;
}

interface RecipientPickerProps {
  label: string;
  value: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  className?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/;

const SOURCE_CONFIG: Record<SuggestionSource, { icon: typeof User; label: string; color: string }> =
  {
    contact: { icon: User, label: 'Contact', color: 'text-blue-500 bg-blue-500/10' },
    lead: { icon: Briefcase, label: 'Lead', color: 'text-amber-500 bg-amber-500/10' },
    email: { icon: Mail, label: 'Email', color: 'text-emerald-500 bg-emerald-500/10' },
  };

/**
 * Field Autocomplete Algorithm
 * score = w1·string_match + w2·contact_type + w3·completeness + w4·prefix_match
 *
 * Weights:
 *   string_match  (0.45) — how well the query matches name or email
 *   contact_type  (0.25) — contacts > leads > email-only
 *   completeness  (0.15) — full name > email-only
 *   prefix_match  (0.15) — exact prefix on any token scores highest
 */
function computeScore(
  query: string,
  email: string,
  name: string,
  source: SuggestionSource
): number {
  const q = query.toLowerCase();
  const e = email.toLowerCase();
  const n = name.toLowerCase();

  // String match (0–1)
  let stringMatch = 0;
  if (e === q || n === q) {
    stringMatch = 1.0;
  } else if (e.startsWith(q) || n.startsWith(q)) {
    stringMatch = 0.9;
  } else {
    // Check individual name tokens
    const tokens = n.split(/\s+/);
    if (tokens.some((t) => t.startsWith(q))) {
      stringMatch = 0.8;
    } else if (e.includes(q) || n.includes(q)) {
      stringMatch = 0.5;
    }
  }

  // Contact type (0–1)
  const typeScore = source === 'contact' ? 1.0 : source === 'lead' ? 0.6 : 0.3;

  // Completeness — has real name vs just email (0–1)
  const completeness = name && name !== email ? 1.0 : 0.3;

  // Prefix match bonus — exact email prefix before @ (0–1)
  const emailLocal = e.split('@')[0] ?? '';
  const prefixMatch = emailLocal.startsWith(q) ? 1.0 : 0;

  return 0.45 * stringMatch + 0.25 * typeScore + 0.15 * completeness + 0.15 * prefixMatch;
}

export function RecipientPicker({
  label,
  value,
  onChange,
  className,
}: Readonly<RecipientPickerProps>) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const inputId = useId();

  const debouncedQuery = useDebounce(inputValue, 200);
  const queryEnabled = debouncedQuery.length >= 1;

  // Search contacts (fast endpoint, tenant-scoped, <200ms KPI)
  const contactsQuery = trpc.contact.search.useQuery(
    { query: debouncedQuery, limit: 10 },
    { enabled: queryEnabled }
  );

  // Search leads
  const leadsQuery = trpc.lead.list.useQuery(
    { search: debouncedQuery, limit: 10 },
    { enabled: queryEnabled }
  );

  // Merge, deduplicate, score, and sort suggestions
  const suggestions = useMemo((): ScoredSuggestion[] => {
    if (!debouncedQuery) return [];

    const all: ScoredSuggestion[] = [];
    const seen = new Set(value.map((r) => r.email.toLowerCase()));

    // Add contacts
    for (const c of contactsQuery.data?.contacts ?? []) {
      const email = c.email?.toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
      all.push({
        name: name || email,
        email: c.email,
        source: 'contact',
        detail: c.title ?? c.department ?? undefined,
        score: computeScore(debouncedQuery, c.email, name, 'contact'),
      });
    }

    // Add leads (skip if already seen as contact)
    for (const l of (leadsQuery.data as { leads?: Array<Record<string, unknown>> })?.leads ?? []) {
      const email = (l.email as string)?.toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const name = `${(l.firstName as string) ?? ''} ${(l.lastName as string) ?? ''}`.trim();
      all.push({
        name: name || email,
        email: l.email as string,
        source: 'lead',
        detail: (l.company as string) ?? undefined,
        score: computeScore(debouncedQuery, l.email as string, name, 'lead'),
      });
    }

    return all.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [contactsQuery.data, leadsQuery.data, debouncedQuery, value]);

  const isLoading = queryEnabled && (contactsQuery.isLoading || leadsQuery.isLoading);

  const addRecipient = useCallback(
    (recipient: Recipient) => {
      onChange([...value, recipient]);
      setInputValue('');
      setIsOpen(false);
      setHighlightIndex(-1);
      setError(null);
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const removeRecipient = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange]
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(e.target.value.length > 0);
    setHighlightIndex(-1);
    setError(null);
  }, []);

  const handleEnterKey = useCallback(() => {
    if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
      const s = suggestions[highlightIndex];
      addRecipient({ name: s.name, email: s.email });
      return;
    }
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (EMAIL_REGEX.test(trimmed)) {
      addRecipient({ name: trimmed, email: trimmed });
    } else {
      setError('Invalid email address');
    }
  }, [highlightIndex, suggestions, inputValue, addRecipient]);

  const openDropdownIfNeeded = useCallback(() => {
    if (!isOpen && inputValue) setIsOpen(true);
  }, [isOpen, inputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEnterKey();
      } else if (e.key === 'Backspace') {
        if (!inputValue && value.length > 0) onChange(value.slice(0, -1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdownIfNeeded();
        setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setHighlightIndex(-1);
      }
    },
    [handleEnterKey, inputValue, value, onChange, openDropdownIfNeeded, suggestions.length]
  );

  const highlightedId = highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined;

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div
        role="combobox" // NOSONAR typescript:S6819 — multi-value combobox container with chip tags
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-owns={listboxId}
        className={cn(
          'flex flex-wrap items-center gap-1 rounded-md border border-input px-2 py-1.5 text-sm',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1'
        )}
      >
        {value.map((recipient, i) => (
          <span
            key={recipient.email}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
          >
            <span>{recipient.name || recipient.email}</span>
            <button
              type="button"
              aria-label={`Remove ${recipient.name || recipient.email}`}
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-destructive/20 focus:outline-none focus:ring-1 focus:ring-ring"
              onClick={() => removeRecipient(i)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => inputValue && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder="Add recipient..."
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={highlightedId}
          className="min-w-[120px] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>

      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}

      {isOpen && (suggestions.length > 0 || isLoading) ? (
        <ul
          id={listboxId}
          role="listbox" // NOSONAR typescript:S6819,S6842 — ARIA listbox for autocomplete suggestions
          aria-label={`${label} suggestions`}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {isLoading && suggestions.length === 0 && (
            <li className="px-2 py-2 text-sm text-muted-foreground">Searching...</li>
          )}
          {suggestions.map((suggestion, i) => {
            const config = SOURCE_CONFIG[suggestion.source];
            const Icon = config.icon;

            return (
              <li
                key={`${suggestion.source}-${suggestion.email}`}
                id={`${listboxId}-option-${i}`}
                role="option" // NOSONAR typescript:S6819,S6842
                aria-selected={i === highlightIndex}
                data-highlighted={i === highlightIndex ? 'true' : undefined}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm',
                  i === highlightIndex && 'bg-accent text-accent-foreground'
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addRecipient({ name: suggestion.name, email: suggestion.email });
                }}
              >
                {/* Source-typed avatar */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0',
                    config.color
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>

                {/* Name + email + detail */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{suggestion.name}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        config.color
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {suggestion.email}
                    {suggestion.detail && (
                      <span className="ml-1.5 text-muted-foreground/70">
                        &middot; {suggestion.detail}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
