'use client';

// Cadence picker shared by Scheduled Reports (PG-201) and Task Automation (PG-208):
// the cadence Select, then day of week / day of month, then time of day or a
// custom cron. Renders a fragment so the caller's grid places each field. DOM ids
// are `${idPrefix}-cadence`, `-day-of-week`, `-day-of-month`, `-time`, `-cron`
// (errors at `<id>-error`); `idPrefix="schedule"` keeps PG-201's ids unchanged.

import type { ReactNode } from 'react';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { scheduleCadenceSchema, type ScheduleCadence } from '@intelliflow/validators';
import { FieldError } from './field-error';

export interface ScheduleCadenceValue {
  cadence: ScheduleCadence;
  dayOfWeek: string;
  dayOfMonth: string;
  timeOfDay: string;
  cronExpression: string;
}

export type ScheduleCadenceErrors = Partial<
  Record<'cadence' | 'dayOfWeek' | 'dayOfMonth' | 'timeOfDay' | 'cronExpression', string>
>;

export interface ScheduleCadenceFieldsProps {
  readonly value: ScheduleCadenceValue;
  readonly onChange: <K extends keyof ScheduleCadenceValue>(
    key: K,
    value: ScheduleCadenceValue[K]
  ) => void;
  readonly errors?: ScheduleCadenceErrors;
  readonly idPrefix?: string;
  readonly cronHint?: string;
  readonly disabled?: boolean;
}

export const SCHEDULE_CADENCE_LABELS: Record<ScheduleCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  custom: 'Custom (cron)',
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => String(i + 1));
const DEFAULT_CRON_HINT =
  'Five fields: minute, hour, day of month, month, day of week. At most once an hour.';

function Field({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="space-y-1.5">{children}</div>;
}

export function ScheduleCadenceFields({
  value,
  onChange,
  errors = {},
  idPrefix = 'schedule',
  cronHint = DEFAULT_CRON_HINT,
  disabled,
}: ScheduleCadenceFieldsProps) {
  const ids = {
    cadence: `${idPrefix}-cadence`,
    dayOfWeek: `${idPrefix}-day-of-week`,
    dayOfMonth: `${idPrefix}-day-of-month`,
    timeOfDay: `${idPrefix}-time`,
    cronExpression: `${idPrefix}-cron`,
  };
  const errorProps = (key: keyof ScheduleCadenceErrors) => ({
    'aria-invalid': errors[key] ? (true as const) : undefined,
    'aria-describedby': errors[key] ? `${ids[key]}-error` : undefined,
  });
  const isWeekly = value.cadence === 'weekly';
  const needsDayOfMonth = value.cadence === 'monthly' || value.cadence === 'quarterly';
  const isCustom = value.cadence === 'custom';
  const cronHintId = `${ids.cronExpression}-hint`;

  return (
    <>
      <Field>
        <Label htmlFor={ids.cadence}>Cadence</Label>
        <Select
          value={value.cadence}
          disabled={disabled}
          onValueChange={(v) => {
            const parsed = scheduleCadenceSchema.safeParse(v);
            if (parsed.success) onChange('cadence', parsed.data);
          }}
        >
          <SelectTrigger id={ids.cadence} {...errorProps('cadence')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scheduleCadenceSchema.options.map((c) => (
              <SelectItem key={c} value={c}>
                {SCHEDULE_CADENCE_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={`${ids.cadence}-error`} message={errors.cadence} />
      </Field>

      {isWeekly && (
        <Field>
          <Label htmlFor={ids.dayOfWeek}>Day of the week</Label>
          <Select
            value={value.dayOfWeek}
            disabled={disabled}
            onValueChange={(v) => onChange('dayOfWeek', v)}
          >
            <SelectTrigger id={ids.dayOfWeek} {...errorProps('dayOfWeek')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_WEEK.map((day, i) => (
                <SelectItem key={day} value={String(i)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${ids.dayOfWeek}-error`} message={errors.dayOfWeek} />
        </Field>
      )}

      {needsDayOfMonth && (
        <Field>
          <Label htmlFor={ids.dayOfMonth}>Day of the month</Label>
          <Select
            value={value.dayOfMonth}
            disabled={disabled}
            onValueChange={(v) => onChange('dayOfMonth', v)}
          >
            <SelectTrigger id={ids.dayOfMonth} {...errorProps('dayOfMonth')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OF_MONTH.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${ids.dayOfMonth}-error`} message={errors.dayOfMonth} />
        </Field>
      )}

      {isCustom ? (
        <div className="md:col-span-2">
          <Field>
            <Label htmlFor={ids.cronExpression}>Cron expression</Label>
            <Input
              id={ids.cronExpression}
              value={value.cronExpression}
              maxLength={100}
              disabled={disabled}
              onChange={(e) => onChange('cronExpression', e.target.value)}
              placeholder="0 9 * * 1-5"
              aria-invalid={errors.cronExpression ? true : undefined}
              aria-describedby={
                errors.cronExpression ? `${cronHintId} ${ids.cronExpression}-error` : cronHintId
              }
            />
            <p id={cronHintId} className="text-xs text-muted-foreground">
              {cronHint}
            </p>
            <FieldError id={`${ids.cronExpression}-error`} message={errors.cronExpression} />
          </Field>
        </div>
      ) : (
        <Field>
          <Label htmlFor={ids.timeOfDay}>Time of day</Label>
          <Input
            id={ids.timeOfDay}
            type="time"
            value={value.timeOfDay}
            disabled={disabled}
            onChange={(e) => onChange('timeOfDay', e.target.value)}
            {...errorProps('timeOfDay')}
          />
          <FieldError id={`${ids.timeOfDay}-error`} message={errors.timeOfDay} />
        </Field>
      )}
    </>
  );
}
