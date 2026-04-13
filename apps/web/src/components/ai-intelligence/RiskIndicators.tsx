'use client';

/**
 * RiskIndicators — Horizontal progress bars for churn risk distribution (PG-143)
 */

import { Card, CardContent, CardHeader, CardTitle } from '@intelliflow/ui';
import { CHURN_RISK_LEVELS } from '@intelliflow/domain';
import { getRiskBadgeClass } from '@/lib/churn-risk/churn-utils';

interface RiskIndicatorsProps {
  distribution: Record<string, number>;
  total: number;
}

const LEVEL_COLORS: Record<string, string> = {
  CRITICAL: 'bg-destructive',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-primary',
  MINIMAL: 'bg-success',
};

export function RiskIndicators({ distribution, total }: Readonly<RiskIndicatorsProps>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Risk Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {CHURN_RISK_LEVELS.map((level) => {
          const count = distribution[level] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;

          return (
            <div key={level} className="flex items-center gap-3">
              <span
                className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium w-20 ${getRiskBadgeClass(level)}`}
              >
                {level}
              </span>
              <span
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${level}: ${pct}%`}
                className="flex-1 h-2 rounded-full bg-muted overflow-hidden block"
              >
                <span
                  className={`h-full rounded-full transition-all block ${LEVEL_COLORS[level] ?? 'bg-slate-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-xs text-muted-foreground w-16 text-right">
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
