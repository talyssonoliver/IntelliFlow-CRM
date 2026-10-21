'use client';

/**
 * A mailbox password field that never holds the stored value (PG-207,
 * SEC-02). The API only says whether a password is saved; the field lets the
 * user keep it, replace it or (where allowed) remove it, and `secretInput`
 * turns that into the API's tri-state: absent = keep, null = clear,
 * string = replace.
 */
import { useEffect, useRef } from 'react';
import { Button, Input, Label } from '@intelliflow/ui';

export type SecretChange =
  | { mode: 'keep' }
  | { mode: 'replace'; value: string }
  | { mode: 'remove' };

export function secretInput(change: SecretChange): string | null | undefined {
  if (change.mode === 'remove') return null;
  if (change.mode === 'replace' && change.value.length > 0) return change.value;
  return undefined;
}

export interface SecretFieldProps {
  id: string;
  label: string;
  /** Whether the API reports a saved password. */
  hasStored: boolean;
  value: SecretChange;
  onChange: (value: SecretChange) => void;
  error?: string;
  /** Offer "Remove password" (only where clearing it is meaningful). */
  allowRemove?: boolean;
  /** Marks the password input as required. */
  required?: boolean;
}

export function SecretField({
  id,
  label,
  hasStored,
  value,
  onChange,
  error,
  allowRemove = false,
  required = false,
}: Readonly<SecretFieldProps>) {
  const errorId = `${id}-error`;
  const undoId = `${id}-undo`;
  // Each mode swaps the clicked button for another control: move focus to it.
  const lastMode = useRef(value.mode);
  useEffect(() => {
    if (lastMode.current === value.mode) return;
    lastMode.current = value.mode;
    document.getElementById(value.mode === 'remove' ? undoId : id)?.focus();
  }, [value.mode, id, undoId]);
  const statusId = `${id}-status`;
  const errorText = error ? (
    <p id={errorId} className="text-xs text-red-700 dark:text-red-300">
      {error}
    </p>
  ) : null;

  if (hasStored && value.mode === 'remove') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p id={statusId} className="text-sm text-muted-foreground">
          The saved password will be removed when you save.
        </p>
        <Button
          id={undoId}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ mode: 'keep' })}
        >
          Undo
        </Button>
      </div>
    );
  }

  if (hasStored && value.mode === 'keep') {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p id={statusId} className="text-sm text-muted-foreground">
          A password is saved. It is never shown.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            id={id}
            aria-describedby={[statusId, error ? errorId : null].filter(Boolean).join(' ')}
            onClick={() => onChange({ mode: 'replace', value: '' })}
          >
            Replace password
          </Button>
          {allowRemove && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange({ mode: 'remove' })}
            >
              Remove password
            </Button>
          )}
        </div>
        {errorText}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={value.mode === 'replace' ? value.value : ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-required={required || undefined}
        onChange={(e) => onChange({ mode: 'replace', value: e.currentTarget.value })}
      />
      {errorText}
      {hasStored && (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ mode: 'keep' })}>
          Keep saved password
        </Button>
      )}
    </div>
  );
}
