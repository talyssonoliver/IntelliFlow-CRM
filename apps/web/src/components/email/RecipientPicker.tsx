'use client';

import { useState, useRef, useCallback, useId } from 'react';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

export interface Recipient {
  name: string;
  email: string;
}

interface ContactSuggestion {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface RecipientPickerProps {
  label: string;
  value: Recipient[];
  onChange: (recipients: Recipient[]) => void;
  className?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+\.[^\s@.]+$/;

export function RecipientPicker({ label, value, onChange, className }: RecipientPickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const inputId = useId();

  const debouncedQuery = useDebounce(inputValue, 300);

  const { data: contactsData } = trpc.contact.list.useQuery(
    { search: debouncedQuery, limit: 5 },
    { enabled: debouncedQuery.length >= 1 }
  );

  const contacts: ContactSuggestion[] = (contactsData?.contacts ?? []) as ContactSuggestion[];

  const suggestions = contacts.filter((c) => !value.some((r) => r.email === c.email));

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
      const contact = suggestions[highlightIndex];
      addRecipient({
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
      });
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleEnterKey();
          break;
        case 'Backspace':
          if (!inputValue && value.length > 0) onChange(value.slice(0, -1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen && inputValue) setIsOpen(true);
          setHighlightIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'Escape':
          setIsOpen(false);
          setHighlightIndex(-1);
          break;
      }
    },
    [handleEnterKey, inputValue, value, onChange, isOpen, suggestions.length]
  );

  const highlightedId = highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined;

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <div
        role="combobox"
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

      {isOpen && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {suggestions.map((contact: ContactSuggestion, i: number) => (
            <li
              key={contact.id}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              data-highlighted={i === highlightIndex ? 'true' : undefined}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                i === highlightIndex && 'bg-accent text-accent-foreground'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                addRecipient({
                  name: `${contact.firstName} ${contact.lastName}`.trim(),
                  email: contact.email,
                });
              }}
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                {(contact.firstName?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <div className="font-medium">
                  {contact.firstName} {contact.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{contact.email}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
