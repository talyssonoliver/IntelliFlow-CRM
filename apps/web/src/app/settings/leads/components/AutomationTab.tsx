'use client';

import { useCallback } from 'react';
import { Card, Switch } from '@intelliflow/ui';

export interface AutomationSettings {
  autoAssignment: boolean;
  instantNotifications: boolean;
  leadRecurrence: boolean;
}

interface AutomationTabProps {
  settings: AutomationSettings;
  onSettingsChange: (settings: AutomationSettings) => void;
}

const AUTOMATION_ITEMS = [
  {
    key: 'autoAssignment' as const,
    title: 'Auto-assignment',
    description: 'Automatically distribute new leads to available team members based on workload and expertise.',
  },
  {
    key: 'instantNotifications' as const,
    title: 'Instant Notifications',
    description: 'Notify the lead owner immediately when a lead is updated or takes an action.',
  },
  {
    key: 'leadRecurrence' as const,
    title: 'Lead Recurrence Detection',
    description: 'Detect and flag potential duplicate lead entries based on email and phone matching.',
  },
];

export function AutomationTab({
  settings,
  onSettingsChange,
}: Readonly<AutomationTabProps>) {
  const handleToggle = useCallback(
    (key: keyof AutomationSettings, value: boolean) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Automation</h3>
        <p className="text-sm text-muted-foreground">
          Configure automated behaviors for lead management.
        </p>
      </div>

      <div className="space-y-6">
        {AUTOMATION_ITEMS.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex-1">
              <label
                htmlFor={`automation-${item.key}`}
                className="text-sm font-medium cursor-pointer"
              >
                {item.title}
              </label>
              <p className="text-sm text-muted-foreground mt-0.5">
                {item.description}
              </p>
            </div>
            <Switch
              id={`automation-${item.key}`}
              checked={settings[item.key]}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
