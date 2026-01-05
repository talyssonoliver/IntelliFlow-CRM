'use client';

import type { WidgetProps } from './index';

export function ActiveLeadsWidget(_props: WidgetProps) {
  return (
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-chart-3/10 flex items-center justify-center text-chart-3">
          <span className="material-symbols-outlined text-lg">person</span>
        </div>
        <h3 className="font-medium text-foreground">Active Leads</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground">1,240</div>
        <div className="text-xs text-muted-foreground mt-1">vs 1,100 last month</div>
      </div>
    </div>
  );
}
