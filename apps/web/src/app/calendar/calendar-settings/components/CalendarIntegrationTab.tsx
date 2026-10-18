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
import { AvailabilityPointer } from './AvailabilityPointer';

export interface CalendarIntegrationSettings {
  primaryCalendarId: string | null;
  syncExternalCalendars: boolean;
}

export interface AvailableCalendar {
  id: string;
  name: string;
}

interface CalendarIntegrationTabProps {
  settings: CalendarIntegrationSettings;
  onSettingsChange: (settings: CalendarIntegrationSettings) => void;
  availableCalendars: AvailableCalendar[];
  /** The firm timezone, edited on the Availability page; `null` while loading. */
  firmTimezone: string | null;
}

export function CalendarIntegrationTab({
  settings,
  onSettingsChange,
  availableCalendars,
  firmTimezone,
}: Readonly<CalendarIntegrationTabProps>) {
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

        <AvailabilityPointer>
          {firmTimezone && `Firm timezone: ${firmTimezone}`}
        </AvailabilityPointer>
      </div>
    </Card>
  );
}
