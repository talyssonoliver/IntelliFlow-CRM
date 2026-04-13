'use client';

import { useCallback } from 'react';
import { Card, Switch } from '@intelliflow/ui';
import type { ContactAutomationSettingsInput } from '@intelliflow/validators';

export type ContactAutomationSettings = ContactAutomationSettingsInput;

interface AutomationTabProps {
  settings: ContactAutomationSettings;
  onSettingsChange: (settings: ContactAutomationSettings) => void;
}

const AUTOMATION_ITEMS = [
  {
    key: 'autoMergeOnExactEmail' as const,
    title: 'Auto-merge on exact email match',
    description:
      'When a duplicate is detected by the "email + exact" rule, automatically merge the new record into the existing contact.',
  },
  {
    key: 'notifyOnDuplicate' as const,
    title: 'Notify on duplicate',
    description:
      'Send a notification to the contact owner when a potential duplicate is detected so they can review.',
  },
  {
    key: 'restrictTagCreationToAdmins' as const,
    title: 'Restrict tag creation to admins',
    description:
      'Only workspace admins can create new tags. Regular users can only apply existing tags.',
  },
];

export function AutomationTab({ settings, onSettingsChange }: Readonly<AutomationTabProps>) {
  const handleToggle = useCallback(
    (key: keyof ContactAutomationSettings, value: boolean) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Automation</h3>
        <p className="text-sm text-muted-foreground">
          Configure automated behaviors for contact management.
        </p>
      </div>

      <div className="space-y-6">
        {AUTOMATION_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <label
                htmlFor={`contact-automation-${item.key}`}
                className="text-sm font-medium cursor-pointer"
              >
                {item.title}
              </label>
              <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
            </div>
            <Switch
              id={`contact-automation-${item.key}`}
              checked={settings[item.key]}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
