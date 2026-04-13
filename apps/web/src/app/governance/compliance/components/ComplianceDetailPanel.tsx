'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@intelliflow/ui';
import type {
  ComplianceDetailResponse,
  ControlStatus,
  HistoricalScore,
} from '@/app/api/compliance/types';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

const STATUS_CONFIG: Record<ControlStatus, { color: string; icon: string; label: string }> = {
  passed: {
    color: 'text-emerald-500',
    icon: 'check_circle',
    label: 'Passed',
  },
  failed: {
    color: 'text-red-500',
    icon: 'cancel',
    label: 'Failed',
  },
  in_progress: {
    color: 'text-amber-500',
    icon: 'pending',
    label: 'In Progress',
  },
  not_applicable: {
    color: 'text-muted-foreground',
    icon: 'remove_circle_outline',
    label: 'N/A',
  },
};

const STATUS_BADGE_CLASS: Record<'compliant' | 'critical' | 'attention', string> = {
  compliant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  attention: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

function getStatusBadgeClass(status: 'compliant' | 'critical' | 'attention'): string {
  return STATUS_BADGE_CLASS[status];
}

function getTrendColor(trend: number): string {
  if (trend > 0) return 'text-emerald-500';
  if (trend < 0) return 'text-red-500';
  return 'text-muted-foreground';
}

function getTrendIcon(trend: number): string {
  if (trend > 0) return 'trending_up';
  if (trend < 0) return 'trending_down';
  return 'remove';
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

function getScoreTextColor(score: number): string {
  if (score >= 90) return 'text-emerald-500';
  if (score >= 70) return 'text-amber-500';
  return 'text-red-500';
}

interface ChartPoint {
  x: number;
  y: number;
  score: number;
  date: string;
}

function buildChartPoints(scores: HistoricalScore[]): ChartPoint[] {
  const maxScore = 100;
  const minScore = 0;
  const chartHeight = 120;
  const chartWidth = 400;
  const padding = 20;
  return scores.map((score, index) => {
    const x = padding + (index * (chartWidth - padding * 2)) / (scores.length - 1);
    const y =
      chartHeight -
      padding -
      ((score.score - minScore) / (maxScore - minScore)) * (chartHeight - padding * 2);
    return { x, y, score: score.score, date: score.date };
  });
}

interface HistoryChartProps {
  scores: HistoricalScore[];
}

function HistoryChart({ scores }: Readonly<HistoryChartProps>) {
  const { timezone } = useTimezoneContext();
  if (!scores.length) return null;

  const chartHeight = 120;
  const chartWidth = 400;
  const padding = 20;
  const maxScore = 100;
  const minScore = 0;

  const points = buildChartPoints(scores);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-32"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y =
            chartHeight -
            padding -
            ((val - minScore) / (maxScore - minScore)) * (chartHeight - padding * 2);
          return (
            <g key={val}>
              <line
                x1={padding}
                y1={y}
                x2={chartWidth - padding}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text
                x={padding - 5}
                y={y + 4}
                className="fill-muted-foreground text-[8px]"
                textAnchor="end"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((p) => (
          <g key={p.date}>
            <circle cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" className="cursor-pointer" />
            <title>{`${p.date}: ${p.score}%`}</title>
          </g>
        ))}

        {/* X-axis labels */}
        {points.map((p) => (
          <text
            key={`label-${p.date}`}
            x={p.x}
            y={chartHeight - 5}
            className="fill-muted-foreground text-[7px]"
            textAnchor="middle"
          >
            {new Date(p.date).toLocaleDateString('en-GB', { month: 'short', timeZone: timezone })}
          </text>
        ))}
      </svg>
    </div>
  );
}

interface ComplianceDetailPanelProps {
  standardId: string | null;
  open: boolean;
  onClose: () => void;
}

export function ComplianceDetailPanel({
  standardId,
  open,
  onClose,
}: Readonly<ComplianceDetailPanelProps>) {
  const { timezone } = useTimezoneContext();
  const [detail, setDetail] = useState<ComplianceDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'controls' | 'history' | 'changes'>('controls');

  const fetchDetail = useCallback(async () => {
    if (!standardId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/compliance/${standardId}`);
      const result = await response.json();
      if (result.success) {
        setDetail(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch compliance detail:', error);
    } finally {
      setLoading(false);
    }
  }, [standardId]);

  useEffect(() => {
    if (standardId && open) {
      fetchDetail();
    }
  }, [standardId, open, fetchDetail]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setActiveTab('controls');
    }
  }, [open]);

  const controlStats = detail?.controls.reduce(
    (acc, control) => {
      acc[control.status]++;
      acc.total++;
      return acc;
    },
    { passed: 0, failed: 0, in_progress: 0, not_applicable: 0, total: 0 }
  );

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto">
        {(() => {
          if (loading)
            return (
              <>
                <SheetHeader className="sr-only">
                  <SheetTitle>Loading compliance details</SheetTitle>
                  <SheetDescription>Please wait while the compliance breakdown loads.</SheetDescription>
                </SheetHeader>
                <div className="flex items-center justify-center h-full">
                  <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
                    progress_activity
                  </span>
                </div>
              </>
            );
          if (detail)
            return (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <SheetTitle className="text-xl">{detail.standardName}</SheetTitle>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${getStatusBadgeClass(detail.status)}`}
                    >
                      {detail.status}
                    </span>
                  </div>
                  <SheetDescription>Compliance breakdown and historical data</SheetDescription>
                </SheetHeader>

                {/* Score Overview */}
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Compliance Score</p>
                      <p className="text-3xl font-bold text-foreground">{detail.score}%</p>
                    </div>
                    <div className={`flex items-center gap-1 ${getTrendColor(detail.trend)}`}>
                      <span className="material-symbols-outlined">
                        {getTrendIcon(detail.trend)}
                      </span>
                      <span className="text-sm font-medium">
                        {detail.trend > 0 ? '+' : ''}
                        {detail.trend}%
                      </span>
                    </div>
                  </div>

                  {/* Mini progress bar */}
                  <div className="mt-3 h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getScoreColor(detail.score)}`}
                      style={{ width: `${detail.score}%` }}
                    />
                  </div>

                  {/* Key dates */}
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    {detail.nextAuditDate && (
                      <div>
                        <p className="text-muted-foreground">Next Audit</p>
                        <p className="font-medium text-foreground">
                          {new Date(detail.nextAuditDate).toLocaleDateString('en-GB', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: timezone,
                          })}
                        </p>
                      </div>
                    )}
                    {detail.certificationExpiry && (
                      <div>
                        <p className="text-muted-foreground">Cert. Expiry</p>
                        <p className="font-medium text-foreground">
                          {new Date(detail.certificationExpiry).toLocaleDateString('en-GB', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            timeZone: timezone,
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-6 border-b border-border">
                  <div className="flex gap-4">
                    {(['controls', 'history', 'changes'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                          activeTab === tab
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content */}
                <div className="mt-4">
                  {activeTab === 'controls' && (
                    <>
                      {/* Control Stats */}
                      {controlStats && (
                        <div className="grid grid-cols-4 gap-2 mb-4">
                          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                            <div key={status} className="text-center p-2 bg-muted rounded-lg">
                              <span className={`material-symbols-outlined text-lg ${config.color}`}>
                                {config.icon}
                              </span>
                              <p className="text-lg font-bold text-foreground">
                                {controlStats[status as ControlStatus]}
                              </p>
                              <p className="text-xs text-muted-foreground">{config.label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Controls List */}
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {detail.controls.map((control) => {
                          const statusConfig = STATUS_CONFIG[control.status];
                          return (
                            <div
                              key={control.id}
                              className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                            >
                              <span className={`material-symbols-outlined ${statusConfig.color}`}>
                                {statusConfig.icon}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                  {control.id}: {control.name}
                                </p>
                                {control.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {control.notes}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Last assessed:{' '}
                                  {new Date(control.lastAssessed).toLocaleDateString('en-GB', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    timeZone: timezone,
                                  })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {activeTab === 'history' && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Score trend over the last 6 months
                      </p>
                      <HistoryChart scores={detail.historicalScores} />
                      <div className="mt-4 space-y-2">
                        {detail.historicalScores
                          .slice()
                          .reverse()
                          .map((score) => (
                            <div
                              key={score.date}
                              className="flex items-center justify-between py-2 border-b border-border last:border-0"
                            >
                              <span className="text-sm text-muted-foreground">
                                {new Date(score.date).toLocaleDateString('en-GB', {
                                  month: 'long',
                                  year: 'numeric',
                                  timeZone: timezone,
                                })}
                              </span>
                              <span
                                className={`text-sm font-bold ${getScoreTextColor(score.score)}`}
                              >
                                {score.score}%
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'changes' && (
                    <div className="space-y-4">
                      {detail.recentChanges.map((change, index) => (
                        <div key={`${change.date}-${change.action}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                            {index < detail.recentChanges.length - 1 && (
                              <div className="w-px h-full bg-border" />
                            )}
                          </div>
                          <div className="pb-4">
                            <p className="text-sm font-medium text-foreground">{change.action}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(change.date).toLocaleDateString('en-GB', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                timeZone: timezone,
                              })}{' '}
                              • {change.user}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            );
          return (
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>Compliance details</SheetTitle>
                <SheetDescription>Select a compliance standard to view details.</SheetDescription>
              </SheetHeader>
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select a compliance standard to view details
              </div>
            </>
          );
        })()}
      </SheetContent>
    </Sheet>
  );
}
