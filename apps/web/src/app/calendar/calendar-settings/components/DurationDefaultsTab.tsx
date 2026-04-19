'use client';

import { Card, Input, Label } from '@intelliflow/ui';

export interface DurationSettings {
  defaultDurationMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
}

interface DurationDefaultsTabProps {
  settings: DurationSettings;
  onSettingsChange: (settings: DurationSettings) => void;
}

export function DurationDefaultsTab({
  settings,
  onSettingsChange,
}: Readonly<DurationDefaultsTabProps>) {
  const handleChange = (key: keyof DurationSettings, value: string) => {
    onSettingsChange({ ...settings, [key]: parseInt(value, 10) || 0 });
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Duration Defaults</h3>
        <p className="text-sm text-muted-foreground">
          Set the default, minimum, and maximum durations for appointments.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultDurationMinutes">Default Duration (minutes)</Label>
          <Input
            id="defaultDurationMinutes"
            type="number"
            value={settings.defaultDurationMinutes}
            min={5}
            max={480}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange('defaultDurationMinutes', e.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minDurationMinutes">Minimum Duration (minutes)</Label>
          <Input
            id="minDurationMinutes"
            type="number"
            value={settings.minDurationMinutes}
            min={5}
            max={480}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange('minDurationMinutes', e.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="maxDurationMinutes">Maximum Duration (minutes)</Label>
          <Input
            id="maxDurationMinutes"
            type="number"
            value={settings.maxDurationMinutes}
            min={5}
            max={480}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange('maxDurationMinutes', e.target.value)
            }
          />
        </div>
      </div>
    </Card>
  );
}
