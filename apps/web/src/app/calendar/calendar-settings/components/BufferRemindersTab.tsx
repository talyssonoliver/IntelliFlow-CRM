'use client';

import { Card, Input, Label } from '@intelliflow/ui';
import { AvailabilityPointer } from './AvailabilityPointer';

export interface ReminderSettings {
  defaultReminderMinutes: number | null;
}

/** The firm's default buffers, shown read-only here; they are edited on the Availability page (PG-202). */
export interface FirmBuffers {
  before: number;
  after: number;
}

interface BufferRemindersTabProps {
  settings: ReminderSettings;
  onSettingsChange: (settings: ReminderSettings) => void;
  /** `null` while the settings are loading. */
  firmBuffers: FirmBuffers | null;
}

export function BufferRemindersTab({
  settings,
  onSettingsChange,
  firmBuffers,
}: Readonly<BufferRemindersTabProps>) {
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Reminders</h3>
        <p className="text-sm text-muted-foreground">
          Default reminder timing for new appointments.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultReminderMinutes">Default Reminder (minutes)</Label>
          <Input
            id="defaultReminderMinutes"
            type="number"
            value={settings.defaultReminderMinutes ?? ''}
            min={0}
            max={60}
            aria-describedby="defaultReminderMinutes-help"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onSettingsChange({
                defaultReminderMinutes: e.target.value === '' ? null : parseInt(e.target.value, 10),
              })
            }
          />
          <p id="defaultReminderMinutes-help" className="text-xs text-muted-foreground">
            0 to 60 minutes before the start. Leave empty for no reminder.
          </p>
        </div>

        <AvailabilityPointer>
          {firmBuffers &&
            `Buffers: ${firmBuffers.before} min before and ${firmBuffers.after} min after each appointment.`}
        </AvailabilityPointer>
      </div>
    </Card>
  );
}
