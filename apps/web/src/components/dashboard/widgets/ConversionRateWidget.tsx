'use client';

import type { WidgetProps } from './index';

export function ConversionRateWidget(_props: WidgetProps) {
  const conversionRate = 3.2;
  const progress = 65;

  return (
    <div className="p-5 flex flex-col justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-warning-muted flex items-center justify-center text-warning">
          <span className="material-symbols-outlined text-lg">bolt</span>
        </div>
        <h3 className="font-medium text-foreground">Conversion Rate</h3>
      </div>
      <div>
        <div className="text-3xl font-bold text-foreground">{conversionRate}%</div>
        <div className="w-full bg-muted h-1.5 rounded-full mt-2 overflow-hidden">
          <div
            className="bg-warning h-full rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
