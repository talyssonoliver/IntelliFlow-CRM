'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Button, EmptyState, Input } from '@intelliflow/ui';
import { AVAILABILITY_LIMITS } from '@intelliflow/validators';
import {
  closureFieldId,
  formatClosureDate,
  newKey,
  type DraftClosure,
} from '../availability-draft';

export interface ClosuresListHandle {
  /** Add an empty closure row and focus its start date (header "Add Closure" button). */
  openCreate: () => void;
}

interface ClosuresListProps {
  closures: DraftClosure[];
  onChange: (closures: DraftClosure[]) => void;
  errors: Record<string, string>;
  readOnly: boolean;
  announce: (message: string) => void;
}

const { minClosureDate, maxClosureDate, maxClosures, maxReasonLength } = AVAILABILITY_LIMITS;

function removeLabel(closure: DraftClosure, n: number): string {
  return closure.startDate && closure.endDate
    ? `Remove closure ${n}, ${closure.startDate} to ${closure.endDate}`
    : `Remove closure ${n}`;
}

function readOnlyText(closure: DraftClosure): string {
  const range =
    closure.startDate === closure.endDate
      ? formatClosureDate(closure.startDate)
      : `${formatClosureDate(closure.startDate)} to ${formatClosureDate(closure.endDate)}`;
  return closure.reason.trim() ? `${range}, ${closure.reason.trim()}` : range;
}

/**
 * All-day closure date ranges (owner Q4). Rows keep their draft order while
 * editing; the server returns them sorted after a save.
 */
export const ClosuresList = forwardRef<ClosuresListHandle, ClosuresListProps>(function ClosuresList(
  { closures, onChange, errors, readOnly, announce },
  ref
) {
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  useImperativeHandle(
    ref,
    () => ({
      openCreate: () => {
        if (closures.length >= maxClosures) {
          announce(`Maximum of ${maxClosures} closures reached.`);
          return;
        }
        const row: DraftClosure = { key: newKey('c'), startDate: '', endDate: '', reason: '' };
        onChange([...closures, row]);
        announce(`Closure ${closures.length + 1} added.`);
        setFocusTarget(closureFieldId(row.key, 'start'));
      },
    }),
    [closures, onChange, announce]
  );

  const update = (key: string, patch: Partial<DraftClosure>) => {
    onChange(closures.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const remove = (index: number) => {
    const next = closures.filter((_, i) => i !== index);
    onChange(next);
    announce(
      `Closure ${index + 1} removed, ${next.length} closure${next.length === 1 ? '' : 's'} remain${next.length === 1 ? 's' : ''}.`
    );
    const focus = next[Math.min(index, next.length - 1)];
    setFocusTarget(focus ? closureFieldId(focus.key, 'start') : 'add-closure-button');
  };

  if (closures.length === 0) {
    return (
      <EmptyState
        entity="appointments"
        phase="passive"
        size="sm"
        className="py-4 px-3 gap-2"
        title="No closures"
        description="Add the dates the firm is closed, such as public holidays."
        aria-label="No closures"
      />
    );
  }

  if (readOnly) {
    return (
      <ul aria-label="Closures" className="space-y-2 text-sm">
        {closures.map((closure) => (
          <li key={closure.key} className="text-foreground">
            {readOnlyText(closure)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul aria-label="Closures" className="space-y-3">
      {closures.map((closure, index) => {
        const n = index + 1;
        const ids = {
          start: closureFieldId(closure.key, 'start'),
          end: closureFieldId(closure.key, 'end'),
          reason: closureFieldId(closure.key, 'reason'),
        };
        const fieldProps = (id: string) => ({
          id,
          'aria-invalid': errors[id] ? true : undefined,
          'aria-describedby': errors[id] ? `${id}-error` : undefined,
        });
        return (
          <li key={closure.key} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                {...fieldProps(ids.start)}
                type="date"
                min={minClosureDate}
                max={maxClosureDate}
                value={closure.startDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  update(closure.key, { startDate: e.target.value })
                }
                aria-label={`Closure ${n} start date`}
                className="min-w-[9rem] flex-1 sm:w-40 sm:flex-none"
              />
              <span aria-hidden="true" className="text-sm text-muted-foreground">
                to
              </span>
              <Input
                {...fieldProps(ids.end)}
                type="date"
                min={closure.startDate || minClosureDate}
                max={maxClosureDate}
                value={closure.endDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  update(closure.key, { endDate: e.target.value })
                }
                aria-label={`Closure ${n} end date`}
                className="min-w-[9rem] flex-1 sm:w-40 sm:flex-none"
              />
              <Input
                {...fieldProps(ids.reason)}
                type="text"
                maxLength={maxReasonLength}
                value={closure.reason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  update(closure.key, { reason: e.target.value })
                }
                aria-label={`Closure ${n} reason (optional)`}
                placeholder="Reason (optional)"
                className="min-w-[12rem] flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 w-11 p-0"
                aria-label={removeLabel(closure, n)}
                onClick={() => remove(index)}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  close
                </span>
              </Button>
            </div>
            {[ids.start, ids.end, ids.reason].map((id) =>
              errors[id] ? (
                <p key={id} id={`${id}-error`} className="text-xs text-red-700 dark:text-red-300">
                  {errors[id]}
                </p>
              ) : null
            )}
          </li>
        );
      })}
    </ul>
  );
});
