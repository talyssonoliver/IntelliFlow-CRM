'use client';

/**
 * SentimentTrend — Area chart showing sentiment distribution over time (PG-142)
 *
 * Lazy-loaded via React.lazy() from SentimentDashboard for bundle optimization.
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import type { SentimentTrendPoint } from '@/lib/sentiment/types';

interface SentimentTrendProps {
  trends: SentimentTrendPoint[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SentimentTrend({ trends }: SentimentTrendProps) {
  if (!trends.length) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No trend data available
      </div>
    );
  }

  const chartData = trends.map((t) => ({
    ...t,
    dateLabel: formatDate(t.date),
  }));

  return (
    <div aria-label="Sentiment trend chart" role="img" className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="currentColor"
            className="text-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-popover, #fff)',
              border: '1px solid var(--color-border, #e5e7eb)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Area
            type="monotone"
            dataKey="positive"
            name="Positive"
            stackId="1"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="neutral"
            name="Neutral"
            stackId="1"
            stroke="#94a3b8"
            fill="#94a3b8"
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="negative"
            name="Negative"
            stackId="1"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
