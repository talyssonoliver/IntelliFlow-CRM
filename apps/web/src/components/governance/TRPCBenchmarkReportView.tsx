'use client';

import { useEffect, useState } from 'react';
import { Card, Progress, Button } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { PageHeader } from '@/components/shared';

/**
 * Detail view for the tRPC API Benchmark quality report.
 *
 * Data source: /api/quality-reports?action=detail&id=trpc-benchmark
 * (reads artifacts/benchmarks/trpc-benchmark-summary.json)
 *
 * HTML artifact: /api/quality-reports/view?report=trpc-benchmark
 * (reads artifacts/benchmarks/trpc-benchmark-report.html)
 */

interface Operation {
  operation: string;
  iterations: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  passed: boolean;
  error: string | null;
}

interface Thresholds {
  p50: number;
  p95: number;
  p99: number;
}

interface Totals {
  total: number;
  completed: number;
  passed: number;
  failedKpi: number;
  errored: number;
}

interface TRPCBenchmarkDetails {
  kpi: string;
  thresholds: Thresholds;
  totals: Totals;
  operations: Operation[];
}

interface QualityReport {
  id: string;
  name: string;
  type: string;
  status: 'passing' | 'failing' | 'unknown';
  score?: number;
  generatedAt: string;
  source: 'ci' | 'manual' | 'placeholder' | 'dynamic';
  htmlPath?: string;
  details?: TRPCBenchmarkDetails;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

function formatMs(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(2)}ms`;
}

function OpStatusPill({ op, thresholds }: { op: Operation; thresholds: Thresholds }) {
  if (op.error) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
        Error
      </span>
    );
  }
  const p95 = op.p95;
  if (p95 == null) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
        N/A
      </span>
    );
  }
  const good = p95 < thresholds.p95;
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        good
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
      }`}
    >
      {good ? 'Pass' : 'Fail'}
    </span>
  );
}

