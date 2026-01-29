'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import type { Widget } from '@intelliflow/ui';
import { widgetRegistry } from '@/components/dashboard/widgets';

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

export default function DashboardPage() {
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved layout from localStorage on mount
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
    setIsLoaded(true);
  }, []);

  // Grid column span classes
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

  return (
    <div className="p-6 lg:p-8 bg-background-light dark:bg-background-dark min-h-[calc(100vh-4rem)]">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
        <Link href="/" className="hover:text-ds-primary">
          Home
        </Link>
        <span>&gt;</span>
        <span className="text-slate-900 dark:text-white font-medium">Dashboard</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Welcome back, Alex. Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/customize"
            className="group inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm rounded-lg hover:bg-slate-50 hover:border-slate-400 dark:hover:bg-slate-700 dark:hover:border-slate-500 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
          >
            <span className="material-symbols-outlined text-base transition-transform group-hover:rotate-90">tune</span>Customize
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

      {/* Dynamic Widget Grid */}
      {isLoaded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-min">
          {widgets.map((widget) => {
            const WidgetComponent = widgetRegistry[widget.type];
            return (
              <Card
                key={widget.id}
                className={`
                  bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark
                  ${colSpanClasses[widget.colSpan] || 'col-span-1'}
                  ${rowSpanClasses[widget.rowSpan] || ''}
                `}
              >
                {WidgetComponent ? (
                  <WidgetComponent config={widget.config} />
                ) : (
                  <div className="p-6 text-slate-400">
                    Unknown widget: {widget.type}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        /* Loading skeleton */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-32 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}
