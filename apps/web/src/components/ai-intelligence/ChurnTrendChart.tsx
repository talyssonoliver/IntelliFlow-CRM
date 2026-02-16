'use client';

/**
 * ChurnTrendChart — Stacked area chart for churn risk trends (PG-143)
 *
 * Lazy-loadable via dynamic import (default export).
 */

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import type { ChurnTrendPoint } from '@/lib/churn-risk/types';

interface ChurnTrendChartProps {
  trends: ChurnTrendPoint[];
}

function ChurnTrendChart({ trends }: ChurnTrendChartProps) {
  if (trends.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8" data-testid="no-trends">
        No trend data available
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={trends}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Area
          type="monotone"
          dataKey="critical"
          stackId="1"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.6}
          name="Critical"
        />
        <Area
          type="monotone"
          dataKey="high"
          stackId="1"
          stroke="#f97316"
          fill="#f97316"
          fillOpacity={0.6}
          name="High"
        />
        <Area
          type="monotone"
          dataKey="medium"
          stackId="1"
          stroke="#f59e0b"
          fill="#f59e0b"
          fillOpacity={0.6}
          name="Medium"
        />
        <Area
          type="monotone"
          dataKey="low"
          stackId="1"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.6}
          name="Low"
        />
        <Area
          type="monotone"
          dataKey="minimal"
          stackId="1"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.6}
          name="Minimal"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default ChurnTrendChart;
