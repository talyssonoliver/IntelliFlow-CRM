'use client';

import { useParams, useRouter } from 'next/navigation';
import { Card, Button } from '@intelliflow/ui';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared';

interface QualityReport {
  id: string;
  name: string;
  type: 'lighthouse' | 'coverage' | 'performance';
  status: 'passing' | 'failing' | 'unknown';
  score?: number;
  generatedAt: string;
  source: 'ci' | 'manual';
  htmlPath?: string;
  details?: Record<string, unknown>;
}

const reportConfigs: Record<
  string,
  { icon: string; color: string; title: string; thresholds: { label: string; value: number }[] }
> = {
  lighthouse: {
    icon: 'speed',
    color: 'bg-blue-500',
    title: 'Lighthouse Performance Report',
    thresholds: [
      { label: 'Performance', value: 90 },
      { label: 'Accessibility', value: 90 },
      { label: 'Best Practices', value: 90 },
      { label: 'SEO', value: 90 },
    ],
  },
  coverage: {
    icon: 'bug_report',
    color: 'bg-purple-500',
    title: 'Test Coverage Report',
    thresholds: [
      { label: 'Domain Layer', value: 95 },
      { label: 'Application Layer', value: 90 },
      { label: 'Overall', value: 90 },
    ],
  },
  performance: {
    icon: 'timeline',
    color: 'bg-emerald-500',
    title: 'Performance Benchmark Report',
    thresholds: [
      { label: 'API p95', value: 100 },
      { label: 'API p99', value: 200 },
      { label: 'DB Query', value: 20 },
    ],
  },
};

export default function QualityReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;

  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch(`/api/quality-reports?action=detail&id=${reportId}`);
        const result = await response.json();
        if (result.success) {
          setReport(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch report:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [reportId]);

  const config = reportConfigs[reportId] || reportConfigs.lighthouse;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'passing':
        return { icon: 'check_circle', color: 'text-emerald-500', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', label: 'Passing' };
      case 'failing':
        return { icon: 'cancel', color: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/30', label: 'Failing' };
      default:
        return { icon: 'help', color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Unknown' };
    }
  };

  const statusInfo = report ? getStatusInfo(report.status) : getStatusInfo('unknown');

  return (
    <>
      <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Governance', href: '/governance' },
            { label: 'Quality Reports', href: '/governance/quality-reports' },
            { label: config.title },
          ]}
          title={config.title}
          description={`${report?.source === 'ci' ? 'CI-generated' : 'Manually created'} quality report`}
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

        {!loading && report && (
          <>
            {/* Report Summary */}
            <div className="grid gap-4 md:grid-cols-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center`}>
                    <span className="material-symbols-outlined text-white">{config.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Report Type</p>
                    <p className="font-semibold text-foreground capitalize">{report.type}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${statusInfo.bgColor} flex items-center justify-center`}>
                    <span className={`material-symbols-outlined ${statusInfo.color}`}>{statusInfo.icon}</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className={`font-semibold ${statusInfo.color}`}>{statusInfo.label}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400">
                      percent
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Score</p>
                    <p className={`font-semibold text-2xl ${
                      report.score !== undefined
                        ? report.score >= 90
                          ? 'text-emerald-500'
                          : report.score >= 70
                            ? 'text-amber-500'
                            : 'text-red-500'
                        : 'text-muted-foreground'
                    }`}>
                      {report.score !== undefined ? `${report.score}%` : 'N/A'}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                      schedule
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Generated</p>
                    <p className="font-semibold text-foreground">
                      {new Date(report.generatedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Thresholds */}
            <Card className="p-4 mb-6">
              <h3 className="font-semibold text-foreground mb-3">Required Thresholds</h3>
              <div className="flex flex-wrap gap-4">
                {config.thresholds.map((threshold) => (
                  <div key={threshold.label} className="flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-base text-muted-foreground">
                      flag
                    </span>
                    <span className="text-muted-foreground">{threshold.label}:</span>
                    <span className="font-medium text-foreground">
                      {threshold.value}{reportId === 'performance' ? 'ms' : '%'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Report Viewer */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-muted-foreground">
                    description
                  </span>
                  <span className="font-medium text-foreground">Full Report</span>
                  {report.source === 'ci' && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full font-medium">
                      CI Generated
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/quality-reports/view?report=${reportId}`, '_blank')}
                  >
                    <span className="material-symbols-outlined text-base mr-1">open_in_new</span>
                    Open in New Tab
                  </Button>
                </div>
              </div>

              <div className="relative" style={{ height: '70vh' }}>
                {!iframeLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                    <div className="text-center">
                      <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
                        progress_activity
                      </span>
                      <p className="text-sm text-muted-foreground mt-2">Loading report...</p>
                    </div>
                  </div>
                )}
                <iframe
                  src={`/api/quality-reports/view?report=${reportId}`}
                  className="w-full h-full border-0"
                  title={`${config.title} Report`}
                  onLoad={() => setIframeLoaded(true)}
                />
              </div>
            </Card>
          </>
        )}

        {!loading && !report && (
          <Card className="p-12 text-center">
            <span className="material-symbols-outlined text-5xl text-muted-foreground mb-4">
              error
            </span>
            <h3 className="text-lg font-semibold text-foreground mb-2">Report Not Found</h3>
            <p className="text-muted-foreground mb-4">
              The requested quality report could not be found.
            </p>
            <Button onClick={() => router.push('/governance/quality-reports')}>
              <span className="material-symbols-outlined text-base mr-1">arrow_back</span>
              Back to Quality Reports
            </Button>
          </Card>
        )}
    </>
  );
}
