'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input, Switch } from '@intelliflow/ui';
import { AVAILABILITY_LIMITS } from '@intelliflow/validators';
import { SectionHeader } from '@/components/shared/section-header';
import {
  DEFAULT_OPEN_RANGE,
  DISPLAY_ORDER,
  WEEKDAY_NAMES,
  formatDaySummary,
  newKey,
  rangeFieldId,
  type DraftDay,
  type Weekday,
} from '../availability-draft';

export const WEEKLY_HOURS_TITLE_ID = 'availability-weekly-hours-title';

interface WeeklyHoursCardProps {
  days: DraftDay[];
  onChange: (days: DraftDay[]) => void;
  errors: Record<string, string>;
  readOnly: boolean;
  announce: (message: string) => void;
}

const MAX_RANGES = AVAILABILITY_LIMITS.maxRangesPerWeekday;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function WeeklyHoursCard({
  days,
  onChange,
  errors,
  readOnly,
  announce,
}: Readonly<WeeklyHoursCardProps>) {
  // Focus moves after the DOM has re-rendered (add/remove), by element id.
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const updateDay = (weekday: Weekday, patch: Partial<DraftDay>) => {
    onChange(days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  };

  const toggleDay = (day: DraftDay, open: boolean) => {
    const ranges =
      open && day.ranges.length === 0 ? [{ key: newKey('r'), ...DEFAULT_OPEN_RANGE }] : day.ranges;
    updateDay(day.weekday, { open, ranges });
  };

  const addRange = (day: DraftDay) => {
    const name = WEEKDAY_NAMES[day.weekday];
    if (day.ranges.length >= MAX_RANGES) {
      announce(`Maximum of ${MAX_RANGES} ranges reached for ${name}.`);
      return;
    }
    const last = day.ranges[day.ranges.length - 1];
    const next = { key: newKey('r'), start: last?.end ?? DEFAULT_OPEN_RANGE.start, end: '' };
    updateDay(day.weekday, { ranges: [...day.ranges, next] });
    announce(`Range added, ${name} range ${day.ranges.length + 1}.`);
    setFocusTarget(rangeFieldId(day.weekday, day.ranges.length, 'start'));
  };

  const removeRange = (day: DraftDay, index: number) => {
    const name = WEEKDAY_NAMES[day.weekday];
    const ranges = day.ranges.filter((_, i) => i !== index);
    updateDay(day.weekday, { ranges });
    announce(
      `${name} range ${index + 1} removed, ${plural(ranges.length, 'range')} remain${ranges.length === 1 ? 's' : ''}.`
    );
    const focusIndex = Math.min(index, ranges.length - 1);
    setFocusTarget(
      focusIndex >= 0 ? rangeFieldId(day.weekday, focusIndex, 'start') : `add-range-${day.weekday}`
    );
  };

  const setTime = (day: DraftDay, index: number, part: 'start' | 'end', value: string) => {
    updateDay(day.weekday, {
      ranges: day.ranges.map((r, i) => (i === index ? { ...r, [part]: value } : r)),
    });
  };

  return (
    <section aria-labelledby={WEEKLY_HOURS_TITLE_ID} className="lg:col-span-8">
      <Card className="h-full p-4 sm:p-5">
        <SectionHeader
          icon="schedule"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconFg="text-blue-600 dark:text-blue-400"
          title="Weekly hours"
          titleId={WEEKLY_HOURS_TITLE_ID}
          headingLevel={2}
          focusableTitle
          description="When appointments can be booked, as clock times in the firm timezone. An appointment must fit inside one range of its day."
        />

        {readOnly ? (
          <ul aria-label="Weekly hours" className="divide-y divide-slate-200 dark:divide-slate-700">
            {DISPLAY_ORDER.map((weekday) => (
              <li key={weekday} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium text-foreground">{WEEKDAY_NAMES[weekday]}</span>
                <span className="text-muted-foreground">{formatDaySummary(days[weekday])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            {DISPLAY_ORDER.map((weekday) => {
              const day = days[weekday];
              const name = WEEKDAY_NAMES[weekday];
              const summaryId = `hours-summary-${weekday}`;
              const atCap = day.ranges.length >= MAX_RANGES;
              return (
                <fieldset
                  key={weekday}
                  className="min-w-0 border-0 border-t border-slate-200 p-0 pt-3 first:border-t-0 first:pt-0 dark:border-slate-700"
                >
                  <legend className="sr-only">{name}</legend>
                  <div className="flex flex-wrap items-center gap-3">
                    <span aria-hidden="true" className="w-24 text-sm font-medium text-foreground">
                      {name}
                    </span>
                    <Switch
                      checked={day.open}
                      onCheckedChange={(checked: boolean) => toggleDay(day, checked)}
                      aria-label={`${name} open`}
                      aria-describedby={summaryId}
                    />
                    <p id={summaryId} className="text-sm text-muted-foreground">
                      {formatDaySummary(day)}
                    </p>
                  </div>

                  {day.open && (
                    <>
                      <ul aria-label={`${name} hours`} className="mt-2 space-y-2">
                        {day.ranges.map((range, index) => {
                          const startId = rangeFieldId(weekday, index, 'start');
                          const endId = rangeFieldId(weekday, index, 'end');
                          const startError = errors[startId];
                          const endError = errors[endId];
                          return (
                            <li key={range.key} className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  id={startId}
                                  type="time"
                                  value={range.start}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setTime(day, index, 'start', e.target.value)
                                  }
                                  aria-label={`${name} range ${index + 1} start`}
                                  aria-invalid={startError ? true : undefined}
                                  aria-describedby={startError ? `${startId}-error` : undefined}
                                  className="min-w-[7.5rem] flex-1 sm:w-32 sm:flex-none"
                                />
                                <span aria-hidden="true" className="text-sm text-muted-foreground">
                                  to
                                </span>
                                <Input
                                  id={endId}
                                  type="time"
                                  value={range.end}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setTime(day, index, 'end', e.target.value)
                                  }
                                  aria-label={`${name} range ${index + 1} end`}
                                  aria-invalid={endError ? true : undefined}
                                  aria-describedby={endError ? `${endId}-error` : undefined}
                                  className="min-w-[7.5rem] flex-1 sm:w-32 sm:flex-none"
                                />
                                {day.ranges.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-11 w-11 p-0"
                                    aria-label={`Remove ${name} range ${index + 1}`}
                                    onClick={() => removeRange(day, index)}
                                  >
                                    <span
                                      className="material-symbols-outlined text-[18px]"
                                      aria-hidden="true"
                                    >
                                      close
                                    </span>
                                  </Button>
                                )}
                              </div>
                              {startError && (
                                <p
                                  id={`${startId}-error`}
                                  className="text-xs text-red-700 dark:text-red-300"
                                >
                                  {startError}
                                </p>
                              )}
                              {endError && (
                                <p
                                  id={`${endId}-error`}
                                  className="text-xs text-red-700 dark:text-red-300"
                                >
                                  {endError}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <Button
                        id={`add-range-${weekday}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 min-h-11"
                        aria-disabled={atCap || undefined}
                        aria-describedby={atCap ? `range-cap-${weekday}` : undefined}
                        onClick={() => addRange(day)}
                      >
                        Add range <span className="sr-only">for {name}</span>
                      </Button>
                      {atCap && (
                        <p
                          id={`range-cap-${weekday}`}
                          className="mt-1 text-xs text-muted-foreground"
                        >
                          Maximum {MAX_RANGES} ranges per day.
                        </p>
                      )}
                    </>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}
      </Card>
    </section>
  );
}
