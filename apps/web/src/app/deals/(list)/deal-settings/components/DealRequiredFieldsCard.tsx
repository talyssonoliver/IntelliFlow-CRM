'use client';

import { Switch } from '@intelliflow/ui';
import type { DealRequiredFieldKey } from '@intelliflow/validators';

export interface DealRequiredFieldRow {
  fieldKey: DealRequiredFieldKey;
  isRequired: boolean;
}

const FIELD_LABELS: Record<DealRequiredFieldKey, { label: string; description: string }> = {
  accountId: {
    label: 'Account',
    description: 'Parent account (always required — cannot be disabled).',
  },
  ownerId: { label: 'Owner', description: 'Deal owner (always required — cannot be disabled).' },
  value: { label: 'Value', description: 'Monetary value of the deal.' },
  expectedCloseDate: { label: 'Expected close date', description: 'Target date for deal closure.' },
  stage: { label: 'Stage', description: 'Current pipeline stage.' },
  description: { label: 'Description', description: 'Free-text notes about the deal.' },
};

export interface DealRequiredFieldsCardProps {
  readonly fields: DealRequiredFieldRow[];
  readonly onFieldsChange: (fields: DealRequiredFieldRow[]) => void;
}

export function DealRequiredFieldsCard({
  fields,
  onFieldsChange,
}: Readonly<DealRequiredFieldsCardProps>) {
  const toggle = (key: DealRequiredFieldKey, value: boolean) => {
    if (key === 'accountId' || key === 'ownerId') return;
    const next = fields.map((f) => (f.fieldKey === key ? { ...f, isRequired: value } : f));
    onFieldsChange(next);
  };

  return (
    <div className="space-y-1">
      {fields.map((f) => {
        const meta = FIELD_LABELS[f.fieldKey];
        const locked = f.fieldKey === 'accountId' || f.fieldKey === 'ownerId';
        return (
          <div
            key={f.fieldKey}
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{meta.label}</div>
              <div className="text-xs text-muted-foreground">{meta.description}</div>
            </div>
            <Switch
              checked={f.isRequired}
              onCheckedChange={(v) => toggle(f.fieldKey, v)}
              disabled={locked}
              aria-label={`Toggle ${meta.label} required`}
            />
          </div>
        );
      })}
    </div>
  );
}
