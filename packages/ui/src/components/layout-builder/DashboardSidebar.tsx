'use client';

import * as React from 'react';
import type { DashboardConfig } from './types';

interface DashboardSidebarProps {
  dashboards: DashboardConfig[];
  activeDashboardId?: string;
  onSelectDashboard?: (id: string) => void;
  configItems?: ConfigItem[];
  activeConfigId?: string;
  onSelectConfig?: (id: string) => void;
  footer?: React.ReactNode;
  className?: string;
}

interface ConfigItem {
  id: string;
  label: string;
  icon: string;
  href?: string;
}

export function DashboardSidebar({
  dashboards,
  activeDashboardId,
  onSelectDashboard,
  configItems = defaultConfigItems,
  activeConfigId,
  onSelectConfig,
  footer,
  className = '',
}: DashboardSidebarProps) {
  return (
    <aside className={`hidden lg:flex w-64 flex-col bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark flex-shrink-0 z-20 ${className}`}>
      <div className="flex flex-col flex-1 overflow-y-auto py-4">
        {/* My Dashboards Section */}
        <div className="px-4 mb-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 pl-2">
            My Dashboards
          </h3>
          <div className="flex flex-col gap-1">
            {dashboards.map((dashboard) => (
              <button
                key={dashboard.id}
                onClick={() => onSelectDashboard?.(dashboard.id)}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group text-left w-full
                  ${
                    activeDashboardId === dashboard.id
                      ? 'bg-ds-primary/10 text-ds-primary dark:bg-ds-primary/20'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }
                `}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    activeDashboardId === dashboard.id
                      ? 'text-ds-primary'
                      : 'text-slate-400 group-hover:text-ds-primary'
                  }`}
                >
                  {dashboard.icon}
                </span>
                <span className={`text-sm ${activeDashboardId === dashboard.id ? 'font-semibold' : 'font-medium'}`}>
                  {dashboard.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-6 my-3 h-px bg-border-light dark:bg-border-dark" />

        {/* Configuration Section */}
        <div className="px-4 mb-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 pl-2">
            Configuration
          </h3>
          <div className="flex flex-col gap-1">
            {configItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectConfig?.(item.id)}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group text-left w-full
                  ${
                    activeConfigId === item.id
                      ? 'bg-ds-primary/10 text-ds-primary dark:bg-ds-primary/20'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }
                `}
              >
                <span
                  className={`material-symbols-outlined text-[20px] ${
                    activeConfigId === item.id ? 'filled' : ''
                  } ${
                    activeConfigId === item.id
                      ? 'text-ds-primary'
                      : 'text-slate-400 group-hover:text-ds-primary'
                  }`}
                >
                  {item.icon}
                </span>
                <span className={`text-sm ${activeConfigId === item.id ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      {footer && (
        <div className="p-4 mt-auto border-t border-border-light dark:border-border-dark">
          {footer}
        </div>
      )}
    </aside>
  );
}

const defaultConfigItems: ConfigItem[] = [
  { id: 'layout', label: 'Layout & Widgets', icon: 'tune' },
  { id: 'theme', label: 'Theme Settings', icon: 'palette' },
  { id: 'sharing', label: 'Sharing', icon: 'share' },
];

// Default dashboards for demo
export const defaultDashboards: DashboardConfig[] = [
  { id: 'overview', name: 'Overview', icon: 'dashboard' },
  { id: 'sales', name: 'Sales Performance', icon: 'trending_up' },
  { id: 'marketing', name: 'Marketing', icon: 'campaign' },
];

// Pro plan upsell card for sidebar footer
export function ProPlanCard() {
  return (
    <div className="bg-background-light dark:bg-background-dark rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="material-symbols-outlined text-ds-primary">rocket_launch</span>
        <span className="text-sm font-bold text-slate-900 dark:text-white">Pro Plan</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">You have 14 days left in your trial.</p>
      <button className="w-full py-1.5 px-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-ds-primary transition-colors">
        Upgrade Now
      </button>
    </div>
  );
}
