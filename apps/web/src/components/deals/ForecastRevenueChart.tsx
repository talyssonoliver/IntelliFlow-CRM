'use client';

import { Card } from '@intelliflow/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MonthlyProjection {
  month: string;
  actual: number | null;
  projected: number | null;
}

interface ForecastRevenueChartProps {
  readonly data: MonthlyProjection[];
  readonly formatCurrency: (value: number) => string;
  readonly formatFullCurrency: (value: number) => string;
}

export default function ForecastRevenueChart({
  data,
  formatCurrency,
  formatFullCurrency,
}: Readonly<ForecastRevenueChartProps>) {
  const chartData = data.map((d) => ({
    month: d.month,
    actual: d.actual,
    projected: d.projected,
  }));

  return (
    <Card className="p-6 h-96">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revenue Projection</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-xs text-slate-500 font-medium">Actual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className="text-xs text-slate-500 font-medium">Projected</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={chartData} barGap={0}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(value) => formatCurrency(value)}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => {
              const numValue = typeof value === 'number' ? value : null;
              return numValue ? formatFullCurrency(numValue) : 'N/A';
            }}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          />
          <Bar dataKey="actual" fill="#137fec" radius={[4, 4, 0, 0]} />
          <Bar dataKey="projected" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
