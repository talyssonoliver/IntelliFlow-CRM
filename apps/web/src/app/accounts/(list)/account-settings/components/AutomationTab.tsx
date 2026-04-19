'use client';

import { Switch } from '@intelliflow/ui';
import type { AccountAutomationSettingsInput } from '@intelliflow/validators';

export type AccountAutomationSettings = AccountAutomationSettingsInput;

export interface AutomationTabProps {
  readonly settings: AccountAutomationSettings;
  readonly onSettingsChange: (next: AccountAutomationSettings) => void;
}

interface ToggleConfig {
  key: keyof AccountAutomationSettings;
  title: string;
  description: string;
}

// Non-AI toggles only; AI settings live in AISettingsTab.
const AUTOMATION_KEYS: ToggleConfig[] = [
  {
    key: 'autoAssignOwner',
    title: 'Auto-assign owner',
    description: 'Assign a new account to the current user if no owner is selected.',
  },
  {
    key: 'autoLinkContactsByDomain',
    title: 'Auto-link contacts by domain',
    description: 'Match contacts whose email domain matches the account website.',
  },
  {
    key: 'preventDeleteWithOpenOpportunities',
    title: 'Prevent delete with open opportunities',
    description: 'Block account deletion while any opportunity is still open.',
  },
  {
    key: 'notifyOnOwnerChange',
    title: 'Notify on owner change',
    description: 'Send a notification when the account owner changes.',
  },
  {
    key: 'normalizeWebsiteDomain',
    title: 'Normalize website domain',
    description: 'Strip protocol/www/trailing slash before saving website.',
  },
  {
    key: 'autoCapitalizeAccountNames',
    title: 'Auto-capitalize account names',
    description: 'Title-case account names on create and edit.',
  },
  {
    key: 'notifyOnDuplicate',
    title: 'Notify on duplicate',
    description: 'Notify the owner when a likely duplicate is detected.',
  },
  {
    key: 'restrictTagCreationToAdmins',
    title: 'Restrict tag creation to admins',
    description: 'Only admins can create new tags from the accounts module.',
  },
];

export function AutomationTab({ settings, onSettingsChange }: Readonly<AutomationTabProps>) {
  const toggle = (key: keyof AccountAutomationSettings, value: boolean) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-1">
      {AUTOMATION_KEYS.map(({ key, title, description }) => (
        <div
          key={key}
          className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
          <Switch
            checked={Boolean(settings[key])}
            onCheckedChange={(v) => toggle(key, v)}
            aria-label={title}
          />
        </div>
      ))}
    </div>
  );
}
