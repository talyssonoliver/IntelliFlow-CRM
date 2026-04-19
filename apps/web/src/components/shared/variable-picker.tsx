'use client';

/**
 * VariablePicker
 *
 * Free-text input + adjacent "{ } Insert variable" Popover. The popover
 * lists the variables available at run time (derived from a workflow's
 * trigger entity) and inserts the chosen `{{path}}` token at the
 * input's cursor position. Useful in any workflow free-text field —
 * notification body, task title, instructions, etc.
 *
 * Inputs are controlled (`value` / `onChange`) so the parent owns the
 * canonical state. The popover is keyboard-accessible and uses the
 * shadcn `Popover` primitive from `@intelliflow/ui`.
 */

import { useRef, useState } from 'react';

import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';

export interface VariableSuggestion {
  /** Full token path, e.g. `trigger.lead.name`. Inserted as `{{trigger.lead.name}}`. */
  path: string;
  /** Short label shown to the user (defaults to the path). */
  label?: string;
  /** Optional helper text shown below the label. */
  description?: string;
}

export interface VariablePickerProps {
  value: string;
  onChange: (next: string) => void;
  /** Variables the workflow makes available at run time. */
  variables: VariableSuggestion[];
  placeholder?: string;
  /** Render as <textarea> instead of <input> for multi-line bodies. */
  multiline?: boolean;
  ariaLabel?: string;
  /** Tailwind class for the input/textarea */
  className?: string;
}

export function VariablePicker({
  value,
  onChange,
  variables,
  placeholder,
  multiline = false,
  ariaLabel,
  className,
}: VariablePickerProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);

  const insertToken = (path: string) => {
    const token = `{{${path}}}`;
    const el = inputRef.current;
    if (!el) {
      onChange(value + token);
      setOpen(false);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    setOpen(false);
    // Restore caret position AFTER React re-renders the controlled value.
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const caret = start + token.length;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className={multiline ? 'flex flex-col gap-1' : 'flex gap-2 items-start'}>
      {multiline ? (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={
            className ??
            'w-full rounded-md border border-input px-3 py-2 text-sm min-h-[80px] resize-y'
          }
        />
      ) : (
        <Input
          ref={(el) => {
            inputRef.current = el;
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={className}
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Insert variable"
            className={multiline ? 'self-end' : ''}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              data_object
            </span>
            <span className="ml-1.5 hidden sm:inline">Insert variable</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-72 p-0">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-medium">Available variables</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Substituted at run time with the trigger entity's fields.
            </p>
          </div>
          {variables.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No variables available — pick a trigger entity on the Start node first.
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {variables.map((v) => (
                <li key={v.path}>
                  <button
                    type="button"
                    onClick={() => insertToken(v.path)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex flex-col gap-0.5 focus-visible:outline-none focus-visible:bg-muted/40"
                  >
                    <code className="text-xs font-mono text-foreground">{`{{${v.path}}}`}</code>
                    {v.description ? (
                      <span className="text-[11px] text-muted-foreground">{v.description}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper — derive default variables from a trigger entity kind
// ---------------------------------------------------------------------------

/** Common field paths exposed for each trigger entity kind. */
const DEFAULT_FIELDS_BY_KIND: Record<string, VariableSuggestion[]> = {
  lead: [
    { path: 'trigger.lead.firstName', description: 'Lead given name' },
    { path: 'trigger.lead.lastName', description: 'Lead family name' },
    { path: 'trigger.lead.email', description: 'Lead email' },
    { path: 'trigger.lead.score', description: 'Lead score (0-100)' },
    { path: 'trigger.lead.status', description: 'Lifecycle status' },
  ],
  contact: [
    { path: 'trigger.contact.firstName' },
    { path: 'trigger.contact.lastName' },
    { path: 'trigger.contact.email' },
    { path: 'trigger.contact.phone' },
  ],
  account: [
    { path: 'trigger.account.name' },
    { path: 'trigger.account.industry' },
    { path: 'trigger.account.tier' },
  ],
  deal: [
    { path: 'trigger.deal.name' },
    { path: 'trigger.deal.value', description: 'Monetary value' },
    { path: 'trigger.deal.stage' },
    { path: 'trigger.deal.closeDate' },
  ],
  opportunity: [
    { path: 'trigger.opportunity.name' },
    { path: 'trigger.opportunity.value' },
    { path: 'trigger.opportunity.stage' },
  ],
  case: [
    { path: 'trigger.case.subject' },
    { path: 'trigger.case.priority' },
    { path: 'trigger.case.status' },
  ],
  task: [
    { path: 'trigger.task.title' },
    { path: 'trigger.task.dueDate' },
    { path: 'trigger.task.priority' },
  ],
  user: [{ path: 'trigger.user.name' }, { path: 'trigger.user.email' }],
  team: [{ path: 'trigger.team.name' }],
};

/** Returns the standard variable suggestions for a given entity kind. */
export function variablesForEntityKind(kind: string | undefined): VariableSuggestion[] {
  if (!kind) return [];
  return DEFAULT_FIELDS_BY_KIND[kind] ?? [];
}
