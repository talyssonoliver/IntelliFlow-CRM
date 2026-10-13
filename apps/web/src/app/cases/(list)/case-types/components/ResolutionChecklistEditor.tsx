'use client';

/**
 * Resolution checklist editor (PG-204). Ordered steps that become the case's
 * tasks when a case of this type is created. Keyboard-first: move buttons stay
 * focusable at the ends (`aria-disabled`, not `disabled`) so focus never drops,
 * and every change is announced in one always-mounted polite live region.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@intelliflow/ui';
import { CASE_TYPE_LIMITS } from '@intelliflow/domain';

export interface ChecklistDraftItem {
  key: string;
  title: string;
}

let keySeed = 0;
export function newChecklistItem(title = ''): ChecklistDraftItem {
  keySeed += 1;
  return { key: `step-${keySeed}`, title };
}

export interface ResolutionChecklistEditorProps {
  items: ChecklistDraftItem[];
  onChange: (items: ChecklistDraftItem[]) => void;
  /** Index → message for duplicate or invalid steps. */
  errors?: Record<number, string>;
  disabled?: boolean;
}

type FocusTarget = { kind: 'input' | 'up' | 'down'; index: number } | { kind: 'add' } | null;

export function ResolutionChecklistEditor({
  items,
  onChange,
  errors = {},
  disabled = false,
}: Readonly<ResolutionChecklistEditorProps>) {
  const [announcement, setAnnouncement] = useState('');
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const atLimit = items.length >= CASE_TYPE_LIMITS.maxChecklistItems;

  // Move focus after the list re-renders (the target element may be new).
  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.kind === 'add') {
      addRef.current?.focus();
    } else {
      const selector = `[data-step-control="${focusTarget.kind}-${focusTarget.index}"]`;
      listRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget, items]);

  const update = (index: number, title: string) =>
    onChange(items.map((item, i) => (i === index ? { ...item, title } : item)));

  const add = () => {
    if (disabled) return;
    if (atLimit) {
      setAnnouncement(`Maximum of ${CASE_TYPE_LIMITS.maxChecklistItems} steps reached.`);
      return;
    }
    const next = [...items, newChecklistItem()];
    onChange(next);
    setAnnouncement(`Step added, position ${next.length}.`);
    setFocusTarget({ kind: 'input', index: next.length - 1 });
  };

  const remove = (index: number) => {
    if (disabled) return;
    const next = items.filter((_, i) => i !== index);
    onChange(next);
    const remaining = next.length === 1 ? '1 step remains' : `${next.length} steps remain`;
    setAnnouncement(`Step ${index + 1} removed, ${remaining}.`);
    setFocusTarget(
      next.length === 0
        ? { kind: 'add' }
        : { kind: 'input', index: Math.min(index, next.length - 1) }
    );
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (disabled || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`Step moved to position ${target + 1} of ${next.length}.`);
    // Keep focus on the same control; at an end it becomes inert, so use the opposite one.
    const atEnd = target === 0 || target === next.length - 1;
    const sameKind = delta === -1 ? 'up' : 'down';
    const opposite = delta === -1 ? 'down' : 'up';
    setFocusTarget({ kind: atEnd ? opposite : sameKind, index: target });
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Resolution checklist</legend>
      <p id="checklist-help" className="text-xs text-muted-foreground">
        Each step becomes a task on new cases of this type. Maximum{' '}
        {CASE_TYPE_LIMITS.maxChecklistItems} steps.
      </p>
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {items.length > 0 && (
        <ul ref={listRef} aria-label="Resolution checklist" className="space-y-2">
          {items.map((item, index) => {
            const label = `Checklist step ${index + 1}`;
            const errorId = `checklist-step-${item.key}-error`;
            const first = index === 0;
            const last = index === items.length - 1;
            return (
              <li key={item.key} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-6 text-right text-xs tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}.
                  </span>
                  <Input
                    aria-label={label}
                    data-step-control={`input-${index}`}
                    value={item.title}
                    maxLength={CASE_TYPE_LIMITS.maxChecklistTitleLength}
                    onChange={(e) => update(index, e.target.value)}
                    aria-invalid={errors[index] ? true : undefined}
                    aria-describedby={errors[index] ? errorId : 'checklist-help'}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Move step ${index + 1} up`}
                    aria-disabled={first || undefined}
                    data-step-control={`up-${index}`}
                    onClick={() => move(index, -1)}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      arrow_upward
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Move step ${index + 1} down`}
                    aria-disabled={last || undefined}
                    data-step-control={`down-${index}`}
                    onClick={() => move(index, 1)}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      arrow_downward
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      close
                    </span>
                  </Button>
                </div>
                {errors[index] && (
                  <p id={errorId} className="ml-8 text-xs text-destructive">
                    {errors[index]}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-end">
        <Button
          ref={addRef}
          type="button"
          size="sm"
          aria-disabled={atLimit || undefined}
          aria-describedby="checklist-help"
          onClick={add}
        >
          Add Step
        </Button>
      </div>
    </fieldset>
  );
}
