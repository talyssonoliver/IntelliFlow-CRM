'use client';

/**
 * RevenueTrendChart — extracted from analytics/(list)/page.tsx so the
 * heavy recharts import stays out of the page's main bundle chunk.
 * Page imports this via next/dynamic with ssr: false; the chart code
 * loads only after first paint, when the user is already on /analytics.
 *
 * Addresses Lighthouse #84 script-bundle audit (recharts is ~100KB
 * minified + ~30KB gzipped — extracting it from the page chunk and
 * loading lazily reduces initial bundle size for visitors who don't
 * land on /analytics first).
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface TimeSeriesEntry {
  periodLabel: string;
  value: number;
}

interface RevenueTrendChartProps {
  readonly timeSeries: readonly TimeSeriesEntry[];
  readonly formatCurrency: (value: number) => string;
}

export function RevenueTrendChart({ timeSeries, formatCurrency }: RevenueTrendChartProps) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...timeSeries]}
          margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="periodLabel"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value) => {
              const numValue = typeof value === 'number' ? value : 0;
              return formatCurrency(numValue);
            }}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              color: 'hsl(var(--foreground))',
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} className="fill-primary" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
