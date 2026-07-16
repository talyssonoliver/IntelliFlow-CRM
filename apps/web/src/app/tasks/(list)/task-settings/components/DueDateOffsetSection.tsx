'use client';

import { Card, Input, Label } from '@intelliflow/ui';
import { SectionHeader } from './SectionHeader';

const MIN_OFFSET = 0;
const MAX_OFFSET = 365;

export interface DueDateOffsetSectionProps {
  value: number;
  onChange: (value: number) => void;
}

/** Number of days after creation a new task is due by default. */
export function DueDateOffsetSection({ value, onChange }: Readonly<DueDateOffsetSectionProps>) {
  const outOfRange = value < MIN_OFFSET || value > MAX_OFFSET || !Number.isInteger(value);
  const errorId = 'due-date-offset-error';

  return (
    <Card className="lg:col-span-6 p-4 sm:p-5">
      <SectionHeader
        icon="event"
        iconBg="bg-indigo-50 dark:bg-indigo-950"
        iconFg="text-indigo-600 dark:text-indigo-400"
        title="Default Due-Date Offset"
        description="How many days after creation a new task is due by default."
      />

      <div className="space-y-2 max-w-xs">
        <Label htmlFor="due-date-offset" className="text-sm font-medium">
          Due-date offset (days)
        </Label>
        <Input
          id="due-date-offset"
          type="number"
          min={MIN_OFFSET}
          max={MAX_OFFSET}
          step={1}
          value={Number.isNaN(value) ? '' : value}
          aria-invalid={outOfRange}
          aria-describedby={outOfRange ? errorId : undefined}
          onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
        />
        {outOfRange && (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            Enter a whole number of days between {MIN_OFFSET} and {MAX_OFFSET}.
          </p>
        )}
      </div>
    </Card>
  );
}
