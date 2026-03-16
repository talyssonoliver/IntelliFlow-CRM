'use client';

import { useEffect, useState } from 'react';
import { Card } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { PageHeader } from '@/components/shared';
import { parseDurationMs } from './quality-report-utils';

interface PerformanceDetails {
  tRPC_p95: string;
  database_p95: string;
  all_targets_met: boolean;
  benchmarks: number;
}

interface QualityReport {
  id: string;
  name: string;
  type: string;
  status: string;
  score?: number;
  generatedAt: string;
  source: string;
  details?: PerformanceDetails;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

const TRPC_THRESHOLD_MS = 50;
const DB_THRESHOLD_MS = 20;

export default function PerformanceReportView() {
  const { timezone } = useTimezoneContext();
  const [report, setReport] = useState<QualityReport | null>(null);
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

  const details = report?.details;
  const isPlaceholder = report?.isPlaceholder || report?.source === 'placeholder';

  const trpcMs = details ? parseDurationMs(details.tRPC_p95) : null;
  const dbMs = details ? parseDurationMs(details.database_p95) : null;
  const trpcPassing = trpcMs !== null && trpcMs < TRPC_THRESHOLD_MS;
  const dbPassing = dbMs !== null && dbMs < DB_THRESHOLD_MS;

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
        description="API response times and benchmark results with threshold indicators"
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
            No Performance Report Available
          </h3>
          <p className="text-muted-foreground">
            {report?.placeholderReason || 'No performance report has been generated yet. Run benchmarks to populate this page.'}
          </p>
        </Card>
      )}

      {!loading && !error && report && !isPlaceholder && details && (
        <>
          {/* Overall Status */}
          <Card className="p-4 mb-6" role="region" aria-label="Overall performance status">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  details.all_targets_met
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}
              >
                <span
                  className={`material-symbols-outlined ${
                    details.all_targets_met
                      ? 'text-emerald-500'
                      : 'text-red-500'
                  }`}
                >
                  {details.all_targets_met ? 'check_circle' : 'cancel'}
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {details.all_targets_met ? 'All Targets Met' : 'Targets Not Met'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {details.all_targets_met
                    ? 'All performance benchmarks are within acceptable thresholds'
                    : 'One or more performance benchmarks exceed acceptable thresholds'}
                </p>
              </div>
            </div>
          </Card>

          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            {/* tRPC p95 */}
            <Card className="p-4" role="region" aria-label="tRPC p95 response time">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-foreground">tRPC p95</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    trpcPassing
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}
                >
                  {trpcPassing ? 'Pass' : 'Fail'}
                </span>
              </div>
              <p
                className={`text-3xl font-bold mb-1 ${
                  trpcPassing ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {details.tRPC_p95}
              </p>
              <p className="text-xs text-muted-foreground">
                Threshold: &lt;{TRPC_THRESHOLD_MS}ms
              </p>
            </Card>

            {/* Database p95 */}
            <Card className="p-4" role="region" aria-label="Database p95 response time">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-foreground">Database p95</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    dbPassing
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}
                >
                  {dbPassing ? 'Pass' : 'Fail'}
                </span>
              </div>
              <p
                className={`text-3xl font-bold mb-1 ${
                  dbPassing ? 'text-emerald-500' : 'text-red-500'
                }`}
              >
                {details.database_p95}
              </p>
              <p className="text-xs text-muted-foreground">
                Threshold: &lt;{DB_THRESHOLD_MS}ms
              </p>
            </Card>
          </div>

          {/* Benchmark Count */}
          <Card className="p-4 mb-6" role="region" aria-label="Benchmark count">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                  speed
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{details.benchmarks}</p>
                <p className="text-sm text-muted-foreground">Benchmarks Executed</p>
              </div>
            </div>
          </Card>

          {/* Metadata */}
          <Card className="p-4">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
              {report.source === 'ci' && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full font-medium">
                  CI Generated
                </span>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
