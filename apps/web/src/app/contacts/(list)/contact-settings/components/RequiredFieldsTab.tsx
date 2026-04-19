'use client';

import { useCallback } from 'react';
import { Switch } from '@intelliflow/ui';
import type { ContactRequiredFieldKey } from '@intelliflow/validators';

export interface RequiredFieldRow {
  fieldKey: ContactRequiredFieldKey;
  isRequired: boolean;
}

interface RequiredFieldsTabProps {
  fields: RequiredFieldRow[];
  onFieldsChange: (fields: RequiredFieldRow[]) => void;
}

const FIELD_LABELS: Record<ContactRequiredFieldKey, { label: string; description: string }> = {
  email: {
    label: 'Email address',
    description: 'Required — contacts without email cannot be saved.',
  },
  phone: {
    label: 'Phone number',
    description: 'When on, contact create/update rejects empty phone.',
  },
  company: {
    label: 'Company',
    description: 'When on, contact create/update rejects empty company.',
  },
  jobTitle: {
    label: 'Job title',
    description: 'When on, contact create/update rejects empty job title.',
  },
  ownerId: {
    label: 'Owner',
    description: 'When on, contact create/update rejects unassigned contacts.',
  },
};

export function RequiredFieldsTab({ fields, onFieldsChange }: Readonly<RequiredFieldsTabProps>) {
  const handleToggle = useCallback(
    (fieldKey: ContactRequiredFieldKey, value: boolean) => {
      if (fieldKey === 'email') return; // email is always required
      onFieldsChange(
        fields.map((f) => (f.fieldKey === fieldKey ? { ...f, isRequired: value } : f))
      );
    },
    [fields, onFieldsChange]
  );

  return (
    <div className="space-y-5">
      {fields.map((row) => {
        const meta = FIELD_LABELS[row.fieldKey];
        const disabled = row.fieldKey === 'email';
        return (
          <div key={row.fieldKey} className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <label htmlFor={`req-${row.fieldKey}`} className="text-sm font-medium cursor-pointer">
                {meta.label}
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
            </div>
            <Switch
              id={`req-${row.fieldKey}`}
              checked={row.isRequired}
              disabled={disabled}
              aria-label={`Require ${meta.label}`}
              onCheckedChange={(checked) => handleToggle(row.fieldKey, checked)}
            />
          </div>
        );
      })}
    </div>
  );
}
