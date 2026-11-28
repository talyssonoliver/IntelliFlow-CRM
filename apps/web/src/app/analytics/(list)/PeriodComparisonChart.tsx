'use client';

/**
 * Booked revenue over time against the previous period (owner 26/11, Analytics mockup: "Booked
 * revenue over time · Period comparison"). The current period is a solid line with a soft area;
 * the previous period of the same length is a dashed grey line, aligned by bucket position
 * (first day/week with first day/week). Loaded lazily by the page (recharts is heavy).
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface PeriodPoint {
  label: string;
  /** Null where this period has no bucket at that position (the previous period was longer). */
  current: number | null;
  previous: number | null;
}

export function PeriodComparisonChart({
  data,
  formatMoney,
}: Readonly<{ data: PeriodPoint[]; formatMoney: (value: number) => string }>) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="analytics-current-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a78f6" stopOpacity={0.17} />
            <stop offset="1" stopColor="#2a78f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#e9eef5" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => formatMoney(v)}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          formatter={(value, name) => [
            typeof value === 'number' ? formatMoney(value) : '—',
            name === 'current' ? 'This period' : 'Previous period',
          ]}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="current"
          stroke="none"
          fill="url(#analytics-current-area)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="previous"
          stroke="#a8b6cc"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="current"
          stroke="#2a78f6"
          strokeWidth={3}
          dot={{ r: 3.5, fill: 'white', stroke: '#2a78f6', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
