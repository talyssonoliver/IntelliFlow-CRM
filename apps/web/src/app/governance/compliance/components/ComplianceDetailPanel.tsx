'use client';

/**
 * Compliance detail panel (PG-194): one framework's controls with the evidence behind each, a link
 * to where to act, and its stored daily history. Controls come from the `compliance.overview`
 * router response the page already holds; history comes from `compliance.history`. A control the
 * product cannot measure says so and what it would need. Nothing is typed in.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  CONTROL_STATE,
  STATUS_LABEL,
  STATUS_STYLE,
  scoreText,
  trendDirection,
  trendText,
  type ControlState,
  type FrameworkView,
} from './compliance-view';

interface HistoryPoint {
  day: string;
  score: number | null;
  passing: number;
  attention: number;
  notMeasured: number;
}

const CHART = { width: 400, height: 120, padding: 20 } as const;

/** Points for the stored days that have a score. Needs two or more to draw a line. */
export function buildChartPoints(points: HistoryPoint[]) {
  const scored = points.filter((p) => p.score !== null);
  if (scored.length < 2) return [];
  const { width, height, padding } = CHART;
  return scored.map((p, index) => ({
    x: padding + (index * (width - padding * 2)) / (scored.length - 1),
    y: height - padding - ((p.score ?? 0) / 100) * (height - padding * 2),
    score: p.score ?? 0,
    day: p.day,
  }));
}

/** Days on which a framework's measured controls changed from the day before. */
export function describeChanges(points: HistoryPoint[]) {
  const changes: { day: string; text: string }[] = [];
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1]!;
    const after = points[i]!;
    if (before.passing === after.passing && before.attention === after.attention) continue;
    changes.push({
      day: after.day,
      text: `Passing ${before.passing} to ${after.passing}, needing attention ${before.attention} to ${after.attention}.`,
    });
  }
  return changes.reverse();
}

function HistoryChart({ points }: Readonly<{ points: HistoryPoint[] }>) {
  const chart = buildChartPoints(points);
  if (chart.length === 0) return null;
  const { width, height, padding } = CHART;
  const pathD = chart.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-32 mt-4"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>Score by day</title>
      {[0, 25, 50, 75, 100].map((val) => {
        const y = height - padding - (val / 100) * (height - padding * 2);
        return (
          <g key={val}>
            <line
              x1={padding}
              y1={y}
              x2={width - padding}
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
      <path
        d={pathD}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {chart.map((p) => (
        <g key={p.day}>
          <circle cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" />
          <title>{`${p.day}: ${p.score}%`}</title>
          <text
            x={p.x}
            y={height - 5}
            className="fill-muted-foreground text-[7px]"
            textAnchor="middle"
          >
            {new Date(p.day).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC', // a stored day is a calendar date, not an instant
            })}
          </text>
        </g>
      ))}
    </svg>
  );
}

const STATE_ORDER: ControlState[] = ['pass', 'attention', 'not_measured'];

interface ComplianceDetailPanelProps {
  framework: FrameworkView | null;
  open: boolean;
  onClose: () => void;
}

type Tab = 'controls' | 'history' | 'changes';

export function ComplianceDetailPanel({
  framework,
  open,
  onClose,
}: Readonly<ComplianceDetailPanelProps>) {
  const [activeTab, setActiveTab] = useState<Tab>('controls');
  const historyQuery = trpc.compliance.history.useQuery(
    { frameworkId: framework?.id ?? 'gdpr' },
    { enabled: open && framework !== null }
  );
  const points = historyQuery.data?.points ?? [];

  const formatDay = (day: string) =>
    new Date(day).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC', // a stored day is a calendar date, not an instant
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setActiveTab('controls');
          onClose();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto">
        {framework ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-3">
                <SheetTitle className="text-xl">{framework.title}</SheetTitle>
                <span
                  className={`px-2.5 py-0.5 text-xs font-medium rounded-full whitespace-nowrap border ${STATUS_STYLE[framework.status].badge}`}
                >
                  {STATUS_LABEL[framework.status]}
                </span>
              </div>
              <SheetDescription>{framework.scope}</SheetDescription>
            </SheetHeader>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Compliance Score</p>
                  <p
                    className={`font-bold text-foreground ${framework.score === null ? 'text-xl' : 'text-3xl'}`}
                  >
                    {scoreText(framework.score)}
                  </p>
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {trendDirection(framework.trend) === 'pending' ? (
                    <span className="material-symbols-outlined align-middle text-base mr-1">
                      schedule
                    </span>
                  ) : null}
                  {trendText(framework.trend)}
                </p>
              </div>
              {framework.score !== null && (
                <div className="mt-3 h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_STYLE[framework.status].progress}`}
                    style={{ width: `${framework.score}%` }}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 border-b border-border">
              <div className="flex gap-4">
                {(['controls', 'history', 'changes'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
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

            <div className="mt-4">
              {activeTab === 'controls' && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {STATE_ORDER.map((state) => (
                      <div key={state} className="text-center p-2 bg-muted rounded-lg">
                        <span
                          className={`material-symbols-outlined text-lg ${CONTROL_STATE[state].color}`}
                        >
                          {CONTROL_STATE[state].icon}
                        </span>
                        <p className="text-lg font-bold text-foreground">
                          {framework.controls.filter((c) => c.state === state).length}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {CONTROL_STATE[state].label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <ul className="space-y-2">
                    {framework.controls.map((control) => {
                      const cfg = CONTROL_STATE[control.state];
                      return (
                        <li
                          key={control.id}
                          className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                        >
                          <span className={`material-symbols-outlined ${cfg.color}`}>
                            {cfg.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{control.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">{control.evidence}</p>
                            {control.needed && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Needed to measure: {control.needed}
                              </p>
                            )}
                            {control.actionHref && (
                              <Link
                                href={control.actionHref}
                                className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                              >
                                {control.actionLabel ?? 'Open'}
                                <span className="material-symbols-outlined text-sm">
                                  arrow_forward
                                </span>
                              </Link>
                            )}
                          </div>
                          <span className="sr-only">{cfg.label}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {activeTab === 'history' && (
                <div>
                  {historyQuery.isLoading && (
                    <p className="text-sm text-muted-foreground">Loading history</p>
                  )}
                  {!historyQuery.isLoading && points.filter((p) => p.score !== null).length < 2 && (
                    <p className="text-sm text-muted-foreground">
                      Trend starts tomorrow. A point is stored each day, so the line appears once
                      two days exist.
                    </p>
                  )}
                  <HistoryChart points={points} />
                  <div className="mt-4 space-y-2">
                    {points
                      .slice()
                      .reverse()
                      .map((p) => (
                        <div
                          key={p.day}
                          className="flex items-center justify-between py-2 border-b border-border last:border-0"
                        >
                          <span className="text-sm text-muted-foreground">{formatDay(p.day)}</span>
                          <span className="text-sm font-bold text-foreground">
                            {scoreText(p.score)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeTab === 'changes' && (
                <div className="space-y-4">
                  {describeChanges(points).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No change between stored days yet.
                    </p>
                  ) : (
                    describeChanges(points).map((change) => (
                      <div key={change.day} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{change.text}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDay(change.day)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Compliance details</SheetTitle>
              <SheetDescription>Select a compliance standard to view details.</SheetDescription>
            </SheetHeader>
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a compliance standard to view details
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
