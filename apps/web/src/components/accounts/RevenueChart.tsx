'use client';

import { useMemo } from 'react';
import { Card } from '@intelliflow/ui';
import { formatCurrency } from '@/lib/pricing/calculator';

interface OpportunityForChart {
  value: number;
  expectedCloseDate: string;
  stage: string;
}

interface MonthlyBucket {
  month: string;
  value: number;
}

export function transformPipelineData(opps: OpportunityForChart[]): MonthlyBucket[] {
  if (!opps || opps.length === 0) return [];

  const buckets: Record<string, number> = {};

  for (const opp of opps) {
    if (!opp.expectedCloseDate) continue;
    const d = new Date(opp.expectedCloseDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = (buckets[key] ?? 0) + opp.value;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }));
}

const STAGE_COLORS: Record<string, string> = {
  PROSPECTING: 'bg-blue-400',
  QUALIFICATION: 'bg-cyan-400',
  PROPOSAL: 'bg-amber-400',
  NEGOTIATION: 'bg-orange-400',
  CLOSED_WON: 'bg-emerald-500',
  CLOSED_LOST: 'bg-red-400',
};

interface RevenueChartProps {
  accountId: string;
  stageBreakdown?: Record<string, number>;
  opportunities?: OpportunityForChart[];
}

export function RevenueChart({ stageBreakdown, opportunities }: RevenueChartProps) {
  const monthlyData = useMemo(
    () => transformPipelineData(opportunities ?? []),
    [opportunities]
  );

  const hasStageData = stageBreakdown && Object.keys(stageBreakdown).length > 0;
  const hasMonthlyData = monthlyData.length > 0;

  if (!hasStageData && !hasMonthlyData) {
    return (
      <div className="text-center py-12">
        <span className="material-symbols-outlined text-4xl text-muted-foreground mb-3">bar_chart</span>
        <p className="text-muted-foreground">No opportunity data available for charting</p>
      </div>
    );
  }

  const totalValue = hasStageData
    ? Object.values(stageBreakdown!).reduce((sum, v) => sum + v, 0)
    : 0;

  return (
    <div className="space-y-6">
      {hasStageData && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Pipeline by Stage</h3>
          <div className="flex h-8 rounded-lg overflow-hidden bg-muted">
            {Object.entries(stageBreakdown!).map(([stage, value]) => {
              const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
              if (pct < 1) return null;
              return (
                <div
                  key={stage}
                  className={`${STAGE_COLORS[stage] ?? 'bg-slate-400'} relative group`}
                  style={{ width: `${pct}%` }}
                  title={`${stage.replace(/_/g, ' ')}: ${formatCurrency(value)}`}
                >
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-medium text-white drop-shadow">
                      {Math.round(pct)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {Object.entries(stageBreakdown!).map(([stage, value]) => (
              <div key={stage} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${STAGE_COLORS[stage] ?? 'bg-slate-400'}`} />
                <span>{stage.replace(/_/g, ' ')}</span>
                <span className="font-medium text-foreground">{formatCurrency(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {hasMonthlyData && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Pipeline Trend</h3>
          <div className="flex items-end gap-1 h-40">
            {(() => {
              const maxVal = Math.max(...monthlyData.map((d) => d.value));
              return monthlyData.map((bucket) => {
                const heightPct = maxVal > 0 ? (bucket.value / maxVal) * 100 : 0;
                return (
                  <div key={bucket.month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary/80 rounded-t hover:bg-primary transition-colors relative group"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                        {formatCurrency(bucket.value)}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{bucket.month.slice(5)}</span>
                  </div>
                );
              });
            })()}
          </div>
        </Card>
      )}
    </div>
  );
}
