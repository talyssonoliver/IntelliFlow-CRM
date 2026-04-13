'use client';

/**
 * PrioritySelect — reusable priority picker.
 *
 * Backed by the canonical `WORKFLOW_PRIORITIES` const from
 * `@intelliflow/domain` → `node-catalog.ts`, which aligns with
 * TaskPriority / CasePriority (LOW / MEDIUM / HIGH / URGENT).
 *
 * Intentionally small and stateless — takes a controlled `value` +
 * `onChange`. Use it anywhere a workflow config form (or other feature)
 * needs to set a priority.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@intelliflow/ui';
import { WORKFLOW_PRIORITIES, type WorkflowPriority } from '@intelliflow/domain';

export interface PrioritySelectProps {
  value?: WorkflowPriority;
  onChange: (next: WorkflowPriority | undefined) => void;
  /** If true, shows a leading "No priority" clear option */
  clearable?: boolean;
  /** Passed to the trigger for a11y */
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Tailwind class override for the trigger */
  className?: string;
}

const CLEAR_VALUE = '__none__';

const PRIORITY_LABEL: Record<WorkflowPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const PRIORITY_DOT_CLASS: Record<WorkflowPriority, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-sky-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-rose-500',
};

export function PrioritySelect({
  value,
  onChange,
  clearable = true,
  ariaLabel = 'Priority',
  placeholder = 'Select priority',
  disabled,
  className,
}: PrioritySelectProps) {
  return (
    <Select
      value={value ?? ''}
      onValueChange={(v) => {
        if (v === CLEAR_VALUE || v === '') {
          onChange(undefined);
          return;
        }
        onChange(v as WorkflowPriority);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {clearable ? (
          <SelectItem value={CLEAR_VALUE}>
            <span className="text-muted-foreground">No priority</span>
          </SelectItem>
        ) : null}
        {WORKFLOW_PRIORITIES.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="inline-flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_DOT_CLASS[p]}`} />
              {PRIORITY_LABEL[p]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
