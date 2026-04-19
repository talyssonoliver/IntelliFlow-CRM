'use client';

// Scheduled Delivery Tab — PG-187
// Toggle + frequency + day-of-week + time + recipients + format.

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
import type { ScheduledDelivery } from '@intelliflow/validators';

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

export interface ScheduledDeliveryTabProps {
  value: ScheduledDelivery;
  onChange: (value: ScheduledDelivery) => void;
}

export function ScheduledDeliveryTab({ value, onChange }: Readonly<ScheduledDeliveryTabProps>) {
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);

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
    update({ recipients: value.recipients.filter((r) => r !== email) });
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Scheduled Report Delivery</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically email reports to stakeholders on a recurring schedule.
        </p>
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <Label htmlFor="delivery-enabled" className="font-medium cursor-pointer">
            Enable scheduled delivery
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            When off, no automatic reports are sent.
          </p>
        </div>
        <Switch
          id="delivery-enabled"
          checked={enabled}
          onCheckedChange={(v) => update({ enabled: Boolean(v) })}
          aria-label="Enable scheduled delivery"
        />
      </div>

      {/* Form fields (disabled when !enabled) */}
      <fieldset
        disabled={!enabled}
        aria-disabled={!enabled}
        className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        {/* Frequency */}
        <div className="space-y-2">
          <Label htmlFor="delivery-frequency">Frequency</Label>
          <Select
            value={value.frequency}
            onValueChange={(v) => update({ frequency: v as ScheduledDelivery['frequency'] })}
          >
            <SelectTrigger id="delivery-frequency" aria-label="Delivery frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Day of week (only when frequency = weekly) */}
        {value.frequency === 'weekly' && (
          <div className="space-y-2">
            <Label htmlFor="delivery-day">Day of week</Label>
            <Select
              value={String(value.dayOfWeek ?? 1)}
              onValueChange={(v) => update({ dayOfWeek: Number(v) })}
            >
              <SelectTrigger id="delivery-day" aria-label="Day of week">
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
          <Label htmlFor="delivery-time">Delivery time (24h)</Label>
          <Input
            id="delivery-time"
            type="time"
            value={value.time}
            onChange={(e) => update({ time: e.target.value })}
            aria-label="Delivery time"
          />
        </div>

        {/* Recipients */}
        <div className="space-y-2">
          <Label htmlFor="delivery-recipient">Recipients</Label>
          <div className="flex items-center gap-2">
            <Input
              id="delivery-recipient"
              type="email"
              placeholder="admin@example.com"
              value={recipientInput}
              onChange={(e) => {
                setRecipientInput(e.target.value);
                setRecipientError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRecipient();
                }
              }}
              aria-describedby={recipientError ? 'recipient-error' : undefined}
            />
            <Button type="button" variant="outline" onClick={addRecipient}>
              Add
            </Button>
          </div>
          {recipientError && (
            <p id="recipient-error" role="alert" className="text-sm text-destructive">
              {recipientError}
            </p>
          )}

          {value.recipients.length > 0 ? (
            <ul className="flex flex-wrap gap-2 mt-2">
              {value.recipients.map((email) => (
                <li
                  key={email}
                  className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    aria-label={`Remove ${email}`}
                    className="hover:text-destructive"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No recipients added yet.</p>
          )}
        </div>

        {/* Format */}
        <div className="space-y-2">
          <Label htmlFor="delivery-format">Export format</Label>
          <Select
            value={value.format}
            onValueChange={(v) => update({ format: v as ScheduledDelivery['format'] })}
          >
            <SelectTrigger id="delivery-format" aria-label="Export format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="excel">Excel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </fieldset>

      {isInvalid && (
        <p role="alert" className="text-sm text-destructive">
          At least one recipient is required when scheduled delivery is enabled.
        </p>
      )}
    </Card>
  );
}
