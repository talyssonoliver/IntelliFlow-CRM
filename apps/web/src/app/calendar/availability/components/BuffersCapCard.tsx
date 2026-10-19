'use client';

import { Card, Input, Label, Switch } from '@intelliflow/ui';
import { AVAILABILITY_LIMITS } from '@intelliflow/validators';
import { SectionHeader } from '@/components/shared/section-header';

const TITLE_ID = 'availability-buffers-title';

export interface BuffersCapValue {
  bufferBefore: string;
  bufferAfter: string;
  capEnabled: boolean;
  cap: string;
}

interface BuffersCapCardProps {
  value: BuffersCapValue;
  onChange: (patch: Partial<BuffersCapValue>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}

function describedBy(fieldId: string, helpId: string, errors: Record<string, string>): string {
  return errors[fieldId] ? `${fieldId}-error ${helpId}` : helpId;
}

function FieldError({
  fieldId,
  errors,
}: Readonly<{ fieldId: string; errors: Record<string, string> }>) {
  if (!errors[fieldId]) return null;
  return (
    <p id={`${fieldId}-error`} className="text-xs text-red-700 dark:text-red-300">
      {errors[fieldId]}
    </p>
  );
}

/** Default buffers (AppointmentSettings, owner Q2/Q7) and the optional daily booking cap. */
export function BuffersCapCard({
  value,
  onChange,
  errors,
  readOnly,
}: Readonly<BuffersCapCardProps>) {
  const max = AVAILABILITY_LIMITS.maxDailyBookings;
  return (
    <section aria-labelledby={TITLE_ID} className="lg:col-span-4">
      <Card className="h-full p-4 sm:p-5">
        <SectionHeader
          icon="timer"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconFg="text-amber-700 dark:text-amber-300"
          title="Buffers & daily limit"
          titleId={TITLE_ID}
          headingLevel={2}
          description="New appointments start with these buffers. The limit counts bookings per firm day."
        />

        {readOnly ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Buffer before</dt>
              <dd className="font-medium text-foreground">{value.bufferBefore} minutes</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Buffer after</dt>
              <dd className="font-medium text-foreground">{value.bufferAfter} minutes</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Daily limit</dt>
              <dd className="font-medium text-foreground">
                {value.capEnabled ? `${value.cap} bookings per day` : 'No limit'}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="space-y-4">
            <p id="buffer-help" className="text-xs text-muted-foreground">
              0 to 240 minutes of free time kept around each appointment.
            </p>
            {(
              [
                ['buffer-before', 'Buffer before (minutes)', 'bufferBefore'],
                ['buffer-after', 'Buffer after (minutes)', 'bufferAfter'],
              ] as const
            ).map(([fieldId, label, key]) => (
              <div key={fieldId} className="flex flex-col gap-1.5">
                <Label htmlFor={fieldId}>{label}</Label>
                <Input
                  id={fieldId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={240}
                  value={value[key]}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onChange({ [key]: e.target.value })
                  }
                  aria-invalid={errors[fieldId] ? true : undefined}
                  aria-describedby={describedBy(fieldId, 'buffer-help', errors)}
                />
                <FieldError fieldId={fieldId} errors={errors} />
              </div>
            ))}

            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="cap-enabled"
                checked={value.capEnabled}
                onCheckedChange={(checked: boolean) => onChange({ capEnabled: checked })}
                aria-describedby="cap-help"
              />
              <Label htmlFor="cap-enabled">Limit bookings per day</Label>
            </div>
            {value.capEnabled && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cap-max">Maximum bookings per day</Label>
                <Input
                  id="cap-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  value={value.cap}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onChange({ cap: e.target.value })
                  }
                  aria-invalid={errors['cap-max'] ? true : undefined}
                  aria-describedby={describedBy('cap-max', 'cap-help', errors)}
                />
                <FieldError fieldId="cap-max" errors={errors} />
              </div>
            )}
            <p id="cap-help" className="text-xs text-muted-foreground">
              Counts scheduled, confirmed, in-progress and completed appointments, 1 to {max} per
              day. Off means no limit.
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}
