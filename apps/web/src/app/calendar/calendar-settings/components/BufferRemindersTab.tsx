'use client';

import { Card, Input, Label } from '@intelliflow/ui';

export interface BufferSettings {
  defaultBufferBeforeMinutes: number;
  defaultBufferAfterMinutes: number;
  defaultReminderMinutes: number | null;
}

interface BufferRemindersTabProps {
  settings: BufferSettings;
  onSettingsChange: (settings: BufferSettings) => void;
}

export function BufferRemindersTab({
  settings,
  onSettingsChange,
}: Readonly<BufferRemindersTabProps>) {
  const handleBufferChange = (key: keyof BufferSettings, value: string) => {
    onSettingsChange({ ...settings, [key]: value === '' ? null : parseInt(value, 10) });
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Buffer & Reminders</h3>
        <p className="text-sm text-muted-foreground">
          Configure buffer time before/after appointments and default reminder timing.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultBufferBeforeMinutes">Buffer Before (minutes)</Label>
          <Input
            id="defaultBufferBeforeMinutes"
            type="number"
            value={settings.defaultBufferBeforeMinutes}
            min={0}
            max={240}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleBufferChange('defaultBufferBeforeMinutes', e.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultBufferAfterMinutes">Buffer After (minutes)</Label>
          <Input
            id="defaultBufferAfterMinutes"
            type="number"
            value={settings.defaultBufferAfterMinutes}
            min={0}
            max={240}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleBufferChange('defaultBufferAfterMinutes', e.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultReminderMinutes">Default Reminder (minutes)</Label>
          <Input
            id="defaultReminderMinutes"
            type="number"
            value={settings.defaultReminderMinutes ?? ''}
            min={0}
            max={60}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleBufferChange('defaultReminderMinutes', e.target.value)
            }
          />
        </div>
      </div>
    </Card>
  );
}
