'use client';

import type { WidgetProps } from './index';

export function GrowthTrendsWidget(_props: WidgetProps) {
  // Sample data points for the line chart (normalized 0-100)
  const dataPoints = [20, 35, 28, 45, 42, 55, 48, 62, 58, 72, 68, 85];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-400">show_chart</span>
          Growth Trends
        </h3>
        <span className="text-xs font-medium text-emerald-500 flex items-center bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
          +24.5% YoY
        </span>
      </div>

      {/* Simple line chart visualization */}
      <div className="flex-1 flex items-end gap-1 min-h-[120px]">
        <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1="25" x2="300" y2="25" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="300" y2="50" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="0.5" />
          <line x1="0" y1="75" x2="300" y2="75" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="0.5" />

          {/* Area fill */}
          <path
            d={`M0,${100 - dataPoints[0]} ${dataPoints.map((p, i) => `L${(i / (dataPoints.length - 1)) * 300},${100 - p}`).join(' ')} L300,100 L0,100 Z`}
            fill="url(#gradient)"
            opacity="0.2"
          />

          {/* Line */}
          <path
            d={`M0,${100 - dataPoints[0]} ${dataPoints.map((p, i) => `L${(i / (dataPoints.length - 1)) * 300},${100 - p}`).join(' ')}`}
            fill="none"
            stroke="#137fec"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#137fec" />
              <stop offset="100%" stopColor="#137fec" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-slate-400">
        {months.filter((_, i) => i % 3 === 0).map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
    </div>
  );
}
