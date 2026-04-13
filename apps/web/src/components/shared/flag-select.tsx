'use client';

/**
 * FlagSelect — reusable workflow flag picker.
 *
 * Surfaces the canonical `WORKFLOW_FLAGS` set from `@intelliflow/domain`
 * as a labelled dropdown. Returns the raw enum value via `onChange`; an
 * extra "No flag" option clears the field. Free-form strings are NOT
 * supported here — bespoke flag labels should be added to the domain
 * catalog so all consumers (engine, reports, UI) agree on the vocabulary.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@intelliflow/ui';
import { WORKFLOW_FLAGS, type WorkflowFlag } from '@intelliflow/domain';

export interface FlagSelectProps {
  value?: string;
  onChange: (next: WorkflowFlag | undefined) => void;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const CLEAR_VALUE = '__none__';

const FLAG_LABEL: Record<WorkflowFlag, string> = {
  needs_review: 'Needs review',
  urgent_follow_up: 'Urgent follow-up',
  high_value: 'High value',
  at_risk: 'At risk',
  blocked: 'Blocked',
  archived: 'Archived',
};

const FLAG_DOT_CLASS: Record<WorkflowFlag, string> = {
  needs_review: 'bg-amber-500',
  urgent_follow_up: 'bg-rose-500',
  high_value: 'bg-emerald-500',
  at_risk: 'bg-orange-500',
  blocked: 'bg-slate-500',
  archived: 'bg-slate-300',
};

function isCanonicalFlag(v: string | undefined): v is WorkflowFlag {
  return v != null && (WORKFLOW_FLAGS as readonly string[]).includes(v);
}

export function FlagSelect({
  value,
  onChange,
  ariaLabel = 'Flag',
  placeholder = 'Select a flag',
  disabled,
  className,
}: FlagSelectProps) {
  const safeValue = isCanonicalFlag(value) ? value : '';
  return (
    <Select
      value={safeValue}
      onValueChange={(v) => {
        if (v === CLEAR_VALUE || v === '') {
          onChange(undefined);
          return;
        }
        if (isCanonicalFlag(v)) onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLEAR_VALUE}>
          <span className="text-muted-foreground">No flag</span>
        </SelectItem>
        {WORKFLOW_FLAGS.map((flag) => (
          <SelectItem key={flag} value={flag}>
            <span className="inline-flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${FLAG_DOT_CLASS[flag]}`} />
              {FLAG_LABEL[flag]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
