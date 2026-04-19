'use client';

import { Switch } from '@intelliflow/ui';
import type { TicketRequiredFieldInput } from '@intelliflow/validators';

interface Props {
  fields: TicketRequiredFieldInput[];
  onChange: (fields: TicketRequiredFieldInput[]) => void;
}

const FIELD_LABELS: Record<string, string> = {
  subject: 'Subject',
  description: 'Description',
  contactEmail: 'Contact email',
  contactName: 'Contact name',
  priority: 'Priority',
  category: 'Category',
  slaPolicy: 'SLA policy',
};

const HARD_REQUIRED = new Set(['subject', 'contactEmail']);

export function TicketRequiredFieldsCard({ fields, onChange }: Props) {
  const toggle = (key: string) => {
    if (HARD_REQUIRED.has(key)) return;
    const next = fields.map((f) => (f.fieldKey === key ? { ...f, isRequired: !f.isRequired } : f));
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
          <span
            className="material-symbols-outlined text-[20px] text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          >
            rule_folder
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Required Fields</h3>
          <p className="text-sm text-muted-foreground">
            Fields enforced at ticket create time. Subject and contact email are always required.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {fields.map((field) => {
          const hardRequired = HARD_REQUIRED.has(field.fieldKey);
          return (
            <li
              key={field.fieldKey}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <span className="font-medium">
                  {FIELD_LABELS[field.fieldKey] ?? field.fieldKey}
                </span>
                {hardRequired && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (always required — cannot be disabled)
                  </span>
                )}
              </div>
              <Switch
                checked={hardRequired ? true : field.isRequired}
                disabled={hardRequired}
                onCheckedChange={() => toggle(field.fieldKey)}
                aria-label={`Require ${FIELD_LABELS[field.fieldKey] ?? field.fieldKey}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
