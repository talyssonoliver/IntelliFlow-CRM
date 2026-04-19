'use client';

import { useCallback } from 'react';
import { Switch } from '@intelliflow/ui';
import type { ContactAutomationSettingsInput } from '@intelliflow/validators';

export type ContactAutomationSettings = ContactAutomationSettingsInput;

interface AutomationTabProps {
  settings: ContactAutomationSettings;
  onSettingsChange: (settings: ContactAutomationSettings) => void;
}

const AUTOMATION_ITEMS: Array<{
  key: keyof ContactAutomationSettings;
  title: string;
  description: string;
}> = [
  {
    key: 'normalizePhoneNumbers',
    title: 'Normalize phone numbers',
    description:
      'Reformat phone numbers to E.164 on save so duplicate detection, dialing, and messaging all see the same shape.',
  },
  {
    key: 'autoCapitalizeNames',
    title: 'Auto-capitalize names',
    description:
      'Apply Title Case to first and last names on save. Reduces "john smith" / "JOHN SMITH" noise in lists.',
  },
  {
    key: 'preventDeleteWithOpenDeals',
    title: 'Prevent delete with open deals',
    description:
      'Block deletion of contacts linked to an active opportunity so pipeline data is never orphaned.',
  },
  {
    key: 'restrictTagCreationToAdmins',
    title: 'Restrict tag creation to admins',
    description:
      'Only workspace admins can create new tags. Regular users can only apply existing tags.',
  },
  {
    key: 'autoMergeOnExactEmail',
    title: 'Auto-merge on exact email match',
    description:
      'When a duplicate is detected by the "email + exact" rule, automatically merge the new record into the existing contact.',
  },
  {
    key: 'notifyOnDuplicate',
    title: 'Notify on duplicate',
    description:
      'Send a notification to the contact owner when a potential duplicate is detected so they can review.',
  },
  {
    key: 'notifyOnOwnerChange',
    title: 'Notify on owner change',
    description:
      'Email the new and previous owner whenever a contact is reassigned so handovers are not missed.',
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
    <div className="space-y-5">
      {AUTOMATION_ITEMS.map((item) => (
        <div key={item.key} className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label
              htmlFor={`contact-automation-${item.key}`}
              className="text-sm font-medium cursor-pointer"
            >
              {item.title}
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
          </div>
          <Switch
            id={`contact-automation-${item.key}`}
            checked={settings[item.key]}
            onCheckedChange={(checked) => handleToggle(item.key, checked)}
          />
        </div>
      ))}
    </div>
  );
}
