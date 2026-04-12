'use client';

/**
 * NPS Trend Chart Component - IFC-068
 *
 * Line chart showing NPS/CSAT/CES trends over time using Recharts.
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { EmptyState } from '@intelliflow/ui';
import type { NpsTrendChartProps } from '@/lib/feedback-survey/types';

export default function NpsTrendChart({ trends, granularity }: Readonly<NpsTrendChartProps>) {
  if (trends.length === 0) {
    return <EmptyState entity="insights" phase="passive" className="py-4" />;
  }

  const data = trends.map((t) => ({
    period: t.period,
    NPS: t.nps,
    CSAT: t.csat,
    CES: t.ces,
    Responses: t.responseCount,
  }));

  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        Score Trends ({granularity})
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="NPS" stroke="#2563eb" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="CSAT" stroke="#16a34a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="CES" stroke="#9333ea" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
