'use client';

import { Card, Label } from '@intelliflow/ui';
import { SectionHeader } from '@/components/shared/section-header';
import { TimezoneSelector } from '@/components/settings/TimezoneSelector';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

const TITLE_ID = 'availability-timezone-title';
const FIELD_ID = 'availability-timezone';

interface TimezoneCardProps {
  timezone: string;
  onChange: (timezone: string) => void;
  isConfigured: boolean;
  readOnly: boolean;
  announce: (message: string) => void;
  error?: string;
}

/** The firm timezone (AppointmentSettings.defaultTimezone, owner Q2). Weekly hours are read in it. */
export function TimezoneCard({
  timezone,
  onChange,
  isConfigured,
  readOnly,
  announce,
  error,
}: Readonly<TimezoneCardProps>) {
  const { timezone: viewerTimezone, timezoneLabel } = useTimezoneContext();
  const viewerDiffers = Boolean(timezone) && viewerTimezone !== timezone;
  const describedBy = [error ? `${FIELD_ID}-error` : null, `${FIELD_ID}-help`]
    .filter(Boolean)
    .join(' ');

  return (
    <section aria-labelledby={TITLE_ID} className="lg:col-span-4">
      <Card className="h-full p-4 sm:p-5">
        <SectionHeader
          icon="public"
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconFg="text-violet-600 dark:text-violet-400"
          title="Timezone"
          titleId={TITLE_ID}
          headingLevel={2}
          description="Weekly hours and closures are read in this zone."
        />

        {readOnly ? (
          <p className="text-sm font-medium text-foreground">{timezone}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={FIELD_ID}>Firm timezone</Label>
            <TimezoneSelector
              id={FIELD_ID}
              value={timezone}
              onChange={(value) => {
                onChange(value);
                announce(`Timezone set to ${value}.`);
              }}
              invalid={Boolean(error)}
              describedBy={describedBy}
              showDetect={false}
            />
            {error && (
              <p id={`${FIELD_ID}-error`} className="text-xs text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <p id={`${FIELD_ID}-help`} className="text-xs text-muted-foreground">
              Changing the zone keeps the times and applies them in the new zone.
            </p>
            {!isConfigured && (
              <p className="text-xs font-medium text-foreground">
                Confirm your firm timezone before saving.
              </p>
            )}
          </div>
        )}

        {viewerDiffers && (
          <p className="mt-3 text-xs text-muted-foreground">
            Your timezone is {timezoneLabel}; hours here are in {timezone}.
          </p>
        )}
      </Card>
    </section>
  );
}
