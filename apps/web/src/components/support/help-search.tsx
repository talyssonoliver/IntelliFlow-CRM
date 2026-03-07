'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@intelliflow/ui';

export interface HelpSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
}

export function HelpSearch({
  value,
  onChange,
  placeholder = 'Search help topics...',
  resultCount,
}: Readonly<HelpSearchProps>) {
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      const trimmed = localValue.trim();
      if (trimmed !== value) {
        onChange(trimmed);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [localValue, onChange, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setLocalValue('');
      onChange('');
    }
  };

  return (
    <div role="search" className="w-full">
      <Input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search help topics"
        className="w-full"
      />
      <div aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-muted-foreground min-h-[1.25rem]">
        {resultCount !== undefined
          ? `${resultCount} ${resultCount === 1 ? 'result' : 'results'} found`
          : ''}
      </div>
    </div>
  );
}
