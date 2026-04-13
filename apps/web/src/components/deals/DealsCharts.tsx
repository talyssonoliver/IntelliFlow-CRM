'use client';

import { Card } from '@intelliflow/ui';
import {
  PieChart,
  Pie,
  Cell, // NOSONAR typescript:S1874
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface ChartEntry {
  name: string;
  value: number;
  color: string;
}

interface BarEntry {
  name: string;
  revenue: number;
  color: string;
}

interface DealsChartsProps {
  readonly pieChartData: ChartEntry[];
  readonly barChartData: BarEntry[];
}

export default function DealsCharts({ pieChartData, barChartData }: Readonly<DealsChartsProps>) {
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
      <Card className="p-4 sm:p-6 bg-card border-border">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">Deals by Stage</h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={pieChartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
              labelLine={false}
            >
              {pieChartData.map((entry) => (
                <Cell key={`pie-${entry.name}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        {/* SR-only data table for chart accessibility (AC-23) */}
        <table className="sr-only" aria-label="Deals by Stage data">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {pieChartData.map((entry) => (
              <tr key={`pie-sr-${entry.name}`}>
                <td>{entry.name}</td>
                <td>{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4 sm:p-6 bg-card border-border">
        <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">
          Revenue by Stage
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={barChartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              width={50}
            />
            <Tooltip
              formatter={(value) => {
                const numValue = typeof value === 'number' ? value : 0;
                return [`$${numValue.toLocaleString('en-GB')}`, 'Revenue'];
              }}
            />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
              {barChartData.map((entry) => (
                <Cell key={`bar-${entry.name}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* SR-only data table for chart accessibility (AC-23) */}
        <table className="sr-only" aria-label="Revenue by Stage data">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {barChartData.map((entry) => (
              <tr key={`bar-sr-${entry.name}`}>
                <td>{entry.name}</td>
                <td>${entry.revenue.toLocaleString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