function OperationsTable({
  operations,
  thresholds,
}: {
  operations: Operation[];
  thresholds: Thresholds;
}) {
  const maxP95 = operations.reduce(
    (m, o) => (typeof o.p95 === 'number' && o.p95 > m ? o.p95 : m),
    thresholds.p95
  );

  return (
    <Card className="p-4 mb-6">
      <h3 className="font-semibold text-foreground mb-4">Per-Operation Results</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-3 font-medium">Operation</th>
              <th className="py-2 pr-3 font-medium text-right">Iter</th>
              <th className="py-2 pr-3 font-medium text-right">p50</th>
              <th className="py-2 pr-3 font-medium text-right">p95</th>
              <th className="py-2 pr-3 font-medium text-right">p99</th>
              <th className="py-2 pr-3 font-medium text-right">Mean</th>
              <th className="py-2 pr-3 font-medium">p95 vs KPI</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {operations.map((op) => {
              const p95 = op.p95 ?? 0;
              const pct = Math.min(100, Math.max(1, (p95 / maxP95) * 100));
              const barColor = op.error
                ? 'bg-muted-foreground/40'
                : p95 < thresholds.p95
                  ? 'bg-emerald-500'
                  : 'bg-red-500';
              return (
                <tr key={op.operation} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 font-mono text-foreground">{op.operation}</td>
                  <td className="py-2 pr-3 text-right text-muted-foreground">{op.iterations}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMs(op.p50)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium">
                    {formatMs(op.p95)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMs(op.p99)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMs(op.mean)}</td>
                  <td className="py-2 pr-3 min-w-[140px]">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2">
                    <OpStatusPill op={op} thresholds={thresholds} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {operations.some((o) => o.error) && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Errors:</p>
          {operations
            .filter((o) => o.error)
            .map((o) => (
              <div
                key={o.operation}
                className="text-xs p-3 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 font-mono"
              >
                <span className="font-semibold">{o.operation}:</span>{' '}
                {(o.error || '').split('\n')[0].slice(0, 300)}
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}

function FullReportSection({ htmlPath }: { htmlPath: string | undefined }) {
  const [showEmbed, setShowEmbed] = useState(false);
  if (!htmlPath) return null;
  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Full HTML Report</h3>
          <p className="text-sm text-muted-foreground">
            Complete benchmark artifact generated by the CLI runner.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEmbed((v) => !v)}>
            <span className="material-symbols-outlined text-sm mr-1">
              {showEmbed ? 'visibility_off' : 'visibility'}
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
            title="tRPC Benchmark Report"
            className="w-full bg-white"
            style={{ height: '70vh', minHeight: '500px' }}
          />
        </div>
      )}
    </Card>
  );
}

export default function TRPCBenchmarkReportView() {
  const { timezone } = useTimezoneContext();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch('/api/quality-reports?action=detail&id=trpc-benchmark');
        const result = await response.json();
        if (result.success) {
          setReport(result.data);
        } else {
          setError('Failed to load report data');
        }
      } catch {
        setError('Failed to load tRPC benchmark report');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, []);

  const details = report?.details;
  const isPlaceholder = report?.isPlaceholder || report?.source === 'placeholder';

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Governance', href: '/governance' },
          { label: 'Quality Reports', href: '/governance/quality-reports' },
          { label: 'tRPC Benchmark' },
        ]}
        title="tRPC API Benchmark"
        description="In-process per-procedure latency against the IFC-003 KPI (p50 < 30ms, p95 < 50ms, p99 < 100ms)"
        className="mb-8"
      />

      {loading && (
        <div className="text-center py-16 text-muted-foreground">
          <span className="material-symbols-outlined text-5xl mb-4 animate-spin">
            progress_activity
          </span>
          <p className="text-lg">Loading report...</p>
        </div>
      )}

      {!loading && error && (
        <Card className="p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to Load Report</h3>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      )}

      {!loading && !error && isPlaceholder && (
        <Card className="p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-muted-foreground mb-4">
            info
          </span>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            No tRPC Benchmark Available
          </h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {report?.placeholderReason || 'No benchmark generated yet. Run the CLI to produce one.'}
          </p>
          <pre className="mt-4 inline-block text-left text-xs bg-muted p-3 rounded-lg font-mono">
            {`npx dotenv -e .env.test -- npx tsx apps/api/src/shared/performance-benchmark.ts
node scripts/ci/generate-trpc-benchmark-report.js`}
          </pre>
        </Card>
      )}

      {!loading && !error && report && !isPlaceholder && details && (
        <>
          {/* Overall summary banner */}
          <Card className="p-4 mb-6" role="region" aria-label="Benchmark summary">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  report.status === 'passing'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : report.status === 'failing'
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-muted'
                }`}
              >
                <span
                  className={`material-symbols-outlined ${
                    report.status === 'passing'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : report.status === 'failing'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground'
                  }`}
                >
                  {report.status === 'passing' ? 'check_circle' : 'warning'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  {report.status === 'passing'
                    ? 'All benchmarks pass IFC-003 KPI'
                    : report.status === 'failing'
                      ? 'Some benchmarks regressed'
                      : 'No benchmarks completed'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {details.totals.passed}/{details.totals.completed} passing ·{' '}
                  {details.totals.failedKpi} KPI fail · {details.totals.errored} errored
                </p>
              </div>
              {report.score != null && (
                <div className="text-right">
                  <p
                    className={`text-2xl font-bold ${
                      report.score >= 90
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : report.score >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {report.score}%
                  </p>
                  <p className="text-xs text-muted-foreground">Pass Rate</p>
                </div>
              )}
            </div>
          </Card>

          {/* Threshold KPI cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">p50</p>
              <p className="text-2xl font-bold text-foreground">&lt; {details.thresholds.p50}ms</p>
              <p className="text-xs text-muted-foreground mt-1">Median response</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                p95 (KPI)
              </p>
              <p className="text-2xl font-bold text-foreground">&lt; {details.thresholds.p95}ms</p>
              <p className="text-xs text-muted-foreground mt-1">95th percentile</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">p99</p>
              <p className="text-2xl font-bold text-foreground">&lt; {details.thresholds.p99}ms</p>
              <p className="text-xs text-muted-foreground mt-1">99th percentile</p>
            </Card>
            <Card className="p-4" role="region" aria-label="Pass rate">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Pass Rate
              </p>
              <p
                className={`text-2xl font-bold ${
                  (report.score ?? 0) >= 90
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {report.score ?? 0}%
              </p>
              <Progress value={report.score ?? 0} className="h-2 mt-2" />
            </Card>
          </div>

          {/* Per-operation table */}
          <OperationsTable operations={details.operations} thresholds={details.thresholds} />

          {/* Embedded full HTML */}
          <FullReportSection htmlPath={report.htmlPath} />

          {/* Metadata */}
          <Card className="p-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="material-symbols-outlined text-base">schedule</span>
              <span>
                Generated:{' '}
                {new Date(report.generatedAt).toLocaleDateString('en-GB', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: timezone,
                })}
              </span>
              <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs rounded-full font-medium">
                {details.kpi}
              </span>
              {report.source === 'ci' && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full font-medium">
                  CI Generated
                </span>
              )}
              {report.source === 'manual' && (
                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-xs rounded-full font-medium">
                  Local Run
                </span>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
