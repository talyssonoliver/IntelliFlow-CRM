'use client';

import { useEffect, useState } from 'react';
import { Card, Progress, Button } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { PageHeader } from '@/components/shared';
import { getScoreColor, getScoreBgColor, getProgressColor, parseDurationMs } from './quality-report-utils';

// ============================================================================
// Types — matches performance-summary.json via /api/quality-reports
// ============================================================================

interface EndpointResult {
  name: string;
  description: string;
  p50: number;
  p95: number;
  p99: number;
  avgTime: number;
  iterations: number;
  status: string;
}

interface PerformanceMetrics {
  endpoints_tested: number;
  endpoints_passing: number;
  endpoints_failing: number;
  p50_median: string;
  p95_median: string;
  p99_median: string;
  p95_avg: string;
  p95_target: string;
  p99_target: string;
  all_targets_met: boolean;
  violations: string[];
  load_test_rps: number | null;
  load_test_vus: number | null;
  load_test_duration: string | null;
  api_url: string;
  endpoints?: EndpointResult[];
}

interface QualityReport {
  id: string;
  name: string;
  type: string;
  status: string;
  score?: number;
  generatedAt: string;
  source: string;
  htmlPath?: string;
  details?: PerformanceMetrics;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

// ============================================================================
// Thresholds (from lighthouserc.js / Sprint Plan)
// ============================================================================

const P95_TARGET_MS = 100;
const P99_TARGET_MS = 200;
const P50_TARGET_MS = 50;

// ============================================================================
// Sub-components
// ============================================================================

function PassFailPill({ passing }: { passing: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        passing
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      }`}
    >
      {passing ? 'Pass' : 'Fail'}
    </span>
  );
}

function MetricCard({
  label,
  value,
  targetMs,
  icon,
  ariaLabel,
}: {
  label: string;
  value: string;
  targetMs: number;
  icon: string;
  ariaLabel: string;
}) {
  const ms = parseDurationMs(value);
  const passing = ms !== null && ms <= targetMs;
  const score = ms !== null ? Math.max(0, Math.min(100, Math.round(100 * (1 - Math.max(0, ms - targetMs) / targetMs)))) : 0;

  return (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- shadcn Card renders a div; role="region" provides correct landmark semantics
    <Card className="p-4" role="region" aria-label={ariaLabel}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-muted-foreground">{icon}</span>
          <h3 className="font-medium text-foreground">{label}</h3>
        </div>
        <PassFailPill passing={passing} />
      </div>
      <p className={`text-3xl font-bold mb-2 ${passing ? 'text-emerald-500' : ms !== null && ms <= targetMs * 1.5 ? 'text-amber-500' : 'text-red-500'}`}>
        {value}
      </p>
      <Progress
        value={Math.max(0, Math.min(100, score))}
        className={`h-2 mb-2 ${getProgressColor(score)}`}
        aria-label={`${label}: ${value}`}
      />
      <p className="text-xs text-muted-foreground">Target: &lt;{targetMs}ms</p>
    </Card>
  );
}

function EndpointHealthCard({
  tested,
  passing,
  failing,
}: {
  tested: number;
  passing: number;
  failing: number;
}) {
  const pct = tested > 0 ? Math.round((passing / tested) * 100) : 0;
  const allPass = failing === 0;

  return (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
    <Card className="p-4" role="region" aria-label="Endpoint health">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-muted-foreground">api</span>
          <h3 className="font-medium text-foreground">Endpoints</h3>
        </div>
        <PassFailPill passing={allPass} />
      </div>
      <p className={`text-3xl font-bold mb-2 ${getScoreColor(pct)}`}>
        {passing}/{tested}
      </p>
      <Progress
        value={pct}
        className={`h-2 mb-2 ${getProgressColor(pct)}`}
        aria-label={`${passing} of ${tested} endpoints passing`}
      />
      <p className="text-xs text-muted-foreground">{pct}% passing</p>
    </Card>
  );
}

function LoadTestCard({
  rps,
  vus,
  duration,
}: {
  rps: number | null;
  vus: number | null;
  duration: string | null;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
    <Card className="p-4" role="region" aria-label="Load test results">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-base text-muted-foreground">groups</span>
        <h3 className="font-medium text-foreground">Load Test</h3>
      </div>
      <p className="text-3xl font-bold text-foreground mb-2">
        {rps != null ? `${rps} rps` : 'N/A'}
      </p>
      <p className="text-xs text-muted-foreground">
        {vus != null && duration != null
          ? `${vus} virtual users, ${duration}`
          : 'No load test data'}
      </p>
    </Card>
  );
}

function ViolationsSection({ violations }: { violations: string[] }) {
  if (violations.length === 0) return null;

  return (
    <Card className="p-4 mb-6 border-red-200 dark:border-red-800">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-red-500">warning</span>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-2">Budget Violations</h3>
          <ul className="space-y-1.5">
            {violations.map((v, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="material-symbols-outlined text-red-400 text-sm mt-0.5 flex-shrink-0">
                  error_outline
                </span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function EndpointDetailTable({
  endpoints,
  expanded,
  onToggle,
}: {
  endpoints: EndpointResult[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (endpoints.length === 0) return null;

  const sorted = [...endpoints].sort((a, b) => b.p95 - a.p95);
  const preview = sorted.slice(0, 5);
  const displayed = expanded ? sorted : preview;
  const hasMore = sorted.length > 5;

  return (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role
    <Card className="p-4 mb-6" role="region" aria-label="Per-endpoint performance detail">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Endpoint Performance Detail</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sorted.length} endpoints sorted by p95 latency (slowest first)
          </p>
        </div>
        {hasMore && (
          <Button variant="outline" size="sm" onClick={onToggle}>
            <span className="material-symbols-outlined text-sm mr-1">
              {expanded ? 'unfold_less' : 'unfold_more'}
            </span>
            {expanded ? 'Show Top 5' : `Show All ${sorted.length}`}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Endpoint</th>
              <th className="text-left py-2 pr-3 font-medium text-muted-foreground hidden sm:table-cell">Description</th>
              <th className="text-right py-2 pr-3 font-medium text-muted-foreground">p50</th>
              <th className="text-right py-2 pr-3 font-medium text-muted-foreground">p95</th>
              <th className="text-right py-2 pr-3 font-medium text-muted-foreground">p99</th>
              <th className="text-right py-2 pr-3 font-medium text-muted-foreground hidden md:table-cell">Iters</th>
              <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((ep) => {
              const passing = ep.status === 'PASS';
              const slow = ep.p95 > P95_TARGET_MS;
              return (
                <tr
                  key={ep.name}
                  className={`border-b border-border/30 ${slow ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                >
                  <td className="py-2 pr-3">
                    <code className="text-xs font-mono text-foreground">{ep.name}</code>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground text-xs hidden sm:table-cell">
                    {ep.description.replace(' endpoint response time', '')}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-foreground">{ep.p50}ms</td>
                  <td className={`py-2 pr-3 text-right font-mono text-xs font-medium ${slow ? 'text-red-500' : 'text-foreground'}`}>
                    {ep.p95}ms
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-xs text-foreground">{ep.p99}ms</td>
                  <td className="py-2 pr-3 text-right text-xs text-muted-foreground hidden md:table-cell">{ep.iterations}</td>
                  <td className="py-2 text-center">
                    <PassFailPill passing={passing} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && !expanded && (
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Showing top 5 of {sorted.length} endpoints.{' '}
          <button onClick={onToggle} className="text-blue-500 hover:underline">
            Show all
          </button>
        </p>
      )}
    </Card>
  );
}

