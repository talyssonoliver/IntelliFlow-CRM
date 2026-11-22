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
  /**
   * Draw the card's own border and background, for a page that lists KPIs outside the dashboard
   * grid (whose widget box already frames the card). Owner 21/11: one KPI card everywhere.
   */
  framed?: boolean;
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
  framed = false,
}: Readonly<KpiCardProps>) {
  const frame = framed ? ' rounded-lg border border-border bg-card' : '';
  const badge = failed ? undefined : badgeProp;
  const footer = failed ? undefined : footerProp;
  const row = variant === 'default';
  // Default card: the number scales with the card (about 18px on a 360px phone card, up to 30px
  // on a wide desktop card) on a line as tall as the icon needs; compact keeps its fixed sizes.
  const figureSize = row
    ? 'text-[clamp(1.125rem,11cqi,1.875rem)] leading-7 @min-[11rem]:leading-8'
    : 'text-2xl sm:text-3xl';
  const figure = failed ? (
    <p
      className={`text-sm text-muted-foreground truncate ${row ? 'leading-7 @min-[11rem]:leading-8' : ''}`}
      data-testid="kpi-value"
      role="alert"
    >
      Couldn&apos;t load
    </p>
  ) : (
    <p
      className={`${figureSize} font-bold text-foreground tabular-nums truncate ${pending ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      data-testid="kpi-value"
      aria-busy={pending || undefined}
    >
      {pending ? '...' : value}
    </p>
  );

  if (variant === 'compact') {
    return (
      <div className={`p-4 sm:p-5 flex flex-col justify-between gap-3 h-full min-w-0${frame}`}>
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

  // One layout at every width (owner 21/11): icon on the left, exactly as tall as the label and
  // number beside it; the badge under the number; the footer under the row. It keys on the card's
  // own width (container query), not the screen, so a resized card and the Accounts/Tickets cards
  // follow it too:
  // - under 9rem (two per row on a 320px phone): stacked, so the label is not cut;
  // - 9-11rem (360-389px phones): 46px icon = 16px label + 2px gap + 28px number line;
  // - 11-14rem (390-440px phones, squeezed desktop): 50px icon = 16 + 2 + 32;
  // - 13rem and up (desktop from 1024px): at least 112px tall, so every desktop card matches;
  // - 14rem and up: 56px icon = 20 + 4 + 32.
  return (
    <div className={`@container h-full min-w-0${frame}`}>
      <div className="h-full flex flex-col justify-center min-w-0 p-3 @min-[13rem]:min-h-28 @min-[14rem]:p-5">
        <div className="flex items-center gap-2 @min-[11rem]:gap-3 @min-[14rem]:gap-4 @max-[9rem]:flex-col @max-[9rem]:items-start">
          <div
            className={`shrink-0 rounded-xl flex items-center justify-center size-[46px] @min-[11rem]:size-[50px] @min-[14rem]:size-14 @max-[9rem]:size-9 ${iconClassName}`}
            data-testid="kpi-icon"
          >
            <span
              className="material-symbols-outlined text-[24px] @min-[14rem]:text-[28px] @max-[9rem]:text-xl"
              aria-hidden="true"
            >
              {icon}
            </span>
          </div>
          <div className="min-w-0 flex-1 flex flex-col @max-[9rem]:w-full">
            <p className="text-xs leading-4 @min-[14rem]:text-sm @min-[14rem]:leading-5 text-muted-foreground truncate">
              {label}
            </p>
            <div className="mt-0.5 @min-[14rem]:mt-1 min-w-0">{figure}</div>
            {badge ? <div className="mt-1">{badge}</div> : null}
          </div>
        </div>
        {footer}
      </div>
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
