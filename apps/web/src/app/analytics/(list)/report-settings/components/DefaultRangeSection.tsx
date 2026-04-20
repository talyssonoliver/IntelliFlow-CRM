'use client';

import { Card, RadioGroup, RadioGroupItem, Label } from '@intelliflow/ui';
import { defaultRangeSchema, type DefaultRange } from '@intelliflow/validators';

const RANGE_META: Record<DefaultRange, { label: string; description: string }> = {
  '7d': { label: '7 days', description: 'Last week' },
  '14d': { label: '14 days', description: 'Last two weeks' },
  '30d': { label: '30 days', description: 'Last month (default)' },
  '90d': { label: '90 days', description: 'Last quarter' },
};

export interface DefaultRangeSectionProps {
  value: DefaultRange;
  onChange: (value: DefaultRange) => void;
}

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function DefaultRangeSection({ value, onChange }: Readonly<DefaultRangeSectionProps>) {
  const options = [...defaultRangeSchema.options];

  return (
    <Card className="lg:col-span-6 p-4 sm:p-5">
      <SectionHeader
        icon="date_range"
        iconBg="bg-indigo-50 dark:bg-indigo-950"
        iconFg="text-indigo-600 dark:text-indigo-400"
        title="Default Report Date Range"
        description="Choose the default time range applied to new report views."
      />

      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as DefaultRange)}
        aria-label="Default report date range"
        className="gap-3"
      >
        {options.map((opt) => {
          const meta = RANGE_META[opt];
          const id = `range-${opt}`;
          return (
            <div
              key={opt}
              className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent/50 transition-colors"
            >
              <RadioGroupItem id={id} value={opt} className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor={id} className="cursor-pointer font-medium">
                  {meta.label}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </Card>
  );
}
