'use client';

import { Switch } from '@intelliflow/ui';
import type { AccountRequiredFieldKey } from '@intelliflow/validators';

export interface RequiredFieldRow {
  fieldKey: AccountRequiredFieldKey;
  isRequired: boolean;
}

const FIELD_LABELS: Record<AccountRequiredFieldKey, { label: string; description: string }> = {
  name: { label: 'Name', description: 'Account display name (locked — always required).' },
  industry: { label: 'Industry', description: 'Industry category from the taxonomy.' },
  website: { label: 'Website', description: 'Primary company website / domain.' },
  ownerId: { label: 'Owner', description: 'The user who owns the account.' },
  employees: { label: 'Employees', description: 'Employee headcount bracket.' },
  revenue: { label: 'Annual revenue', description: 'Annual revenue in account currency.' },
};

export interface RequiredFieldsTabProps {
  readonly fields: RequiredFieldRow[];
  readonly onFieldsChange: (fields: RequiredFieldRow[]) => void;
}

export function RequiredFieldsTab({ fields, onFieldsChange }: Readonly<RequiredFieldsTabProps>) {
  const toggle = (key: AccountRequiredFieldKey, value: boolean) => {
    // Name must always remain required.
    if (key === 'name') return;
    const next = fields.map((f) => (f.fieldKey === key ? { ...f, isRequired: value } : f));
    onFieldsChange(next);
  };

  return (
    <div className="space-y-1">
      {fields.map((f) => {
        const meta = FIELD_LABELS[f.fieldKey];
        const locked = f.fieldKey === 'name';
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
