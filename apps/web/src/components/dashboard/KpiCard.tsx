'use client';

/**
 * KpiCard — the one stat card every KPI dashboard widget renders (#1225 UI-009).
 *
 * Six widgets (Total Leads, Sales Revenue, Active Deals, Open Tickets, Active
 * Leads, Conversion Rate) each hand-rolled the same icon / label / big number
 * block, and Total Leads and Total Revenue each hand-rolled a trend badge. On a
 * phone the dashboard now shows two cards per row, so the card is tighter below
 * `sm` (padding, icon, number size) and the number never overflows its column.
 *
 * Variants:
 * - `default`: icon tile top-left, optional badge top-right, label, big number.
 * - `compact`: small round icon inline with the label, number below.
 */

import * as React from 'react';
import { formatTrendPercent, shouldShowTrend } from '@/lib/dashboard/kpi-calculator';

export interface KpiCardProps {
  label: string;
  /** Material Symbols name. */
  icon: string;
  /** Classes for the icon tile, e.g. `bg-ds-primary/10 text-ds-primary`. */
  iconClassName?: string;
  /** The figure. Ignored while `pending`. */
  value: React.ReactNode;
  /** No data yet: shows a pending mark, never a real-looking zero. */
  pending?: boolean;
  /** The request failed: says so, and hides the badge and footer. */
  failed?: boolean;
  /** Top-right on `default` (a trend or status pill). */
  badge?: React.ReactNode;
  /** Under the number (a comparison line, a progress bar, a warning). */
  footer?: React.ReactNode;
  variant?: 'default' | 'compact';
}

export function KpiCard({
  label,
  icon,
  iconClassName = 'bg-ds-primary/10 text-ds-primary',
  value,
  pending = false,
  failed = false,
  badge: badgeProp,
  footer: footerProp,
  variant = 'default',
}: Readonly<KpiCardProps>) {
  const badge = failed ? undefined : badgeProp;
  const footer = failed ? undefined : footerProp;
  const figure = failed ? (
    <p className="text-sm text-muted-foreground truncate" data-testid="kpi-value" role="alert">
      Couldn&apos;t load
    </p>
  ) : (
    <p
      className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums truncate"
      data-testid="kpi-value"
    >
      {pending ? '...' : value}
    </p>
  );

  if (variant === 'compact') {
    return (
      <div className="p-4 sm:p-5 flex flex-col justify-between gap-3 h-full min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={`size-8 shrink-0 rounded-full flex items-center justify-center ${iconClassName}`}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {icon}
            </span>
          </div>
          <h3 className="font-medium text-foreground text-sm sm:text-base truncate">{label}</h3>
        </div>
        <div className="min-w-0">
          {figure}
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div
          className={`size-9 sm:size-12 shrink-0 rounded-lg flex items-center justify-center ${iconClassName}`}
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl" aria-hidden="true">
            {icon}
          </span>
        </div>
        {badge}
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mt-3 sm:mt-4 truncate">{label}</p>
      <div className="mt-1 min-w-0">{figure}</div>
      {footer}
    </div>
  );
}

export interface KpiTrendBadgeProps {
  /** Period-over-period change in percent (unrounded). */
  deltaPercent: number;
  /** The previous period's value the percentage is measured against. */
  previous: number;
  /** Baselines below this are "near zero": no badge (+900% on 1 → 10 says nothing). */
  minBaseline?: number;
  /** Decimal places shown. */
  fractionDigits?: number;
  /** `pill` (filled) or `inline` (icon + text). */
  appearance?: 'pill' | 'inline';
}

/** Trend badge, or nothing when the baseline is near zero or there is no change. */
export function KpiTrendBadge({
  deltaPercent,
  previous,
  minBaseline,
  fractionDigits = 0,
  appearance = 'inline',
}: Readonly<KpiTrendBadgeProps>) {
  if (!shouldShowTrend(deltaPercent, previous, minBaseline, fractionDigits)) return null;
  const up = deltaPercent >= 0;
  const text = formatTrendPercent(deltaPercent, fractionDigits);

  if (appearance === 'pill') {
    return (
      <span
        className={`text-xs font-medium flex items-center px-1.5 py-0.5 rounded whitespace-nowrap ${
          up
            ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
            : 'text-red-500 bg-red-50 dark:bg-red-500/10'
        }`}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs sm:text-sm font-medium whitespace-nowrap ${
        up ? 'text-green-600' : 'text-red-600'
      }`}
    >
      <span className="material-symbols-outlined text-base sm:text-lg" aria-hidden="true">
        {up ? 'trending_up' : 'trending_down'}
      </span>
      {text}
    </span>
  );
}
