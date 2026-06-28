'use client';

/**
 * Dashboard Client Island
 *
 * Contains all interactive dashboard logic: widget grid, localStorage layout,
 * auth guard, and customize/add-new actions.
 *
 * Each widget is independently wrapped in a <Suspense> boundary so widgets
 * stream in as their data arrives instead of all blocking on the slowest one.
 */

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import type { Widget } from '@intelliflow/ui';
import { widgetRegistry } from '@/components/dashboard/widgets';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import {
  StatCardSkeleton,
  ChartWidgetSkeleton,
  ListWidgetSkeleton,
  PipelineWidgetSkeleton,
} from '@/components/dashboard/WidgetSkeleton';

// Default widgets matching the original dashboard layout
const defaultWidgets: Widget[] = [
  // Row 1: 4 stat cards (1+1+1+1 = 4)
  { id: 'w1', type: 'total-leads', title: 'Total Leads', colSpan: 1, rowSpan: 1 },
  { id: 'w2', type: 'sales-revenue', title: 'Sales Revenue', colSpan: 1, rowSpan: 1 },
  { id: 'w3', type: 'active-deals', title: 'Active Deals', colSpan: 1, rowSpan: 1 },
  { id: 'w4', type: 'open-tickets', title: 'Open Tickets', colSpan: 1, rowSpan: 1 },
  // Row 2: Pipeline Summary (3/4) + Upcoming Tasks (1/4)
  { id: 'w5', type: 'pipeline-summary', title: 'Pipeline Summary', colSpan: 3, rowSpan: 1 },
  { id: 'w6', type: 'upcoming-tasks', title: 'Upcoming Tasks', colSpan: 1, rowSpan: 1 },
  // Row 3: Deals Won (3/4) + Recent Activity (1/4)
  { id: 'w7', type: 'deals-won', title: 'Deals Won (Last 6 Months)', colSpan: 3, rowSpan: 1 },
  { id: 'w8', type: 'recent-activity', title: 'Recent Activity', colSpan: 1, rowSpan: 1 },
];

/** Map widget type → appropriate Suspense skeleton fallback. */
function getSkeletonFallback(widget: Widget): React.ReactNode {
  switch (widget.type) {
    case 'total-leads':
    case 'sales-revenue':
    case 'active-deals':
    case 'open-tickets':
      return <StatCardSkeleton colSpan={widget.colSpan} />;
    case 'pipeline-summary':
      return <PipelineWidgetSkeleton colSpan={widget.colSpan} />;
    case 'deals-won':
      return <ChartWidgetSkeleton colSpan={widget.colSpan} />;
    case 'upcoming-tasks':
    case 'recent-activity':
      return <ListWidgetSkeleton colSpan={widget.colSpan} />;
    default:
      return <StatCardSkeleton colSpan={widget.colSpan} />;
  }
}

const colSpanClasses: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-2 lg:col-span-3',
  4: 'col-span-1 md:col-span-2 lg:col-span-4',
};

const rowSpanClasses: Record<number, string> = {
  1: '',
  2: 'row-span-2',
};

interface DashboardClientProps {
  initialLeadStats?: unknown;
}

export default function DashboardClient({ initialLeadStats }: Readonly<DashboardClientProps>) {
  const { isLoading: authLoading } = useRequireAuth();
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);

  // Load saved layout from localStorage on mount.
  // This no longer gates the entire grid — widgets render immediately with
  // their Suspense skeletons; if a saved layout exists, the grid re-orders
  // once localStorage is read (typically <1 frame).
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-layout');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWidgets(parsed);
        }
      } catch (e) {
        console.error('Failed to parse saved dashboard layout:', e);
      }
    }
  }, []);

  // Show loading skeleton while auth is being verified
  if (authLoading) {
    return (
      <div
        className="p-6 lg:p-8 bg-background-light dark:bg-background-dark min-h-[calc(100vh-4rem)]"
        aria-busy="true"
      >
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="space-y-2">
            <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-4 w-80 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card
                key={i}
                className="h-32 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 bg-background-light dark:bg-background-dark min-h-[calc(100vh-4rem)]">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4"
      >
        <Link href="/" className="hover:text-ds-primary">
          Home
        </Link>
        <span aria-hidden="true">&gt;</span>
        <span aria-current="page" className="text-slate-900 dark:text-white font-medium">
          Dashboard
        </span>
      </nav>

      {/* Header with Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          {/* Single polite live region (semantic <output> = status role) for the
              auto-refresh cadence — KPI cards themselves are NOT aria-live to
              avoid screen-reader spam on each poll. */}
          <output className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <span
              className="size-1.5 rounded-full bg-green-500 motion-safe:animate-pulse"
              aria-hidden="true"
            />
            <span>Live · refreshes every minute</span>
          </output>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/customize"
            className="group inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-lg hover:bg-slate-50 hover:border-slate-400 dark:hover:bg-slate-700 dark:hover:border-slate-500 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
          >
            <span
              className="material-symbols-outlined text-base transition-transform group-hover:rotate-90"
              aria-hidden="true"
            >
              tune
            </span>{' '}
            Customize
          </Link>
          <Link
            href="/dashboard/new"
            className="group flex items-center justify-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
          >
            <span
              className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform"
              aria-hidden="true"
            >
              add
            </span>
            <span>Add New</span>
          </Link>
        </div>
      </div>

      {/* Dashboard Widgets Grid — each widget has its own Suspense boundary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min">
        {widgets.map((widget) => {
          const WidgetComponent = widgetRegistry[widget.type];
          const gridClasses = `
            ${colSpanClasses[widget.colSpan] || 'col-span-1'}
            ${rowSpanClasses[widget.rowSpan] || ''}
          `;

          if (!WidgetComponent) {
            return (
              <Card
                key={widget.id}
                className={`bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark ${gridClasses}`}
              >
                <div className="p-6 text-slate-400">Unknown widget: {widget.type}</div>
              </Card>
            );
          }

          return (
            <Suspense key={widget.id} fallback={getSkeletonFallback(widget)}>
              <Card
                className={`bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark ${gridClasses}`}
              >
                <WidgetComponent
                  config={widget.config}
                  initialData={widget.type === 'total-leads' ? initialLeadStats : undefined}
                />
              </Card>
            </Suspense>
          );
        })}
      </div>
    </div>
  );
}
