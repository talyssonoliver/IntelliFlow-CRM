'use client';

/**
 * Compliance dashboard (PG-194).
 *
 * Every score, status, trend and detail line on this page comes from the `compliance` tRPC router,
 * which computes it from evidence in the firm's own data. Nothing here is typed in: a framework the
 * product cannot measure says "Not measured" and what it would need. A test fails if a literal
 * score appears in this file.
 */
import { useState } from 'react';
import { Card } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import {
  RiskHeatMap,
  ComplianceTimeline,
  ComplianceDetailPanel,
  ExportReportButton,
} from './components';
import {
  STATUS_LABEL,
  STATUS_STYLE,
  overallTrend,
  scoreText,
  trendDirection,
  trendText,
  type FrameworkView,
  type TrendView,
} from './components/compliance-view';

const TREND_ICON = {
  up: 'trending_up',
  down: 'trending_down',
  flat: 'remove',
  pending: 'schedule',
} as const;

const TREND_COLOR = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  flat: 'text-muted-foreground',
  pending: 'text-muted-foreground',
} as const;

function TrendLabel({ trend }: Readonly<{ trend: TrendView }>) {
  const direction = trendDirection(trend);
  return (
    <span className={`text-sm font-medium flex items-center ${TREND_COLOR[direction]}`}>
      <span className="material-symbols-outlined text-base mr-1">{TREND_ICON[direction]}</span>
      {trendText(trend)}
    </span>
  );
}

interface ComplianceCardProps {
  framework: FrameworkView;
  onSelect: (id: string) => void;
}

