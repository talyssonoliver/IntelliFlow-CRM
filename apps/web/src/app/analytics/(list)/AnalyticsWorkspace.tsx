'use client';

/**
 * The Analytics workspace frame every view shares (owner 26/11, Analytics mockup): the views'
 * tabs under the hero, and the period with what it is compared against.
 *
 * Only views that are built are listed: a tab never leads to a placeholder (owner rule: no
 * "Coming soon"). The mockup's six views are added here as each one lands.
 */

import Link from 'next/link';
import type { PeriodKey } from '@/hooks/useAnalyticsDateRange';
import type { DateRange } from '@/lib/analytics/period-comparison';
import { PERIOD_ITEMS } from './analytics-shared';

export const ANALYTICS_VIEWS = [
  { id: 'performance', label: 'Performance', href: '/analytics' },
] as const;

export type AnalyticsViewId = (typeof ANALYTICS_VIEWS)[number]['id'];

export function AnalyticsViewTabs({ active }: Readonly<{ active: AnalyticsViewId }>) {
  return (
    <nav aria-label="Analytics views" className="-mt-1 border-b border-border">
      <ul className="flex gap-6 overflow-x-auto">
        {ANALYTICS_VIEWS.map((view) => {
          const current = view.id === active;
          return (
            <li key={view.id}>
              <Link
                href={view.href}
                aria-current={current ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 text-sm font-semibold ${
                  current
                    ? 'border-ds-primary text-ds-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const DAY = 24 * 60 * 60 * 1000;

function rangeLabel(range: DateRange): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(range.startDate, false)} – ${fmt(range.endDate, true)}`;
}

/** The period picker and the comparison it is measured against, as the mockup's filter chips. */
/**
 * The compared dates, shown in the hero under the title (owner 22/11: "Why haven't you placed
 * these on the header?"). The period itself is picked from the hero's Period menu.
 */
export function PeriodComparisonNote({ range }: Readonly<{ range: DateRange }>) {
  const days = Math.round(
    (new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) / DAY
  );
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-white/80">
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
        compare_arrows
      </span>
      {rangeLabel(range)} vs the previous {days} days
    </p>
  );
}

export function PeriodFilters({
  period,
  onPeriodChange,
  range,
}: Readonly<{ period: PeriodKey; onPeriodChange: (p: PeriodKey) => void; range: DateRange }>) {
  const days = Math.round(
    (new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) / DAY
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground">
        <span
          className="material-symbols-outlined text-[18px] text-muted-foreground"
          aria-hidden="true"
        >
          calendar_month
        </span>
        <span className="sr-only">Period</span>
        <select
          value={period}
          onChange={(e) => onPeriodChange(e.target.value as PeriodKey)}
          className="cursor-pointer bg-transparent pr-1 focus:outline-none"
        >
          {PERIOD_ITEMS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          compare_arrows
        </span>
        <span>
          {rangeLabel(range)} vs the previous {days} days
        </span>
      </span>
    </div>
  );
}
