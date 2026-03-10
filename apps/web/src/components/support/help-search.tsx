'use client';

import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { SearchInput } from '@intelliflow/ui';

export interface HelpSearchProps {
  /** Current search value (controlled) */
  value: string;
  /** Called with debounced search value */
  onChange: (value: string) => void;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Number of results to display in the live region */
  resultCount?: number;
}

const DEBOUNCE_MS = 300;

export function HelpSearch({
  value,
  onChange,
  placeholder = 'Search help topics...',
  resultCount,
}: Readonly<HelpSearchProps>) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when controlled value changes externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounced onChange
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      const trimmed = localValue.trim();
      if (trimmed !== value) {
        onChange(trimmed);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [localValue, onChange, value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setLocalValue('');
        onChange('');
      }
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    onChange('');
  }, [onChange]);

  return (
    <div role="search">
      <SearchInput
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onClear={handleClear}
        placeholder={placeholder}
        aria-label="Search help topics"
      />
      {resultCount !== undefined && (
        <p aria-live="polite" className="text-sm text-muted-foreground mt-2">
          {resultCount} {resultCount === 1 ? 'result' : 'results'} found
        </p>
      )}
    </div>
  );
}
