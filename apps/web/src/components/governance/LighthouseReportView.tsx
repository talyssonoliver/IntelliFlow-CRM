'use client';

import { useEffect, useState } from 'react';
import { Card, Progress, Button } from '@intelliflow/ui';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { PageHeader } from '@/components/shared';
import { getScoreColor, getScoreBgColor, getProgressColor } from './quality-report-utils';

// ============================================================================
// Types
// ============================================================================

interface LighthouseVitals {
  fcp?: number | null;
  lcp?: number | null;
  tbt?: number | null;
  cls?: number | null;
  tti?: number | null;
  si?: number | null;
  serverResponse?: number | null;
  jsBytes?: number | null;
  totalBytes?: number | null;
  url?: string | null;
}

interface LighthouseDetails {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  vitals?: LighthouseVitals;
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
  details?: LighthouseDetails;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

const SCORE_THRESHOLD = 90;

// ============================================================================
// Targets (from lighthouserc.js)
// ============================================================================

const VITAL_TARGETS = {
  fcp: { max: 1000, unit: 'ms', label: 'First Contentful Paint' },
  lcp: { max: 2500, unit: 'ms', label: 'Largest Contentful Paint' },
  tbt: { max: 300, unit: 'ms', label: 'Total Blocking Time' },
  cls: { max: 0.1, unit: '', label: 'Cumulative Layout Shift' },
  tti: { max: 1000, unit: 'ms', label: 'Time to Interactive' },
  si: { max: 3000, unit: 'ms', label: 'Speed Index' },
  serverResponse: { max: 200, unit: 'ms', label: 'Server Response (TTFB)' },
} as const;

const RESOURCE_TARGETS = {
  jsBytes: { max: 307200, label: 'JavaScript', unit: 'KB' }, // 300 KB
  totalBytes: { max: 1024000, label: 'Total Page Weight', unit: 'KB' }, // 1 MB
} as const;

const categories: { key: keyof Omit<LighthouseDetails, 'vitals'>; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'bestPractices', label: 'Best Practices' },
  { key: 'seo', label: 'SEO' },
];

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

function formatVital(value: number, unit: string): string {
  if (unit === 'ms') return Math.round(value) + 'ms';
  if (unit === '') return value.toFixed(4);
  return value.toString();
}

function WebVitalsSection({ vitals }: { vitals: LighthouseVitals }) {
  const rows = (Object.keys(VITAL_TARGETS) as (keyof typeof VITAL_TARGETS)[])
    .map((key) => {
      const value = vitals[key];
      const target = VITAL_TARGETS[key];
      if (value == null) return null;
      const passing = value <= target.max;
      return { key, label: target.label, value, target, passing };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return null;

  return (
     
    <Card className="p-4 mb-6" role="region" aria-label="Core Web Vitals">
      <h3 className="font-semibold text-foreground mb-4">Core Web Vitals</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Metric</th>
              <th className="text-right py-2 pr-3 font-medium text-muted-foreground">Actual</th>
              <th className="text-right py-2 pr-3 font-medium text-muted-foreground">Target</th>
              <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/30">
                <td className="py-2.5 pr-3 text-foreground">{r.label}</td>
                <td className={`py-2.5 pr-3 text-right font-mono text-xs font-medium ${r.passing ? 'text-emerald-500' : 'text-red-500'}`}>
                  {formatVital(r.value, r.target.unit)}
                </td>
                <td className="py-2.5 pr-3 text-right text-muted-foreground font-mono text-xs">
                  &lt;{formatVital(r.target.max, r.target.unit)}
                </td>
                <td className="py-2.5 text-center">
                  <PassFailPill passing={r.passing} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ResourceBudgetsSection({ vitals }: { vitals: LighthouseVitals }) {
  const rows = (Object.keys(RESOURCE_TARGETS) as (keyof typeof RESOURCE_TARGETS)[])
    .map((key) => {
      const value = vitals[key];
      const target = RESOURCE_TARGETS[key];
      if (value == null) return null;
      const passing = value <= target.max;
      return {
        key,
        label: target.label,
        value,
        max: target.max,
        passing,
        kb: (value / 1024).toFixed(0),
        maxKb: (target.max / 1024).toFixed(0),
        pct: Math.min(100, Math.round((value / target.max) * 100)),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return null;

  return (
     
    <Card className="p-4 mb-6" role="region" aria-label="Resource budgets">
      <h3 className="font-semibold text-foreground mb-4">Resource Budgets</h3>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{r.label}</span>
                <PassFailPill passing={r.passing} />
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                <span className={r.passing ? 'text-emerald-500' : 'text-red-500'}>{r.kb} KB</span>
                {' / '}
                <span>{r.maxKb} KB budget</span>
              </div>
            </div>
            <Progress
              value={r.pct}
              className={`h-2 ${r.passing ? '[&>div]:bg-emerald-500' : '[&>div]:bg-red-500'}`}
              aria-label={`${r.label}: ${r.kb} KB of ${r.maxKb} KB budget`}
            />
          </div>
        ))}
      </div>
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
          <h3 className="font-semibold text-foreground">Full Lighthouse Report</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete audit results with opportunities and diagnostics
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
            title="Lighthouse Report"
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
  const vitals = details?.vitals;
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
        description="Frontend performance, accessibility, best practices, and SEO scores with Core Web Vitals"
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
            {report?.placeholderReason ||
              'No Lighthouse report has been generated yet. Run a Lighthouse CI scan to populate this page.'}
          </p>
        </Card>
      )}

      {!loading && !error && report && !isPlaceholder && details && (
        <>
          {/* ── Section 1: Overall Summary Banner ── */}
          { }
          <Card className="p-4 mb-6" role="region" aria-label="Overall Lighthouse summary">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-lg ${getScoreBgColor(report.score ?? 0)} flex items-center justify-center`}
              >
                <span className={`material-symbols-outlined ${getScoreColor(report.score ?? 0)}`}>
                  {(report.score ?? 0) >= 90 ? 'check_circle' : 'warning'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">
                  {(report.score ?? 0) >= 90 ? 'All Targets Met' : 'Some Targets Below Threshold'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {categories.filter((c) => details[c.key] >= SCORE_THRESHOLD).length} of{' '}
                  {categories.length} categories passing
                  {vitals?.url ? ` \u00b7 URL: ${vitals.url}` : ''}
                </p>
              </div>
              {report.score != null && (
                <div className="text-right">
                  <p className={`text-2xl font-bold ${getScoreColor(report.score)}`}>
                    {report.score}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </div>
              )}
            </div>
          </Card>

          {/* ── Section 2: Category Score Cards ── */}
          { }
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            {categories.map(({ key, label }) => {
              const score = details[key];
              const passing = score >= SCORE_THRESHOLD;
              return (
                <Card key={key} className="p-4" role="region" aria-label={`${label} score`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-foreground">{label}</h3>
                    <PassFailPill passing={passing} />
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
                  <p className="text-xs text-muted-foreground mt-2">Threshold: &ge;{SCORE_THRESHOLD}</p>
                </Card>
              );
            })}
          </div>

          {/* ── Section 3: Core Web Vitals ── */}
          {vitals && <WebVitalsSection vitals={vitals} />}

          {/* ── Section 4: Resource Budgets ── */}
          {vitals && <ResourceBudgetsSection vitals={vitals} />}

          {/* ── Section 5: Full HTML Report ── */}
          <FullReportSection htmlPath={report.htmlPath} />

          {/* ── Section 6: Metadata ── */}
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
          { }
        </>
      )}
    </>
  );
}
