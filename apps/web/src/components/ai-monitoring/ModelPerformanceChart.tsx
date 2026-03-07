'use client';

/**
 * ModelPerformanceChart — Drift score trend over time (PG-146)
 * Pattern: apps/web/src/components/ai-intelligence/ChurnTrendChart.tsx (lazy-loaded Recharts)
 */

import { Card, CardContent, CardHeader, CardTitle } from '@intelliflow/ui';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { DriftHistoryItem } from '@/lib/ai-monitoring/types';

interface ModelPerformanceChartProps {
  history: DriftHistoryItem[];
}

function formatDate(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ModelPerformanceChart({ history }: Readonly<ModelPerformanceChartProps>) {
  const chartData = [...history]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((h) => ({
      time: formatDate(h.timestamp),
      score: h.driftScore,
      metric: h.metric,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Model Performance</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8" data-testid="no-chart-data">
            No performance data available
          </p>
        ) : (
          <div className="h-[200px]" data-testid="performance-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <ReferenceLine y={0.1} stroke="#3b82f6" strokeDasharray="3 3" label="Low" />
                <ReferenceLine y={0.25} stroke="#f59e0b" strokeDasharray="3 3" label="Medium" />
                <ReferenceLine y={0.5} stroke="#f97316" strokeDasharray="3 3" label="High" />
                <ReferenceLine y={0.75} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