function FullReportSection({ htmlPath }: { htmlPath?: string }) {
  const [showEmbed, setShowEmbed] = useState(false);

  if (!htmlPath) return null;

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground">Full Benchmark Report</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete HTML report with charts, inventory, and recommendations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEmbed(!showEmbed)}>
            <span className="material-symbols-outlined text-sm mr-1">
              {showEmbed ? 'close_fullscreen' : 'open_in_full'}
            </span>
            {showEmbed ? 'Collapse' : 'Preview'}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={htmlPath} target="_blank" rel="noopener noreferrer">
              <span className="material-symbols-outlined text-sm mr-1">open_in_new</span>
              Open in Tab
            </a>
          </Button>
        </div>
      </div>
      {showEmbed && (
        <div className="rounded-lg border border-border overflow-hidden mt-3">
          <iframe
            src={htmlPath}
            title="Performance Benchmark Report"
            className="w-full bg-white"
            style={{ height: '70vh', minHeight: '500px' }}
          />
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function PerformanceReportView() {
  const { timezone } = useTimezoneContext();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [endpointsExpanded, setEndpointsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch('/api/quality-reports?action=detail&id=performance');
        const result = await response.json();
        if (result.success) {
          setReport(result.data);
        } else {
          setError('Failed to load report data');
        }
      } catch {
        setError('Failed to load performance report');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, []);

  const metrics = report?.details;
  const isPlaceholder = report?.isPlaceholder || report?.source === 'placeholder';

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Governance', href: '/governance' },
          { label: 'Quality Reports', href: '/governance/quality-reports' },
          { label: 'Performance' },
        ]}
        title="Performance Report"
        description="API response times, endpoint health, and load test results against sprint plan targets"
        className="mb-8"
      />

      {/* Loading State */}
      {loading && (
        <div className="text-center py-16 text-muted-foreground">
          <span className="material-symbols-outlined text-5xl mb-4 animate-spin">
            progress_activity
          </span>
          <p className="text-lg">Loading report...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <Card className="p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Report</h3>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      )}

      {/* Placeholder State */}
      {!loading && !error && isPlaceholder && (
        <Card className="p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-muted-foreground mb-4">
            info
          </span>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No Performance Report Available
          </h3>
          <p className="text-muted-foreground">
            {report?.placeholderReason ||
              'Run `npx tsx artifacts/benchmarks/run-baseline-benchmark.ts` to generate real benchmark data.'}
          </p>
        </Card>
      )}

      {/* Real Data */}
      {!loading && !error && report && !isPlaceholder && metrics && (
        <>
          {/* ── Section 1: Overall Health Banner ── */}
          {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */}
          <Card className="p-4 mb-6" role="region" aria-label="Overall performance status">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  metrics.all_targets_met
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}
              >
                <span
                  className={`material-symbols-outlined ${
                    metrics.all_targets_met ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {metrics.all_targets_met ? 'check_circle' : 'cancel'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  {metrics.all_targets_met ? 'All Performance Targets Met' : 'Performance Budget Exceeded'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {metrics.endpoints_passing} of {metrics.endpoints_tested} endpoints passing
                  {metrics.violations.length > 0 && ` \u00b7 ${metrics.violations.length} budget violation${metrics.violations.length > 1 ? 's' : ''}`}
                </p>
              </div>
              {report.score != null && (
                <div className="text-right">
                  <p className={`text-2xl font-bold ${getScoreColor(report.score)}`}>
                    {report.score}
                  </p>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
              )}
            </div>
          </Card>

          {/* ── Section 2: Executive KPI Grid ── */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <MetricCard
              label="p50 Median"
              value={metrics.p50_median}
              targetMs={P50_TARGET_MS}
              icon="speed"
              ariaLabel="p50 median response time"
            />
            <MetricCard
              label="p95 Median"
              value={metrics.p95_median}
              targetMs={P95_TARGET_MS}
              icon="timer"
              ariaLabel="p95 median response time"
            />
            <EndpointHealthCard
              tested={metrics.endpoints_tested}
              passing={metrics.endpoints_passing}
              failing={metrics.endpoints_failing}
            />
            <LoadTestCard
              rps={metrics.load_test_rps}
              vus={metrics.load_test_vus}
              duration={metrics.load_test_duration}
            />
          </div>

          {/* ── Section 3: Budget Violations ── */}
          <ViolationsSection violations={metrics.violations} />

          {/* ── Section 4: Detailed Metrics ── */}
          {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */}
          <Card className="p-4 mb-6" role="region" aria-label="Detailed performance metrics">
            <h3 className="font-semibold text-foreground mb-4">Response Time Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Metric</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Actual</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Target</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'p50 Median', value: metrics.p50_median, target: metrics.p95_target ? `<${P50_TARGET_MS}ms` : '<50ms', targetMs: P50_TARGET_MS },
                    { label: 'p95 Median', value: metrics.p95_median, target: `<${metrics.p95_target || '100ms'}`, targetMs: P95_TARGET_MS },
                    { label: 'p95 Average', value: metrics.p95_avg, target: `<${metrics.p95_target || '100ms'}`, targetMs: P95_TARGET_MS },
                    { label: 'p99 Median', value: metrics.p99_median, target: `<${metrics.p99_target || '200ms'}`, targetMs: P99_TARGET_MS },
                  ].map((row) => {
                    const ms = parseDurationMs(row.value);
                    const passing = ms !== null && ms <= row.targetMs;
                    return (
                      <tr key={row.label} className="border-b border-border/50">
                        <td className="py-2.5 pr-4 text-foreground">{row.label}</td>
                        <td className={`py-2.5 pr-4 font-medium ${passing ? 'text-emerald-500' : 'text-red-500'}`}>
                          {row.value}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{row.target}</td>
                        <td className="py-2.5">
                          <PassFailPill passing={passing} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Section 5: Per-Endpoint Detail ── */}
          {metrics.endpoints && metrics.endpoints.length > 0 && (
            <EndpointDetailTable
              endpoints={metrics.endpoints}
              expanded={endpointsExpanded}
              onToggle={() => setEndpointsExpanded(!endpointsExpanded)}
            />
          )}

          {/* ── Section 6: Full HTML Report ── */}
          <FullReportSection htmlPath={report.htmlPath} />

          {/* ── Section 7: Test Configuration & Metadata ── */}
          {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */}
          <Card className="p-4" role="region" aria-label="Test configuration">
            <h3 className="font-semibold text-foreground mb-3">Test Configuration</h3>
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">API Endpoint</span>
                <span className="text-foreground font-mono text-xs">{metrics.api_url}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Endpoints Tested</span>
                <span className="text-foreground">{metrics.endpoints_tested} tRPC queries</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-border/30">
                <span className="text-muted-foreground">Authentication</span>
                <span className="text-foreground">Supabase Bearer (local JWT verify)</span>
              </div>
              {metrics.load_test_vus != null && (
                <div className="flex justify-between py-1.5 border-b border-border/30">
                  <span className="text-muted-foreground">Load Test</span>
                  <span className="text-foreground">{metrics.load_test_vus} VUs / {metrics.load_test_duration}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-border/30 sm:col-span-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="material-symbols-outlined text-base">schedule</span>
                  <span>
                    Generated:{' '}
                    {new Date(report.generatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: timezone,
                    })}
                  </span>
                </div>
                {report.source === 'ci' && (
                  <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full font-medium">
                    CI Generated
                  </span>
                )}
              </div>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
