'use client';

/**
 * Multi-select of assignable users (PG-197 territories; shared with PG-208
 * task-automation round-robin pools). `AssignSheet` is
 * single-select, so this composes Popover + a labelled group of checkboxes —
 * native multi-selection semantics (the Sonar a11y guard prefers native
 * controls over an ARIA listbox). The trigger's accessible name is
 * "<label>: <visible summary>", so it contains both the visible field label
 * and the button's own text (WCAG 2.5.3).
 */
import { useState } from 'react';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';

/** A selected user who is no longer in the tenant's user list. */
const LEFT_LABEL = 'Former member (left)';

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
  /** Accessible name of the option group (visually hidden). */
  legend?: string;
  /** The field's visible label text; the trigger is named "<label>: <summary>". */
  label?: string;
  /** Marks the trigger invalid and points it at the error message. */
  invalid?: boolean;
  describedBy?: string;
}

export function MemberMultiSelect({
  id,
  options,
  selectedIds,
  onChange,
  isLoading,
  isError,
  disabled,
  legend = 'Members',
  label = 'Members',
  invalid,
  describedBy,
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

  // A selected user the loaded list no longer has has left the tenant. They
  // stay removable, or a saved rule holding them could never be saved again.
  // Unknown while the list is loading or failed, so nobody is marked then.
  const nameById = new Map(options.map((o) => [o.id, o.name]));
  const listKnown = !isLoading && !isError;
  const departedIds = listKnown ? selectedIds.filter((s) => !nameById.has(s)) : [];
  const departed = new Set(departedIds);
  // Names in picked order, the order the summary promises (round-robin order).
  const names = selectedIds.flatMap((selectedId) => {
    const name = nameById.get(selectedId);
    if (name) return [name];
    return departed.has(selectedId) ? [LEFT_LABEL] : [];
  });
  const count = selectedIds.length;
  const summary = count === 0 ? 'No members' : names.join(', ') || `${count} selected`;

  const picker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          aria-label={`${label}: ${summary}`}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
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
            <legend className="sr-only">{legend}</legend>
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
  if (departedIds.length === 0) return picker;

  return (
    <div className="space-y-2">
      {picker}
      <ul className="flex flex-wrap gap-2" aria-label="Members who have left">
        {departedIds.map((departedId, index) => (
          <li
            key={departedId}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            <span>{LEFT_LABEL}</span>
            <button
              type="button"
              className="inline-flex rounded-full hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove former member ${index + 1}`}
              onClick={() => onChange(selectedIds.filter((existing) => existing !== departedId))}
              disabled={disabled}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                close
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
