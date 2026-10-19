'use client';

/**
 * Ordered fallback chain for one AI purpose (PG-199). Same keyboard-first
 * pattern as the case-type checklist editor (PG-204): move buttons stay
 * focusable at the ends (`aria-disabled`), focus follows the moved entry and
 * every change is announced in one always-mounted polite live region.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import type { LLMPurpose } from '@intelliflow/domain';
import { formatModelPrice, type CatalogModel } from './model-config-model';

export interface FallbackListProps {
  purpose: LLMPurpose;
  title: string;
  ids: string[];
  /** Models that may be fallbacks here (routed for the purpose, not the primary). */
  options: CatalogModel[];
  max: number;
  /** Entry index → message. */
  errors?: Record<number, string>;
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}

type FocusTarget = { kind: 'up' | 'down'; index: number } | { kind: 'add' } | null;

function plural(count: number): string {
  return count === 1 ? '1 fallback remains' : `${count} fallbacks remain`;
}

export function FallbackList({
  purpose,
  title,
  ids,
  options,
  max,
  errors = {},
  disabled = false,
  onChange,
}: Readonly<FallbackListProps>) {
  const [announcement, setAnnouncement] = useState('');
  const [choice, setChoice] = useState('');
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const atLimit = ids.length >= max;
  const label = title.toLowerCase();
  const available = options.filter((model) => !ids.includes(model.id));
  const priceById = new Map(options.map((model) => [model.id, model.price]));

  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.kind === 'add') {
      addRef.current?.focus();
    } else {
      const selector = `[data-fallback-control="${focusTarget.kind}-${focusTarget.index}"]`;
      listRef.current?.querySelector<HTMLElement>(selector)?.focus();
    }
    setFocusTarget(null);
  }, [focusTarget, ids]);

  const add = () => {
    if (disabled) return;
    if (atLimit) {
      setAnnouncement(`Maximum of ${max} fallbacks reached.`);
      return;
    }
    if (!choice || ids.includes(choice)) return;
    const next = [...ids, choice];
    onChange(next);
    setChoice('');
    setAnnouncement(`${choice} added as fallback ${next.length} of ${next.length}.`);
  };

  const remove = (index: number) => {
    if (disabled) return;
    const next = ids.filter((_, i) => i !== index);
    onChange(next);
    setAnnouncement(`${ids[index]} removed, ${plural(next.length)}.`);
    setFocusTarget({ kind: 'add' });
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (disabled || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setAnnouncement(`${ids[index]} moved to position ${target + 1} of ${next.length}.`);
    // At an end the same control becomes inert, so focus the opposite one.
    const atEnd = target === 0 || target === next.length - 1;
    const sameKind = delta === -1 ? 'up' : 'down';
    const opposite = delta === -1 ? 'down' : 'up';
    setFocusTarget({ kind: atEnd ? opposite : sameKind, index: target });
  };

  const addId = `${purpose}-fallback-add`;
  const helpId = `${purpose}-fallback-help`;

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Fallback models</legend>
      <p id={helpId} className="text-xs text-muted-foreground">
        Tried in order when the model is rate-limited, failing or timing out. Maximum {max}.
      </p>
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {ids.length === 0 ? (
        <div className="space-y-1">
          <EmptyState
            entity="rules"
            phase="passive"
            size="sm"
            aria-label={`No ${label} fallbacks`}
            className="py-4 px-3 gap-2"
          />
          <p className="text-xs text-muted-foreground">
            No fallbacks: if the model is unavailable, the feature&apos;s built-in fallback runs.
          </p>
        </div>
      ) : (
        <ol ref={listRef} aria-label={`${title} fallback models`} className="space-y-2">
          {ids.map((id, index) => {
            const errorId = `${purpose}-fallback-${index}-error`;
            const price = priceById.get(id);
            const first = index === 0;
            const last = index === ids.length - 1;
            return (
              <li key={id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-6 text-right text-xs tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}.
                  </span>
                  <span
                    className="flex-1 truncate text-sm text-foreground"
                    aria-describedby={errors[index] ? errorId : undefined}
                  >
                    {id}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {price === undefined ? '(retired)' : formatModelPrice(price)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-11 w-11 p-0"
                    aria-label={`Move fallback ${index + 1} up`}
                    aria-disabled={first || undefined}
                    data-fallback-control={`up-${index}`}
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
                    aria-label={`Move fallback ${index + 1} down`}
                    aria-disabled={last || undefined}
                    data-fallback-control={`down-${index}`}
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
                    aria-label={`Remove fallback ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      close
                    </span>
                  </Button>
                </div>
                {errors[index] && (
                  <p id={errorId} className="ml-8 text-xs text-red-700 dark:text-red-300">
                    {errors[index]}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={choice} onValueChange={setChoice} disabled={disabled || atLimit}>
          <SelectTrigger
            id={addId}
            aria-label={`Add a ${label} fallback model`}
            aria-describedby={helpId}
            className="h-11 sm:flex-1"
          >
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            {available.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {`${model.id} — ${formatModelPrice(model.price)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          ref={addRef}
          type="button"
          size="sm"
          variant="outline"
          className="h-11"
          aria-disabled={atLimit || undefined}
          onClick={add}
        >
          Add fallback
        </Button>
      </div>
    </fieldset>
  );
}
