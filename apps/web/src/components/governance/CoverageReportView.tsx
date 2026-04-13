'use client';

import { useEffect, useState } from 'react';
import { Card, Progress } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { PageHeader } from '@/components/shared';
import { getScoreColor, getProgressColor } from './quality-report-utils';

interface CoverageDetails {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
  testsTotal?: number;
  testsPassed?: number;
  testsFailed?: number;
  thresholdsMet?: boolean;
  statusMessage?: string;
  failingTests?: Array<{ file: string; test: string }>;
}

interface QualityReport {
  id: string;
  name: string;
  type: string;
  status: string;
  score?: number;
  generatedAt: string;
  source: string;
  details?: CoverageDetails;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

const metrics: { key: keyof CoverageDetails; label: string; threshold: number }[] = [
  { key: 'statements', label: 'Statements', threshold: 90 },
  { key: 'branches', label: 'Branches', threshold: 80 },
  { key: 'functions', label: 'Functions', threshold: 90 },
  { key: 'lines', label: 'Lines', threshold: 90 },
];

function formatNumber(n: number): string {
  return n.toLocaleString('en-GB');
}

export default function CoverageReportView() {
  const { timezone } = useTimezoneContext();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch('/api/quality-reports?action=detail&id=coverage');
        const result = await response.json();
        if (result.success) {
          setReport(result.data);
        } else {
          setError('Failed to load report data');
        }
      } catch {
        setError('Failed to load coverage report');
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
          { label: 'Test Coverage' },
        ]}
        title="Test Coverage Report"
        description="Test coverage by metric with threshold indicators"
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
            No Coverage Report Available
          </h3>
          <p className="text-muted-foreground">
            {report?.placeholderReason ||
              'No coverage report has been generated yet. Run tests with coverage to populate this page.'}
          </p>
        </Card>
      )}

      {!loading && !error && report && !isPlaceholder && details && (
        <>
          {/* Metric Cards */}
          {}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            {metrics.map(({ key, label, threshold }) => {
              const value = details[key] as number;
              const passing = value >= threshold;

              return (
                <Card key={key} className="p-4" role="region" aria-label={`${label} coverage`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-foreground">{label}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        passing
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {passing ? 'Pass' : 'Fail'}
                    </span>
                  </div>
                  <div
                    data-score-card
                    className={`text-3xl font-bold mb-2 ${getScoreColor(value)}`}
                  >
                    {value}%
                  </div>
                  <Progress
                    value={value}
                    className={`h-2 ${getProgressColor(value)}`}
                    aria-label={`${label} coverage: ${value}%`}
                  />
                  <p className="text-xs text-muted-foreground mt-2">Threshold: &ge;{threshold}%</p>
                </Card>
              );
            })}
          </div>

          {/* Test Metadata */}
          {details.testsTotal !== undefined && (
            <Card className="p-4 mb-6" role="region" aria-label="Test run metadata">
              <h3 className="font-semibold text-foreground mb-3">Test Run Summary</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {formatNumber(details.testsTotal)}
                  </p>
                  <p className="text-sm text-muted-foreground">Total Tests</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-500">
                    {formatNumber(details.testsPassed ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Passed</p>
                </div>
                <div className="text-center">
                  <p
                    className={`text-2xl font-bold ${(details.testsFailed ?? 0) > 0 ? 'text-red-500' : 'text-foreground'}`}
                  >
                    {formatNumber(details.testsFailed ?? 0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>
            </Card>
          )}

          {/* Failing Tests List */}
          {details.failingTests && details.failingTests.length > 0 && (
            <Card className="p-4 mb-6" role="region" aria-label="Failing tests">
              <h3 className="font-semibold text-foreground mb-3">Failing Tests</h3>
              <div className="space-y-2">
                {details.failingTests.map((ft, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="material-symbols-outlined text-base text-red-500 mt-0.5">
                      close
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{ft.file}</p>
                      <p className="text-muted-foreground">{ft.test}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {}

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
