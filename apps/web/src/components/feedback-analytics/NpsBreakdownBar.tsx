'use client';

/**
 * NPS Breakdown Bar Chart Component - IFC-068
 *
 * Bar chart showing promoters/passives/detractors count.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { NpsBreakdownBarProps } from '@/lib/feedback-survey/types';

const CATEGORY_COLORS: Record<string, string> = {
  Promoters: '#16a34a',
  Passives: '#ca8a04',
  Detractors: '#dc2626',
};

export default function NpsBreakdownBar({ distribution }: Readonly<NpsBreakdownBarProps>) {
  if (distribution.total === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">No NPS data available</p>
      </div>
    );
  }

  const data = [
    { category: 'Promoters', count: distribution.promoters },
    { category: 'Passives', count: distribution.passives },
    { category: 'Detractors', count: distribution.detractors },
  ];

  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">NPS Breakdown</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
