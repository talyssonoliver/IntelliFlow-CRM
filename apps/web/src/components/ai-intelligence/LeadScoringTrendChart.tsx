'use client';

/**
 * LeadScoringTrendChart — Line + area chart for lead scoring trends (PG-148)
 *
 * Lazy-loadable via dynamic import (default export).
 */

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { EmptyState } from '@intelliflow/ui';
import type { ScoreTrendPoint } from '@/lib/lead-scoring/types';

interface LeadScoringTrendChartProps {
  trends: ScoreTrendPoint[];
}

function LeadScoringTrendChart({ trends }: Readonly<LeadScoringTrendChartProps>) {
  if (trends.length === 0) {
    return (
      <div data-testid="no-trends">
        <EmptyState entity="insights" phase="passive" className="py-4" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={trends}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 12 }} domain={[0, 100]} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="avgScore"
          stroke="#6366f1"
          strokeWidth={2}
          dot={false}
          name="Avg Score"
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="hot"
          stackId="1"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.6}
          name="Hot"
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="warm"
          stackId="1"
          stroke="#f97316"
          fill="#f97316"
          fillOpacity={0.6}
          name="Warm"
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey="cold"
          stackId="1"
          stroke="#94a3b8"
          fill="#94a3b8"
          fillOpacity={0.6}
          name="Cold"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export default LeadScoringTrendChart;
