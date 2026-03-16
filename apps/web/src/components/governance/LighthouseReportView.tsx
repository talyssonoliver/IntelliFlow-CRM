'use client';

import { useEffect, useState } from 'react';
import { Card, Progress } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { PageHeader } from '@/components/shared';
import { getScoreColor, getScoreBgColor, getProgressColor } from './quality-report-utils';

interface LighthouseDetails {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface QualityReport {
  id: string;
  name: string;
  type: string;
  status: string;
  score?: number;
  generatedAt: string;
  source: string;
  details?: LighthouseDetails;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

const THRESHOLD = 90;

const categories: { key: keyof LighthouseDetails; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'bestPractices', label: 'Best Practices' },
  { key: 'seo', label: 'SEO' },
];

export default function LighthouseReportView() {
  const { timezone } = useTimezoneContext();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch('/api/quality-reports?action=detail&id=lighthouse');
        const result = await response.json();
        if (result.success) {
          setReport(result.data);
        } else {
          setError('Failed to load report data');
        }
      } catch {
        setError('Failed to load Lighthouse report');
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
          { label: 'Lighthouse' },
        ]}
        title="Lighthouse Report"
        description="Lighthouse scores by category with threshold indicators"
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
            No Lighthouse Report Available
          </h3>
          <p className="text-muted-foreground">
            {report?.placeholderReason || 'No Lighthouse report has been generated yet. Run a Lighthouse CI scan to populate this page.'}
          </p>
        </Card>
      )}

      {!loading && !error && report && !isPlaceholder && details && (
        <>
          {/* Category Score Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            {categories.map(({ key, label }) => {
              const score = details[key];
              const passing = score >= THRESHOLD;

              return (
                <Card key={key} className="p-4" role="region" aria-label={`${label} score`}>
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
                    className={`text-3xl font-bold mb-2 ${getScoreColor(score)}`}
                  >
                    {score}
                  </div>
                  <Progress
                    value={score}
                    className={`h-2 ${getProgressColor(score)}`}
                    aria-label={`${label} score: ${score} out of 100`}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Threshold: &ge;{THRESHOLD}
                  </p>
                </Card>
              );
            })}
          </div>

          {/* Overall Summary */}
          <Card className="p-4 mb-6" role="region" aria-label="Overall Lighthouse summary">
            <h3 className="font-semibold text-foreground mb-3">Overall Summary</h3>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-lg ${getScoreBgColor(report.score ?? 0)} flex items-center justify-center`}>
                <span className={`material-symbols-outlined ${getScoreColor(report.score ?? 0)}`}>
                  {(report.score ?? 0) >= 90 ? 'check_circle' : 'warning'}
                </span>
              </div>
              <div>
                <p className={`text-2xl font-bold ${getScoreColor(report.score ?? 0)}`}>
                  {report.score ?? 'N/A'}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {categories.filter(c => details[c.key] >= THRESHOLD).length} of {categories.length} categories passing
                </p>
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
