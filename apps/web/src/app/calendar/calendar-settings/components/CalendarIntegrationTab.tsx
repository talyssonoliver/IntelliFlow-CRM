'use client';

import {
  Card,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';
import { getAvailableTimezones } from '@/lib/shared/timezone-utils';

export interface CalendarIntegrationSettings {
  primaryCalendarId: string | null;
  syncExternalCalendars: boolean;
  defaultTimezone: string;
}

export interface AvailableCalendar {
  id: string;
  name: string;
}

interface CalendarIntegrationTabProps {
  settings: CalendarIntegrationSettings;
  onSettingsChange: (settings: CalendarIntegrationSettings) => void;
  availableCalendars: AvailableCalendar[];
}

export function CalendarIntegrationTab({
  settings,
  onSettingsChange,
  availableCalendars,
}: Readonly<CalendarIntegrationTabProps>) {
  const timezones = getAvailableTimezones();

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Calendar Integration</h3>
        <p className="text-sm text-muted-foreground">
          Connect and configure external calendar services.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryCalendarId">Primary Calendar</Label>
          {availableCalendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">No calendars connected yet.</p>
          ) : (
            <Select
              value={settings.primaryCalendarId ?? ''}
              onValueChange={(value: string) =>
                onSettingsChange({ ...settings, primaryCalendarId: value || null })
              }
            >
              <SelectTrigger id="primaryCalendarId">
                <SelectValue placeholder="Select a calendar" />
              </SelectTrigger>
              <SelectContent>
                {availableCalendars.map((cal) => (
                  <SelectItem key={cal.id} value={cal.id}>
                    {cal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label htmlFor="syncExternalCalendars" className="text-sm font-medium cursor-pointer">
              Sync External Calendars
            </label>
            <p className="text-sm text-muted-foreground mt-0.5">
              Import events from connected external calendars.
            </p>
          </div>
          <Switch
            id="syncExternalCalendars"
            checked={settings.syncExternalCalendars}
            onCheckedChange={(checked: boolean) =>
              onSettingsChange({ ...settings, syncExternalCalendars: checked })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultTimezone">Default Timezone</Label>
          <Select
            value={settings.defaultTimezone}
            onValueChange={(value: string) =>
              onSettingsChange({ ...settings, defaultTimezone: value })
            }
          >
            <SelectTrigger id="defaultTimezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}
