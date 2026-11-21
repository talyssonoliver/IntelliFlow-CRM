'use client';

/**
 * WidgetSkeleton — per-widget Suspense fallback shapes.
 *
 * Each variant matches the visual footprint of the real widget so the
 * layout does not shift when data arrives.
 */

import { Card } from '@intelliflow/ui';
import { dashboardColSpanClass } from '@/lib/dashboard/grid';

interface WidgetSkeletonProps {
  /** Grid column span (mirrors Widget.colSpan) */
  colSpan?: number;
  /** Tailwind height class for the skeleton body */
  heightClass?: string;
  className?: string;
}

export function WidgetSkeleton({
  colSpan = 1,
  heightClass = 'h-32',
  className = '',
}: Readonly<WidgetSkeletonProps>) {
  return (
    <Card
      aria-hidden="true"
      className={`
        bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark
        ${dashboardColSpanClass(colSpan, 'kpi')}
        ${heightClass}
        ${className}
        animate-pulse
      `}
    />
  );
}

/** Stat card skeleton — matches TotalLeads / SalesRevenue / ActiveDeals / OpenTickets */
export function StatCardSkeleton({ colSpan = 1 }: Readonly<{ colSpan?: number }>) {
  return (
    <Card
      aria-hidden="true"
      className={`
        bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark
        ${dashboardColSpanClass(colSpan, 'kpi')}
        animate-pulse
      `}
    >
      {/* Same row shape and sizes as KpiCard (owner 21/11), so nothing moves when it loads. */}
      <div className="@container h-full">
        <div className="h-full flex flex-col justify-center p-3 @min-[14rem]:p-5 @min-[14rem]:min-h-28">
          <div className="flex items-center gap-2 @min-[11rem]:gap-3 @min-[14rem]:gap-4 @max-[9rem]:flex-col @max-[9rem]:items-start">
            <div className="shrink-0 rounded-xl size-[46px] @min-[11rem]:size-[50px] @min-[14rem]:size-14 @max-[9rem]:size-9 bg-slate-200 dark:bg-slate-700" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="h-6 w-16 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Chart widget skeleton — matches DealsWon / PipelineSummary */
export function ChartWidgetSkeleton({ colSpan = 3 }: Readonly<{ colSpan?: number }>) {
  return (
    <Card
      aria-hidden="true"
      className={`
        bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark
        ${dashboardColSpanClass(colSpan, 'panel')}
        animate-pulse
      `}
    >
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-48 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-8 w-32 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="flex items-end justify-between h-48 gap-4 px-4 flex-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-1">
              <div className="w-full h-40 rounded-t bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** List widget skeleton — matches UpcomingTasks / RecentActivity */
export function ListWidgetSkeleton({ colSpan = 1 }: Readonly<{ colSpan?: number }>) {
  return (
    <Card
      aria-hidden="true"
      className={`
        bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark
        ${dashboardColSpanClass(colSpan, 'panel')}
        animate-pulse
      `}
    >
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 w-36 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="space-y-3 flex-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 w-full rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Pipeline widget skeleton — matches PipelineSummary (wide, list of bars) */
export function PipelineWidgetSkeleton({ colSpan = 3 }: Readonly<{ colSpan?: number }>) {
  return (
    <Card
      aria-hidden="true"
      className={`
        bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark
        ${dashboardColSpanClass(colSpan, 'panel')}
        animate-pulse
      `}
    >
      <div className="p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 w-40 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="space-y-4 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
