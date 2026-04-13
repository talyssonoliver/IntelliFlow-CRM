'use client';

/**
 * LatencyTrendChart — Latency trend line chart (PG-153)
 *
 * Lazy-loaded. Shows p50/p95/p99 latency over time with SLO reference lines.
 * Singleton process isolation: data may be empty in multi-process deployments.
 *
 * Pattern: apps/web/src/components/ai-monitoring/ModelPerformanceChart.tsx
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@intelliflow/ui';
import type { LatencyTrendPoint } from '@/lib/ai-monitoring/types';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface LatencyTrendChartProps {
  trend: LatencyTrendPoint[];
  p95Target: number;
  p99Target: number;
}

export default function LatencyTrendChart({
  trend,
  p95Target,
  p99Target,
}: Readonly<LatencyTrendChartProps>) {
  const { timezone } = useTimezoneContext();
  if (trend.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Latency Trend</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div data-testid="empty-trend">
            <EmptyState entity="insights" phase="passive" className="py-4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Latency Trend</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[280px]" data-testid="trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <XAxis dataKey="timestamp" tickFormatter={formatTime} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip
                labelFormatter={(ts) =>
                  new Date(ts as string).toLocaleTimeString('en-GB', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: timezone,
                  })
                }
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                name="P50"
              />
              <Line
                type="monotone"
                dataKey="p95"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                name="P95"
              />
              <Line
                type="monotone"
                dataKey="p99"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                name="P99"
              />
              {p95Target > 0 && (
                <ReferenceLine
                  y={p95Target}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  label={{ value: 'P95 SLO', fontSize: 10 }}
                />
              )}
              {p99Target > 0 && (
                <ReferenceLine
                  y={p99Target}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{ value: 'P99 SLO', fontSize: 10 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
