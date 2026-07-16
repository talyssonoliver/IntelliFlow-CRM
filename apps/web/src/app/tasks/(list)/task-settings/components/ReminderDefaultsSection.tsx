'use client';

import { Card, Input, Label, Switch } from '@intelliflow/ui';
import type { ReminderDefaults } from '@intelliflow/validators';
import { SectionHeader } from './SectionHeader';

const MIN_MINUTES = 1;
const MAX_MINUTES = 40320; // 28 days

export interface ReminderDefaultsSectionProps {
  value: ReminderDefaults;
  onChange: (value: ReminderDefaults) => void;
}

/** Default reminder behaviour applied to new tasks. */
export function ReminderDefaultsSection({
  value,
  onChange,
}: Readonly<ReminderDefaultsSectionProps>) {
  const { enabled, minutesBefore } = value;
  const leadTimeInvalid =
    enabled &&
    (minutesBefore < MIN_MINUTES ||
      minutesBefore > MAX_MINUTES ||
      !Number.isInteger(minutesBefore));
  const errorId = 'reminder-lead-time-error';

  return (
    <Card className="lg:col-span-6 p-4 sm:p-5">
      <SectionHeader
        icon="notifications"
        iconBg="bg-amber-50 dark:bg-amber-950"
        iconFg="text-amber-600 dark:text-amber-400"
        title="Reminder Defaults"
        description="Whether new tasks get a reminder, and how far ahead it fires."
      />

      <div className="flex items-center justify-between border-b pb-4 mb-4">
        <div>
          <Label htmlFor="reminder-enabled" className="text-sm font-medium">
            Enable reminders by default
          </Label>
          <p className="text-xs text-muted-foreground">
            When off, new tasks have no reminder unless set individually.
          </p>
        </div>
        <Switch
          id="reminder-enabled"
          checked={enabled}
          onCheckedChange={(v) => onChange({ ...value, enabled: v })}
          aria-label="Enable reminders by default"
        />
      </div>

      <fieldset disabled={!enabled} className={!enabled ? 'opacity-60' : ''}>
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="reminder-lead-time" className="text-sm font-medium">
            Lead time (minutes before due)
          </Label>
          <Input
            id="reminder-lead-time"
            type="number"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={1}
            value={Number.isNaN(minutesBefore) ? '' : minutesBefore}
            aria-invalid={leadTimeInvalid}
            aria-describedby={leadTimeInvalid ? errorId : undefined}
            onChange={(e) => onChange({ ...value, minutesBefore: e.currentTarget.valueAsNumber })}
          />
          {leadTimeInvalid && (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              Enter a whole number of minutes between {MIN_MINUTES} and {MAX_MINUTES}.
            </p>
          )}
        </div>
      </fieldset>
    </Card>
  );
}