function ComplianceCard({ framework, onSelect }: Readonly<ComplianceCardProps>) {
  const style = STATUS_STYLE[framework.status];
  const { score } = framework;

  return (
    <Card
      className="relative p-6 h-full hover:shadow-md transition-shadow focus-within:ring-2 focus-within:ring-primary"
      data-testid={`framework-${framework.id}`}
    >
      <button
        type="button"
        aria-label={`${framework.title} details`}
        className="absolute inset-0 z-10 rounded-[inherit] cursor-pointer focus:outline-none"
        onClick={() => onSelect(framework.id)}
      />
      <div className="flex justify-between items-start gap-2 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 shrink-0 rounded-lg ${style.iconBg} ${style.iconColor} flex items-center justify-center`}
          >
            <span className="material-symbols-outlined">{framework.icon}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-foreground text-lg">{framework.title}</h3>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {framework.subtitle}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${style.badge} border`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {STATUS_LABEL[framework.status]}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <span className={`font-bold text-foreground ${score === null ? 'text-2xl' : 'text-4xl'}`}>
          {scoreText(score)}
        </span>
        <TrendLabel trend={framework.trend} />
      </div>

      <div className="w-full bg-muted rounded-full h-2.5 mb-3 overflow-hidden">
        {score !== null && (
          <div
            className={`${style.progress} h-2.5 rounded-full transition-all`}
            style={{ width: `${score}%` }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">{framework.scope}</p>

      <div className="grid grid-cols-2 gap-4 text-sm border-t border-border pt-4">
        {framework.details.map((detail) => (
          <div key={detail.label} className="min-w-0">
            <p className="text-muted-foreground mb-0.5">{detail.label}</p>
            <p className="font-semibold text-foreground">{detail.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface OverallScoreCardProps {
  overall: {
    score: number | null;
    measuredFrameworks: number;
    totalFrameworks: number;
    actionItems: number;
    notMeasuredControls: number;
  };
  trend: TrendView;
}

function OverallScoreCard({ overall, trend }: Readonly<OverallScoreCardProps>) {
  const direction = trendDirection(trend);
  return (
    <Card className="p-6 bg-slate-900 dark:bg-slate-800 border-slate-700 relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-white/10 text-white flex items-center justify-center backdrop-blur-sm">
            <span className="material-symbols-outlined">analytics</span>
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">Overall Score</h3>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Compliance Maturity
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center py-4">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
              <path
                className="text-slate-700"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              {overall.score !== null && (
                <path
                  className="text-primary"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={`${overall.score}, 100`}
                  strokeLinecap="round"
                  strokeWidth="3"
                  style={{ filter: 'drop-shadow(0 0 10px rgba(42, 120, 246, 0.5))' }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col text-center">
              <span
                className={`font-bold text-white ${overall.score === null ? 'text-sm' : 'text-3xl'}`}
              >
                {overall.score === null ? 'Not measured' : overall.score}
              </span>
              {overall.score !== null && <span className="text-xs text-slate-400">Score</span>}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">
          {overall.measuredFrameworks} of {overall.totalFrameworks} frameworks measured
        </p>

        <div className="grid grid-cols-2 gap-4 text-sm pt-4 mt-4 border-t border-white/10">
          <div className="text-center border-r border-white/10 px-1">
            <p className="text-slate-400 mb-0.5 text-xs">Trend</p>
            <p className="font-bold text-white flex items-center justify-center gap-1 text-xs">
              <span className="material-symbols-outlined text-slate-300 text-base">
                {TREND_ICON[direction]}
              </span>
              {trendText(trend)}
            </p>
          </div>
          <div className="text-center px-1">
            <p className="text-slate-400 mb-0.5 text-xs">Action Items</p>
            <p className="font-bold text-white">{overall.actionItems} to review</p>
          </div>
        </div>

        <ExportReportButton
          label="Download Full Report"
          className="w-full mt-5 whitespace-nowrap bg-white/10 hover:bg-white/20 text-white"
        />
      </div>
    </Card>
  );
}

function formatActivityTime(date: Date | string, timezone: string = 'Europe/London'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function CardsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8"
      aria-busy="true"
      aria-label="Loading compliance data"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="p-6 h-64 animate-pulse bg-muted/40" />
      ))}
    </div>
  );
}

export default function ComplianceDashboardPage() {
  const { timezone } = useTimezoneContext();
  const utils = trpc.useUtils();
  const [selectedStandard, setSelectedStandard] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: recentActivity = [] } = trpc.analytics.recentActivity.useQuery({ limit: 10 });
  const overviewQuery = trpc.compliance.overview.useQuery();
  const refresh = trpc.compliance.refresh.useMutation({
    onSuccess: async () => {
      await utils.compliance.overview.invalidate();
      await utils.compliance.history.invalidate();
    },
  });

  const overview = overviewQuery.data;
  const forbidden = errorCode(overviewQuery.error) === 'FORBIDDEN';
  const selected = overview?.frameworks.find((f) => f.id === selectedStandard) ?? null;

  const handleSelectStandard = (id: string) => {
    setSelectedStandard(id);
    setDetailOpen(true);
  };

  const renderCards = () => {
    if (forbidden) {
      return (
        <Card className="p-6 mb-8">
          <p className="text-foreground">
            Compliance figures are visible to administrators and managers.
          </p>
        </Card>
      );
    }
    if (overviewQuery.isError) {
      return (
        <Card className="p-6 mb-8 flex flex-wrap items-center justify-between gap-3" role="alert">
          <p className="text-foreground">The compliance figures could not be loaded.</p>
          <button
            type="button"
            onClick={() => overviewQuery.refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 whitespace-nowrap bg-card border border-border rounded-lg text-foreground text-sm font-semibold hover:bg-accent transition-colors"
          >
            <span className="material-symbols-outlined text-lg">refresh</span> Try again
          </button>
        </Card>
      );
    }
    if (!overview) return <CardsSkeleton />;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
        {overview.frameworks.map((framework) => (
          <ComplianceCard
            key={framework.id}
            framework={framework}
            onSelect={handleSelectStandard}
          />
        ))}
        <OverallScoreCard overall={overview.overall} trend={overallTrend(overview.frameworks)} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Compliance Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor adherence to international standards and internal policies.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Readiness checks on what this product can see in your firm. Not a certification or
              legal advice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending || forbidden}
              className="inline-flex items-center gap-2 px-4 py-2 whitespace-nowrap bg-card border border-border rounded-lg text-foreground text-sm font-semibold hover:bg-accent transition-colors shadow-sm disabled:opacity-60"
            >
              <span
                className={`material-symbols-outlined text-lg ${refresh.isPending ? 'animate-spin' : ''}`}
              >
                refresh
              </span>{' '}
              Refresh Data
            </button>
            <ExportReportButton className="whitespace-nowrap" />
          </div>
        </div>

        {/* Compliance Cards Grid */}
        {renderCards()}

        {/* Risk Heat Map & Timeline: the platform's own register and calendar, not per firm */}
        <p className="text-xs text-muted-foreground mb-3">
          The risk register and the compliance calendar below are platform-wide, not specific to
          your firm.
        </p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <RiskHeatMap />
          <ComplianceTimeline />
        </div>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-foreground text-lg">Recent Compliance Activity</h3>
            <button className="text-sm font-semibold text-primary hover:underline whitespace-nowrap">
              View All History
            </button>
          </div>
          <div className="space-y-6">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <div key={activity.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 my-1" />
                    {index < recentActivity.length - 1 && <div className="w-px h-full bg-border" />}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-semibold text-foreground">{activity.description}</p>
                    {activity.actorName && (
                      <p className="text-sm text-muted-foreground">by {activity.actorName}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatActivityTime(activity.createdAt, timezone)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
            )}
          </div>
        </Card>

        {/* Compliance Detail Panel (slide-out sheet) */}
        <ComplianceDetailPanel
          framework={selected}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        />
      </div>
    </div>
  );
}
