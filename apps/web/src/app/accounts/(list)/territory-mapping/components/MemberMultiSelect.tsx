'use client';

/**
 * Multi-select of assignable users for a territory (PG-197). `AssignSheet` is
 * single-select, so this composes Popover + a labelled group of checkboxes —
 * native multi-selection semantics (the Sonar a11y guard prefers native
 * controls over an ARIA listbox). The trigger's accessible name carries the
 * selected count.
 */
import { useState } from 'react';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';

export interface MemberOption {
  id: string;
  name: string;
  title?: string | null;
}

export interface MemberMultiSelectProps {
  id?: string;
  options: MemberOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
  isError?: boolean;
  disabled?: boolean;
}

export function MemberMultiSelect({
  id,
  options,
  selectedIds,
  onChange,
  isLoading,
  isError,
  disabled,
}: Readonly<MemberMultiSelectProps>) {
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedIds);

  // Keep the order the user picked members in (it is the round-robin order).
  const toggle = (memberId: string) =>
    onChange(
      selected.has(memberId)
        ? selectedIds.filter((existing) => existing !== memberId)
        : [...selectedIds, memberId]
    );

  const names = options.filter((o) => selected.has(o.id)).map((o) => o.name);
  const count = selectedIds.length;
  const summary = count === 0 ? 'No members' : names.join(', ') || `${count} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          aria-label={`Members, ${count} selected`}
          disabled={disabled}
        >
          <span className="truncate">{summary}</span>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            expand_more
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading users…</p>}
        {isError && (
          <p className="p-3 text-sm text-destructive">Could not load users. Try again later.</p>
        )}
        {!isLoading && !isError && options.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No users to add.</p>
        )}
        {options.length > 0 && (
          <fieldset className="max-h-64 overflow-y-auto py-1">
            <legend className="sr-only">Territory members</legend>
            {options.map((option) => {
              const optionId = `member-option-${option.id}`;
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    id={optionId}
                    checked={selected.has(option.id)}
                    onCheckedChange={() => toggle(option.id)}
                  />
                  <label htmlFor={optionId} className="min-w-0 cursor-pointer">
                    <span className="block truncate">{option.name}</span>
                    {option.title && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {option.title}
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
          </fieldset>
        )}
      </PopoverContent>
    </Popover>
  );
}
