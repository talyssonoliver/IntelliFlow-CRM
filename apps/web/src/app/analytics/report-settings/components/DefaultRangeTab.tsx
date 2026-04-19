'use client';

// Default Range Tab — PG-187
// Radio group for selecting the default analytics date range.

import { RadioGroup, RadioGroupItem, Card, Label } from '@intelliflow/ui';

export type DefaultRangeValue = '7d' | '14d' | '30d' | '90d';

interface RangeOption {
  value: DefaultRangeValue;
  label: string;
  description: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { value: '7d', label: '7 days', description: 'Last week' },
  { value: '14d', label: '14 days', description: 'Last two weeks' },
  { value: '30d', label: '30 days', description: 'Last month (default)' },
  { value: '90d', label: '90 days', description: 'Last quarter' },
];

export interface DefaultRangeTabProps {
  value: DefaultRangeValue;
  onChange: (value: DefaultRangeValue) => void;
}

export function DefaultRangeTab({ value, onChange }: Readonly<DefaultRangeTabProps>) {
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Default Report Date Range</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the default time range applied to new report views.
        </p>
      </div>

      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as DefaultRangeValue)}
        aria-label="Default report date range"
        className="gap-3"
      >
        {RANGE_OPTIONS.map((option) => {
          const id = `range-${option.value}`;
          return (
            <div
              key={option.value}
              className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent/50 transition-colors"
            >
              <RadioGroupItem id={id} value={option.value} className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor={id} className="cursor-pointer font-medium">
                  {option.label}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </Card>
  );
}
