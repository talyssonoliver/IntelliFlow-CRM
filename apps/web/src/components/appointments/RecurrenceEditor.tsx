'use client';

import { useState } from 'react';
import { formatRecurrence } from '@/lib/appointments/appointment-utils';
import type { RecurrencePattern, DayOfWeek } from './types';

export interface RecurrenceEditorProps {
  value: RecurrencePattern | null;
  onChange: (pattern: RecurrencePattern | null) => void;
  disabled?: boolean;
}

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'MONDAY', label: 'Mon' },
  { value: 'TUESDAY', label: 'Tue' },
  { value: 'WEDNESDAY', label: 'Wed' },
  { value: 'THURSDAY', label: 'Thu' },
  { value: 'FRIDAY', label: 'Fri' },
  { value: 'SATURDAY', label: 'Sat' },
  { value: 'SUNDAY', label: 'Sun' },
];

const FREQUENCIES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

type EndCondition = 'never' | 'date' | 'count';

export function RecurrenceEditor({ value, onChange, disabled }: Readonly<RecurrenceEditorProps>) {
  const [endCondition, setEndCondition] = useState<EndCondition>(() => {
    if (value?.endDate) return 'date';
    if (value?.occurrenceCount) return 'count';
    return 'never';
  });

  if (!value) {
    return (
      <div>
        <button
          type="button"
          onClick={() => onChange({ frequency: 'WEEKLY', interval: 1 })}
          disabled={disabled}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">repeat</span> Add recurrence
        </button>
      </div>
    );
  }

  const update = (patch: Partial<RecurrencePattern>) => {
    onChange({ ...value, ...patch });
  };

  const handleFrequencyChange = (frequency: RecurrencePattern['frequency']) => {
    const base: RecurrencePattern = { frequency, interval: value.interval };
    if (frequency === 'WEEKLY') base.daysOfWeek = [];
    if (endCondition === 'date' && value.endDate) base.endDate = value.endDate;
    if (endCondition === 'count' && value.occurrenceCount)
      base.occurrenceCount = value.occurrenceCount;
    onChange(base);
  };

  const handleEndConditionChange = (condition: EndCondition) => {
    setEndCondition(condition);
    const patch: Partial<RecurrencePattern> = { endDate: undefined, occurrenceCount: undefined };
    if (condition === 'count') patch.occurrenceCount = 10;
    update(patch);
  };

  const toggleDay = (day: DayOfWeek) => {
    const current = value.daysOfWeek || [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    update({ daysOfWeek: next });
  };

  const preview = formatRecurrence(value);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Recurrence</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="text-xs text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
        >
          Remove recurrence
        </button>
      </div>

      {/* Frequency */}
      <fieldset disabled={disabled}>
        <legend className="text-xs font-medium text-gray-600 mb-1">Frequency</legend>
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Frequency">
          {FREQUENCIES.map((freq) => (
            <label
              key={freq.value}
              className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer transition-colors ${
                value.frequency === freq.value
                  ? 'bg-blue-100 border-blue-300 text-blue-800'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name="frequency"
                value={freq.value}
                checked={value.frequency === freq.value}
                onChange={() => handleFrequencyChange(freq.value)}
                className="sr-only"
              />
              {freq.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Interval */}
      <div className="flex items-center gap-2">
        <label htmlFor="recurrence-interval" className="text-sm text-gray-700">
          Every
        </label>
        <input
          id="recurrence-interval"
          type="number"
          min={1}
          max={99}
          value={value.interval}
          onChange={(e) => {
            const v = Number.parseInt(e.target.value, 10);
            if (v > 0) update({ interval: v });
          }}
          disabled={disabled}
          className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-center disabled:opacity-50"
        />
        <span className="text-sm text-gray-700">
          {(() => {
            if (value.frequency === 'DAILY') return 'day(s)';
            if (value.frequency === 'WEEKLY') return 'week(s)';
            if (value.frequency === 'MONTHLY') return 'month(s)';
            return 'year(s)';
          })()}
        </span>
      </div>

      {/* Weekly: Day of week checkboxes */}
      {value.frequency === 'WEEKLY' && (
        <fieldset disabled={disabled}>
          <legend className="text-xs font-medium text-gray-600 mb-1">Days of week</legend>
          <div className="flex gap-1 flex-wrap">
            {DAYS.map((day) => (
              <label
                key={day.value}
                className={`w-10 h-8 flex items-center justify-center text-xs rounded-md border cursor-pointer transition-colors ${
                  (value.daysOfWeek || []).includes(day.value)
                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={(value.daysOfWeek || []).includes(day.value)}
                  onChange={() => toggleDay(day.value)}
                  className="sr-only"
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Monthly: Day of month */}
      {value.frequency === 'MONTHLY' && (
        <div className="flex items-center gap-2">
          <label htmlFor="day-of-month" className="text-sm text-gray-700">
            On day
          </label>
          <select
            id="day-of-month"
            value={value.dayOfMonth || 1}
            onChange={(e) => update({ dayOfMonth: Number.parseInt(e.target.value, 10) })}
            disabled={disabled}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Yearly: Month + Day */}
      {value.frequency === 'YEARLY' && (
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="month-of-year" className="text-sm text-gray-700">
            Month
          </label>
          <select
            id="month-of-year"
            value={value.monthOfYear || 1}
            onChange={(e) => update({ monthOfYear: Number.parseInt(e.target.value, 10) })}
            disabled={disabled}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            {[
              'Jan',
              'Feb',
              'Mar',
              'Apr',
              'May',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Oct',
              'Nov',
              'Dec',
            ].map((m, i) => (
              <option key={i + 1} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <label htmlFor="yearly-day" className="text-sm text-gray-700">
            Day
          </label>
          <select
            id="yearly-day"
            value={value.dayOfMonth || 1}
            onChange={(e) => update({ dayOfMonth: Number.parseInt(e.target.value, 10) })}
            disabled={disabled}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm disabled:opacity-50"
          >
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* End condition */}
      <fieldset disabled={disabled}>
        <legend className="text-xs font-medium text-gray-600 mb-1">Ends</legend>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="end-condition"
              value="never"
              checked={endCondition === 'never'}
              onChange={() => handleEndConditionChange('never')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Never</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="end-condition"
              value="date"
              checked={endCondition === 'date'}
              onChange={() => handleEndConditionChange('date')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">On date</span>
            {endCondition === 'date' && (
              <input
                type="date"
                value={value.endDate ? new Date(value.endDate).toISOString().split('T')[0] : ''}
                onChange={(e) =>
                  update({ endDate: e.target.value ? new Date(e.target.value) : undefined })
                }
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              />
            )}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="end-condition"
              value="count"
              checked={endCondition === 'count'}
              onChange={() => handleEndConditionChange('count')}
              className="text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">After</span>
            {endCondition === 'count' && (
              <>
                <input
                  id="occurrence-count"
                  type="number"
                  min={1}
                  max={365}
                  value={value.occurrenceCount || 10}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    if (v > 0) update({ occurrenceCount: v });
                  }}
                  className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm text-center"
                />
                <span className="text-sm text-gray-700">occurrences</span>
              </>
            )}
          </label>
        </div>
      </fieldset>

      {/* Preview */}
      {preview && (
        <p
          className="text-xs text-gray-500 italic border-t border-gray-200 pt-2"
          data-testid="recurrence-preview"
        >
          {preview}
        </p>
      )}
    </div>
  );
}
