'use client';

// Read-only value with a Copy button (PG-208 webhook URL and signing secret).
// The clipboard write is awaited in a try/catch: when it is refused (no
// permission, insecure context) the value is selected and a hint says to copy
// it by hand. The result is announced through the field's own live region;
// timers are cleared on unmount.

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, Label } from '@intelliflow/ui';

export interface CopyFieldProps {
  readonly label: string;
  readonly value: string;
  /** Shown under the field, e.g. "Shown once. Store it in your secret manager." */
  readonly help?: string;
  readonly id?: string;
  /** Monospace rendering for URLs and secrets. */
  readonly mono?: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_AFTER_MS = 2000;

export function CopyField({ label, value, help, id, mono = true }: CopyFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `copy-field-${generatedId}`;
  const helpId = `${inputId}-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const settle = (next: CopyState) => {
    setState(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (next === 'copied') timerRef.current = setTimeout(() => setState('idle'), RESET_AFTER_MS);
  };

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      settle('copied');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      settle('failed');
    }
  };

  // The name follows the visible text ("Copied" for 2 s), WCAG 2.5.3.
  const buttonText = state === 'copied' ? 'Copied' : 'Copy';
  let status = '';
  if (state === 'copied') status = `${label} copied.`;
  if (state === 'failed')
    status = `Could not copy automatically. ${label} is selected: press Ctrl+C or ⌘C.`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={inputId}
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          aria-describedby={help ? helpId : undefined}
          className={mono ? 'font-mono text-xs' : undefined}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copy}
          aria-label={`${buttonText} ${label}`}
        >
          {buttonText}
        </Button>
      </div>
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
      <output aria-live="polite" className="block text-xs text-muted-foreground">
        {status}
      </output>
    </div>
  );
}
