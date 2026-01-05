'use client';

import { trpc } from '@/lib/trpc';
import type { WidgetProps } from './index';

interface GrowthTrendData {
  value: number;
  month: string;
  yoyChange?: number;
}

export function GrowthTrendsWidget(_props: WidgetProps) {
  const { data: trendData, isLoading } = trpc.analytics.growthTrends.useQuery({
    metric: 'revenue',
    months: 12,
  });

  if (isLoading) {
    return (
      <div className="p-5 h-full flex flex-col animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="h-6 w-20 rounded bg-muted" />
        </div>
        <div className="flex-1 min-h-[120px] rounded bg-muted" />
        <div className="flex justify-between mt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-3 w-8 rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!trendData || trendData.length === 0) {
    return null;
  }

  const dataPoints = trendData.map((d: GrowthTrendData) => d.value);
  const months = trendData.map((d: GrowthTrendData) => d.month);
  const yoyChange = trendData[trendData.length - 1]?.yoyChange || 0;

  return (
    <div className="p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <span className="material-symbols-outlined text-muted-foreground">show_chart</span>
          Growth Trends
        </h3>
        {yoyChange !== 0 && (
          <span className={`text-xs font-medium flex items-center px-1.5 py-0.5 rounded ${
            yoyChange >= 0
              ? 'text-success bg-success-muted'
              : 'text-destructive bg-destructive-muted'
          }`}>
            {yoyChange >= 0 ? '+' : ''}{yoyChange}% YoY
          </span>
        )}
      </div>

      {/* Simple line chart visualization */}
      <div className="flex-1 flex items-end gap-1 min-h-[120px]">
        <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1="25" x2="300" y2="25" stroke="currentColor" className="text-border" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="300" y2="50" stroke="currentColor" className="text-border" strokeWidth="0.5" />
          <line x1="0" y1="75" x2="300" y2="75" stroke="currentColor" className="text-border" strokeWidth="0.5" />

          {/* Area fill */}
          <path
            d={`M0,${100 - dataPoints[0]} ${dataPoints.map((p: number, i: number) => `L${(i / (dataPoints.length - 1)) * 300},${100 - p}`).join(' ')} L300,100 L0,100 Z`}
            fill="url(#gradient)"
            opacity="0.2"
          />

          {/* Line */}
          <path
            d={`M0,${100 - dataPoints[0]} ${dataPoints.map((p: number, i: number) => `L${(i / (dataPoints.length - 1)) * 300},${100 - p}`).join(' ')}`}
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
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        {months.filter((_: string, i: number) => i % 3 === 0).map((month: string) => (
          <span key={month}>{month}</span>
        ))}
      </div>
    </div>
  );
}
