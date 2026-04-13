'use client';

import { useCallback } from 'react';
import { Card, Switch } from '@intelliflow/ui';
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
    description: 'Always required. Contacts without email cannot be saved.',
  },
  phone: {
    label: 'Phone number',
    description: 'Require at least one phone number for new contacts.',
  },
  company: {
    label: 'Company',
    description: 'Require a company association so contacts are never orphaned.',
  },
  jobTitle: {
    label: 'Job title',
    description: 'Require job title so downstream segmentation has a non-null value.',
  },
  ownerId: {
    label: 'Owner',
    description: 'Require an assigned owner so every contact has a point of contact.',
  },
};

export function RequiredFieldsTab({
  fields,
  onFieldsChange,
}: Readonly<RequiredFieldsTabProps>) {
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
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Required fields</h3>
        <p className="text-sm text-muted-foreground">
          Mark fields that must be filled in before a contact can be created or updated.
        </p>
      </div>

      <div className="space-y-6">
        {fields.map((row) => {
          const meta = FIELD_LABELS[row.fieldKey];
          const disabled = row.fieldKey === 'email';
          return (
            <div key={row.fieldKey} className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <label
                  htmlFor={`req-${row.fieldKey}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {meta.label}
                </label>
                <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
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
    </Card>
  );
}
