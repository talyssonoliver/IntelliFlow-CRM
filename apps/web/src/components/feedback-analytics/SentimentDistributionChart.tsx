'use client';

/**
 * Sentiment Distribution Chart Component - IFC-068
 *
 * Pie chart showing positive/neutral/negative sentiment breakdown.
 */

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import type { SentimentDistributionChartProps } from '@/lib/feedback-survey/types';

const COLORS = {
  Positive: '#16a34a',
  Neutral: '#ca8a04',
  Negative: '#dc2626',
};

export default function SentimentDistributionChart({ sentiment }: SentimentDistributionChartProps) {
  if (sentiment.total === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">No sentiment data available</p>
      </div>
    );
  }

  const data = [
    { name: 'Positive', value: sentiment.positive },
    { name: 'Neutral', value: sentiment.neutral },
    { name: 'Negative', value: sentiment.negative },
  ].filter((d) => d.value > 0);

  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">Sentiment Distribution</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            label={({ name, percent }: { name?: string; percent?: number }) =>
              `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
            }
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
