'use client';

import { useState } from 'react';
import {
  Card,
  Button,
  Input,
  Switch,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import {
  scheduledDeliveryFrequencySchema,
  scheduledDeliveryFormatSchema,
  type ScheduledDelivery,
  type ScheduledDeliveryFrequency,
  type ScheduledDeliveryFormat,
} from '@intelliflow/validators';

const FREQUENCIES = [...scheduledDeliveryFrequencySchema.options];
const FORMATS = [...scheduledDeliveryFormatSchema.options];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ScheduledDeliverySectionProps {
  value: ScheduledDelivery;
  onChange: (value: ScheduledDelivery) => void;
}

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function ScheduledDeliverySection({
  value,
  onChange,
}: Readonly<ScheduledDeliverySectionProps>) {
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);

  const enabled = value.enabled;
  const isInvalid = enabled && (value.recipients?.length ?? 0) === 0;

  const update = (partial: Partial<ScheduledDelivery>) => {
    onChange({ ...value, ...partial });
  };

  const addRecipient = () => {
    const email = recipientInput.trim();
    if (!email) return;
    if (!EMAIL_REGEX.test(email)) {
      setRecipientError('Please enter a valid email address.');
      return;
    }
    if (value.recipients.includes(email)) {
      setRecipientError('Recipient already added.');
      return;
    }
    setRecipientError(null);
    update({ recipients: [...value.recipients, email] });
    setRecipientInput('');
  };

  const removeRecipient = (email: string) => {
    update({ recipients: value.recipients.filter((r: string) => r !== email) });
  };

  const handleTimeBlur = (nextValue: string) => {
    if (!TIME_REGEX.test(nextValue)) {
      setTimeError('Use HH:MM 24-hour format (e.g. 09:00).');
    } else {
      setTimeError(null);
      update({ time: nextValue });
    }
  };

  return (
    <Card className="lg:col-span-12 p-4 sm:p-5">
      <SectionHeader
        icon="schedule_send"
        iconBg="bg-amber-50 dark:bg-amber-950"
        iconFg="text-amber-600 dark:text-amber-400"
        title="Scheduled Report Delivery"
        description="Automatically email reports to stakeholders on a recurring schedule."
      />

      {/* Enabled toggle */}
      <div className="flex items-center justify-between border-b pb-4 mb-4">
        <div>
          <Label htmlFor="scheduled-enabled" className="text-sm font-medium">
            Enable scheduled delivery
          </Label>
          <p className="text-xs text-muted-foreground">When off, no automated reports are sent.</p>
        </div>
        <Switch
          id="scheduled-enabled"
          checked={enabled}
          onCheckedChange={(v) => update({ enabled: v })}
          aria-label="Enable scheduled delivery"
        />
      </div>

      <fieldset
        aria-disabled={!enabled}
        className={!enabled ? 'opacity-60 pointer-events-none' : ''}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Frequency */}
          <div className="space-y-2">
            <Label htmlFor="scheduled-frequency" className="text-sm font-medium">
              Frequency
            </Label>
            <Select
              value={value.frequency}
              onValueChange={(v) => update({ frequency: v as ScheduledDeliveryFrequency })}
            >
              <SelectTrigger id="scheduled-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Day of week (weekly only) */}
          {value.frequency === 'weekly' && (
            <div className="space-y-2">
              <Label htmlFor="scheduled-day-of-week" className="text-sm font-medium">
                Day of week
              </Label>
              <Select
                value={String(value.dayOfWeek ?? 1)}
                onValueChange={(v) => update({ dayOfWeek: Number(v) })}
              >
                <SelectTrigger id="scheduled-day-of-week">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time */}
          <div className="space-y-2">
            <Label htmlFor="scheduled-time" className="text-sm font-medium">
              Delivery time (24h)
            </Label>
            <Input
              id="scheduled-time"
              type="time"
              defaultValue={value.time}
              onBlur={(e) => handleTimeBlur(e.currentTarget.value)}
              aria-invalid={timeError !== null}
            />
            {timeError && (
              <p role="alert" className="text-xs text-destructive">
                {timeError}
              </p>
            )}
          </div>

          {/* Format */}
          <div className="space-y-2">
            <Label htmlFor="scheduled-format" className="text-sm font-medium">
              Format
            </Label>
            <Select
              value={value.format}
              onValueChange={(v) => update({ format: v as ScheduledDeliveryFormat })}
            >
              <SelectTrigger id="scheduled-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Recipients */}
        <div className="mt-5 space-y-2">
          <Label htmlFor="scheduled-recipient-input" className="text-sm font-medium">
            Recipients
          </Label>
          <div className="flex gap-2">
            <Input
              id="scheduled-recipient-input"
              type="email"
              placeholder="name@example.com"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRecipient();
                }
              }}
              aria-invalid={recipientError !== null}
            />
            <Button type="button" onClick={addRecipient} variant="outline">
              Add
            </Button>
          </div>
          {recipientError && (
            <p role="alert" className="text-xs text-destructive">
              {recipientError}
            </p>
          )}

          {value.recipients.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {value.recipients.map((email: string) => (
                <li
                  key={email}
                  className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted text-xs"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    aria-label={`Remove ${email}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <span className="material-symbols-outlined text-xs" aria-hidden="true">
                      close
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No recipients yet.</p>
          )}

          {isInvalid && (
            <p role="alert" className="text-xs text-destructive mt-1">
              At least one recipient is required when scheduled delivery is enabled.
            </p>
          )}
        </div>
      </fieldset>
    </Card>
  );
}
