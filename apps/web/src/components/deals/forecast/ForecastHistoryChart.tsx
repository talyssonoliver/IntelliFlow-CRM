/**
 * ForecastHistoryChart (PG-131)
 *
 * Inner recharts component, loaded via dynamic import (SSR disabled).
 * Separated for proper code-splitting.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { HistoryPoint, ForecastMode } from './types';

// =============================================================================
// Tooltip Sub-Component (extracted to avoid S6478: inner component definition)
// =============================================================================

interface ForecastTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
}

function ForecastTooltip({ active, payload }: ForecastTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as HistoryPoint;
  return (
    <div className="bg-popover text-popover-foreground p-2 rounded-md border shadow-sm text-xs">
      <p className="font-medium">{point.date}</p>
      <p>{point.probability}%</p>
      {point.event && <p className="text-muted-foreground">{point.event}</p>}
      {point.isProjected && <p className="italic">Projected</p>}
    </div>
  );
}

interface ForecastHistoryChartProps {
  data: HistoryPoint[];
  mode: ForecastMode;
}

export default function ForecastHistoryChart({ data, mode }: Readonly<ForecastHistoryChartProps>) {
  const yLabel = mode === 'portfolio' ? 'Win Rate (%)' : 'Probability (%)';

  return (
    <div className="h-64" data-testid="history-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12 }}
            label={{ value: yLabel, angle: -90, position: 'insideLeft' }}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Tooltip content={ForecastTooltip as any} />
          {mode === 'deal' && (
            <ReferenceLine y={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
          )}
          <Line
            type={mode === 'deal' ? 'stepAfter' : 'monotone'}
            dataKey="probability"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
