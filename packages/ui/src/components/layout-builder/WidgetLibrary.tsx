'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import type { WidgetTemplate } from './types';

interface WidgetLibraryProps {
  templates: WidgetTemplate[];
  onAddWidget?: (template: WidgetTemplate) => void;
  renderDraggableItem?: (template: WidgetTemplate, children: React.ReactNode) => React.ReactNode;
  /** Widget types that are already in use (will be hidden from the library) */
  usedWidgetTypes?: string[];
  className?: string;
}

export function WidgetLibrary({
  templates,
  onAddWidget,
  renderDraggableItem,
  usedWidgetTypes = [],
  className = '',
}: WidgetLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter out templates that are already in use
  const availableTemplates = useMemo(() => {
    return templates.filter((t) => !usedWidgetTypes.includes(t.type));
  }, [templates, usedWidgetTypes]);

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return availableTemplates;
    const query = searchQuery.toLowerCase();
    return availableTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query)
    );
  }, [availableTemplates, searchQuery]);

  const groupedTemplates = useMemo(() => {
    const groups: Record<string, WidgetTemplate[]> = {
      analytics: [],
      sales: [],
      operational: [],
    };
    filteredTemplates.forEach((t) => {
      groups[t.category]?.push(t);
    });
    return groups;
  }, [filteredTemplates]);

  const categoryLabels: Record<string, string> = {
    analytics: 'Analytics',
    sales: 'Sales',
    operational: 'Operational',
  };

  return (
    <aside className={`w-80 bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark flex flex-col shrink-0 z-20 shadow-xl shadow-slate-200/50 dark:shadow-none ${className}`}>
      <div className="p-4 border-b border-border-light dark:border-border-dark">
        <h3 className="font-bold text-slate-900 dark:text-white mb-3">Widget Library</h3>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-background-light dark:bg-background-dark border-none rounded-lg text-sm px-3 py-2 pl-9 focus:ring-1 focus:ring-ds-primary placeholder:text-slate-400"
            placeholder="Search widgets..."
          />
          <span className="material-symbols-outlined absolute left-2.5 top-2 text-slate-400 text-[18px]">
            search
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => {
          if (categoryTemplates.length === 0) return null;
          return (
            <div key={category}>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 pl-1">
                {categoryLabels[category] || category}
              </h4>
              <div className="flex flex-col gap-2">
                {categoryTemplates.map((template) => {
                  const itemContent = (
                    <WidgetLibraryItem
                      key={template.type}
                      template={template}
                      onClick={() => onAddWidget?.(template)}
                    />
                  );

                  if (renderDraggableItem) {
                    return renderDraggableItem(template, itemContent);
                  }

                  return itemContent;
                })}
              </div>
            </div>
          );
        })}

        {filteredTemplates.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            {searchQuery ? (
              <>
                <span className="material-symbols-outlined text-4xl mb-2 block">search_off</span>
                <p className="text-sm">No widgets match your search</p>
              </>
            ) : availableTemplates.length === 0 ? (
              <>
                <span className="material-symbols-outlined text-4xl mb-2 block">check_circle</span>
                <p className="text-sm">All widgets added!</p>
                <p className="text-xs mt-1 text-slate-500">Remove a widget to add it again</p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-4xl mb-2 block">widgets</span>
                <p className="text-sm">No widgets available</p>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

interface WidgetLibraryItemProps {
  template: WidgetTemplate;
  onClick?: () => void;
  isDragging?: boolean;
}

export function WidgetLibraryItem({ template, onClick, isDragging = false }: WidgetLibraryItemProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-white dark:bg-[#1a2632] p-3 rounded-lg border border-border-light dark:border-border-dark shadow-sm
        cursor-grab hover:border-ds-primary hover:shadow-md transition-all flex items-center gap-3 group
        ${isDragging ? 'opacity-50 shadow-lg border-ds-primary' : ''}
      `}
    >
      <span className="material-symbols-outlined text-slate-400 group-hover:text-ds-primary transition-colors">
        {template.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
          {template.title}
        </p>
        <p className="text-xs text-slate-500 truncate">{template.description}</p>
      </div>
      <span className="material-symbols-outlined text-slate-300">drag_indicator</span>
    </div>
  );
}

// Default widget templates for CRM dashboard
export const defaultWidgetTemplates: WidgetTemplate[] = [
  // Analytics - KPI Cards
  {
    type: 'total-leads',
    title: 'Total Leads',
    description: 'Lead count with trend',
    icon: 'group',
    category: 'analytics',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'sales-revenue',
    title: 'Sales Revenue',
    description: 'Revenue with status badge',
    icon: 'payments',
    category: 'analytics',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'active-deals',
    title: 'Active Deals',
    description: 'Deal count',
    icon: 'handshake',
    category: 'analytics',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'open-tickets',
    title: 'Open Tickets',
    description: 'Ticket count with urgency',
    icon: 'confirmation_number',
    category: 'analytics',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'deals-won',
    title: 'Deals Won',
    description: 'Bar chart over time',
    icon: 'bar_chart',
    category: 'analytics',
    defaultColSpan: 2,
    defaultRowSpan: 1,
  },
  {
    type: 'traffic-sources',
    title: 'Traffic Sources',
    description: 'Pie chart view',
    icon: 'pie_chart',
    category: 'analytics',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'growth-trends',
    title: 'Growth Trends',
    description: 'Line graph view',
    icon: 'show_chart',
    category: 'analytics',
    defaultColSpan: 2,
    defaultRowSpan: 1,
  },
  // Sales
  {
    type: 'pipeline-summary',
    title: 'Pipeline Summary',
    description: 'Sales stages overview',
    icon: 'filter_alt',
    category: 'sales',
    defaultColSpan: 2,
    defaultRowSpan: 1,
  },
  {
    type: 'top-performers',
    title: 'Top Performers',
    description: 'Sales leaderboard',
    icon: 'leaderboard',
    category: 'sales',
    defaultColSpan: 1,
    defaultRowSpan: 2,
  },
  {
    type: 'conversion-rate',
    title: 'Conversion Rate',
    description: 'Progress indicator',
    icon: 'bolt',
    category: 'sales',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  // Operational
  {
    type: 'upcoming-tasks',
    title: 'Upcoming Tasks',
    description: 'Task checklist',
    icon: 'check_circle',
    category: 'operational',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'recent-activity',
    title: 'Recent Activity',
    description: 'Activity feed',
    icon: 'history',
    category: 'operational',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'upcoming-events',
    title: 'Upcoming Events',
    description: 'Calendar list',
    icon: 'calendar_month',
    category: 'operational',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'team-chat',
    title: 'Team Chat',
    description: 'Recent messages',
    icon: 'chat',
    category: 'operational',
    defaultColSpan: 1,
    defaultRowSpan: 1,
  },
  {
    type: 'pending-tasks',
    title: 'Pending Tasks',
    description: 'Task checklist',
    icon: 'checklist',
    category: 'operational',
    defaultColSpan: 1,
    defaultRowSpan: 2,
  },
];
