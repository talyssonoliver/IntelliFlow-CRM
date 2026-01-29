'use client';

import Link from 'next/link';
import { Card, Button, Progress } from '@intelliflow/ui';
import { useEffect, useState, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/shared';
import { TestRunnerModal } from '@/components/governance/test-runner-modal';

interface QualityReport {
  id: string;
  name: string;
  type: 'lighthouse' | 'coverage' | 'performance';
  status: 'passing' | 'failing' | 'unknown';
  score?: number;
  generatedAt: string;
  source: 'ci' | 'manual' | 'placeholder';
  htmlPath?: string;
  details?: Record<string, unknown>;
  isPlaceholder?: boolean;
  placeholderReason?: string;
  failures?: FailureInfo[];
}

interface FailureInfo {
  file?: string;
  test?: string;
  metric?: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

interface QualityReportsSummary {
  reports: QualityReport[];
  lastUpdated: string;
  overallHealth: 'good' | 'warning' | 'critical';
}

interface GenerateResult {
  report: string;
  success: boolean;
  message: string;
  duration: number;
}

interface GenerationJob {
  id: string;
  reports: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  currentReport?: string;
  results: GenerateResult[];
  startedAt: string;
  completedAt?: string;
}

type ReportScope = 'quick' | 'standard' | 'comprehensive';

interface ReportConfig {
  icon: string;
  color: string;
  description: string;
  scopes: {
    quick: string;
    standard: string;
    comprehensive: string;
  };
  estimatedTime: {
    quick: string;
    standard: string;
    comprehensive: string;
  };
}

const reportConfigs: Record<string, ReportConfig> = {
  lighthouse: {
    icon: 'speed',
    color: 'bg-blue-500',
    description: 'Performance, accessibility, best practices, and SEO scores',
    scopes: {
      quick: 'Home page only',
      standard: 'Key pages (Home, Login, Dashboard)',
      comprehensive: 'All public routes',
    },
    estimatedTime: {
      quick: '~30s',
      standard: '~2min',
      comprehensive: '~5min',
    },
  },
  coverage: {
    icon: 'bug_report',
    color: 'bg-purple-500',
    description: 'Test coverage across lines, branches, functions, and statements',
    scopes: {
      quick: 'Changed files only',
      standard: 'All unit tests',
      comprehensive: 'Unit + Integration tests',
    },
    estimatedTime: {
      quick: '~15s',
      standard: '~1min',
      comprehensive: '~3min',
    },
  },
  performance: {
    icon: 'timeline',
    color: 'bg-emerald-500',
    description: 'API response times, database queries, and load test results',
    scopes: {
      quick: 'Synthetic benchmarks',
      standard: 'API endpoint tests',
      comprehensive: 'Full load test (k6)',
    },
    estimatedTime: {
      quick: '~5s',
      standard: '~30s',
      comprehensive: '~2min',
    },
  },
};

const CACHE_KEY = 'quality-reports-cache';
const GENERATION_KEY = 'quality-reports-generation';

function getCacheKey(reportType: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `${CACHE_KEY}-${reportType}-${today}`;
}

function isCached(reportType: string): boolean {
  if (globalThis.window === undefined) return false;
  const cached = localStorage.getItem(getCacheKey(reportType));
  return !!cached;
}

function setCached(reportType: string): void {
  if (globalThis.window === undefined) return;
  localStorage.setItem(getCacheKey(reportType), new Date().toISOString());
}

function getStoredGeneration(): GenerationJob | null {
  if (globalThis.window === undefined) return null;
  const stored = localStorage.getItem(GENERATION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function storeGeneration(job: GenerationJob): void {
  if (globalThis.window === undefined) return;
  localStorage.setItem(GENERATION_KEY, JSON.stringify(job));
}

function clearGeneration(): void {
  if (globalThis.window === undefined) return;
  localStorage.removeItem(GENERATION_KEY);
}

// Helper functions to reduce cognitive complexity and avoid nested ternaries
function getJobBorderClass(status: GenerationJob['status']): string {
  switch (status) {
    case 'failed':
      return 'border-red-500/50';
    case 'completed':
      return 'border-emerald-500/50';
    default:
      return 'border-blue-500/50';
  }
}

function getJobBgClass(status: GenerationJob['status']): string {
  switch (status) {
    case 'failed':
      return 'bg-red-500/10';
    case 'completed':
      return 'bg-emerald-500/10';
    default:
      return 'bg-blue-500/10';
  }
}

function getJobTextClass(status: GenerationJob['status']): string {
  switch (status) {
    case 'failed':
      return 'text-red-500';
    case 'completed':
      return 'text-emerald-500';
    default:
      return 'text-blue-500 animate-spin';
  }
}

function getJobIcon(status: GenerationJob['status']): string {
  switch (status) {
    case 'failed':
      return 'error';
    case 'completed':
      return 'check_circle';
    default:
      return 'progress_activity';
  }
}

function getJobTitle(status: GenerationJob['status']): string {
  switch (status) {
    case 'running':
      return 'Generating Reports...';
    case 'completed':
      return 'Generation Complete';
    default:
      return 'Generation Failed';
  }
}

function getScopeTimeMultiplier(scope: ReportScope): { min: number; max: number } {
  switch (scope) {
    case 'quick':
      return { min: 0.5, max: 1 };
    case 'standard':
      return { min: 1.5, max: 3 };
    case 'comprehensive':
      return { min: 3, max: 6 };
  }
}

function calculateTimeEstimate(
  selectedReports: string[],
  selectedScope: ReportScope
): string {
  if (selectedReports.length === 1) {
    return reportConfigs[selectedReports[0]]?.estimatedTime[selectedScope] || 'Unknown';
  }
  const multiplier = getScopeTimeMultiplier(selectedScope);
  const minTime = selectedReports.length * multiplier.min;
  const maxTime = selectedReports.length * multiplier.max;
  return `${minTime} - ${maxTime} min`;
}

function getScopeDescription(scope: ReportScope): string {
  switch (scope) {
    case 'quick':
      return 'Fast checks, minimal coverage';
    case 'standard':
      return 'Balanced depth and speed';
    case 'comprehensive':
      return 'Full analysis, slower';
  }
}

function getSourceDisplay(source: QualityReport['source']): { icon: string; label: string; className?: string } {
  switch (source) {
    case 'ci':
      return { icon: 'build', label: 'CI Generated' };
    case 'placeholder':
      return { icon: 'draft', label: 'Placeholder', className: 'text-amber-500' };
    default:
      return { icon: 'edit', label: 'Manual' };
  }
}

// Sub-component: Generation Progress Banner
interface GenerationProgressBannerProps {
  job: GenerationJob;
  onDismiss: () => void;
}

function GenerationProgressBanner({ job, onDismiss }: Readonly<GenerationProgressBannerProps>) {
  return (
    <Card className={`mb-6 p-4 ${getJobBorderClass(job.status)}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getJobBgClass(job.status)}`}>
          <span className={`material-symbols-outlined ${getJobTextClass(job.status)}`}>
            {getJobIcon(job.status)}
          </span>
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">
              {getJobTitle(job.status)}
            </h3>
            <button
              type="button"
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          {job.status === 'running' && (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {job.currentReport
                  ? `Running ${job.currentReport}...`
                  : `Processing ${job.reports.join(', ')}...`}
              </p>
              <Progress value={job.progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                This may take a few minutes. You can continue using the app.
              </p>
            </>
          )}

          {job.status === 'completed' && job.results.length > 0 && (
            <div className="space-y-2 mt-2">
              {job.results.map((result) => (
                <div key={result.report} className="flex items-center gap-2 text-sm">
                  <span className={`material-symbols-outlined text-sm ${result.success ? 'text-emerald-500' : 'text-red-500'}`}>
                    {result.success ? 'check' : 'close'}
                  </span>
                  <span className="capitalize font-medium">{result.report}</span>
                  <span className="text-muted-foreground">- {result.message}</span>
                  {result.duration > 0 && (
                    <span className="text-xs text-muted-foreground">({(result.duration / 1000).toFixed(1)}s)</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {job.status === 'failed' && (
            <p className="text-sm text-red-500">
              {job.results[0]?.message || 'An error occurred during generation.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// Sub-component: Scope Selector Button
interface ScopeSelectorButtonProps {
  scope: ReportScope;
  isSelected: boolean;
  onClick: () => void;
}

function ScopeSelectorButton({ scope, isSelected, onClick }: Readonly<ScopeSelectorButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-lg border text-left transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <p className="font-medium text-foreground capitalize">{scope}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {getScopeDescription(scope)}
      </p>
    </button>
  );
}

// Sub-component: Report Selector Card
interface ReportSelectorCardProps {
  reportKey: string;
  config: ReportConfig;
  isSelected: boolean;
  isCached: boolean;
  selectedScope: ReportScope;
  onToggle: () => void;
}

function ReportSelectorCard({
  reportKey,
  config,
  isSelected,
  isCached: cached,
  selectedScope,
  onToggle,
}: Readonly<ReportSelectorCardProps>) {
  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50'
      }`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="w-4 h-4 rounded border-border mt-1"
        aria-label={`Select ${reportKey} report`}
      />
      <div className={`w-10 h-10 ${config.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <span className="material-symbols-outlined text-white">
          {config.icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground capitalize">{reportKey}</p>
          {cached && (
            <span className="text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
              Cached today
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{config.scopes[selectedScope]}</p>
        <p className="text-xs text-muted-foreground mt-1">
          Est. time: {config.estimatedTime[selectedScope]}
        </p>
      </div>
    </label>
  );
}

export default function QualityReportsPage() {
  const [data, setData] = useState<QualityReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedReports, setSelectedReports] = useState<string[]>(['coverage']);
  const [selectedScope, setSelectedScope] = useState<ReportScope>('standard');
  const [lighthouseUrl, setLighthouseUrl] = useState('http://localhost:3000');
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const [showCacheWarning, setShowCacheWarning] = useState<string[]>([]);
  const [showTestModal, setShowTestModal] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const response = await fetch('/api/quality-reports?action=summary');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch quality reports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore generation state on mount
  useEffect(() => {
    const storedJob = getStoredGeneration();
    if (storedJob?.status === 'running') {
      // Resume polling for running job
      setGenerationJob(storedJob);
    }
    fetchReports();
  }, [fetchReports]);

  // Poll for generation status
  useEffect(() => {
    if (generationJob?.status !== 'running') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/quality-reports/status?jobId=${generationJob.id}`);
        const result = await response.json();

        if (result.success && result.data) {
          const updatedJob = result.data as GenerationJob;
          setGenerationJob(updatedJob);
          storeGeneration(updatedJob);

          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            // Mark reports as cached
            for (const result of updatedJob.results.filter(r => r.success)) {
              setCached(result.report);
            }
            fetchReports();
          }
        }
      } catch (error) {
        console.error('Failed to poll generation status:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [generationJob, fetchReports]);

  const handleStartGeneration = async () => {
    if (selectedReports.length === 0) return;

    // Check cache and warn
    const cachedReports = selectedReports.filter(r => isCached(r));
    if (cachedReports.length > 0 && showCacheWarning.length === 0) {
      setShowCacheWarning(cachedReports);
      return;
    }

    // Create new job
    const newJob: GenerationJob = {
      id: `gen-${Date.now()}`,
      reports: selectedReports,
      status: 'running',
      progress: 0,
      results: [],
      startedAt: new Date().toISOString(),
    };

    setGenerationJob(newJob);
    storeGeneration(newJob);
    setShowGenerateModal(false);
    setShowCacheWarning([]);

    // Start generation in background
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/quality-reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: newJob.id,
          reports: selectedReports,
          scope: selectedScope,
          url: lighthouseUrl,
        }),
        signal: abortControllerRef.current.signal,
      });

      const result = await response.json();

      const completedJob: GenerationJob = {
        ...newJob,
        status: result.success ? 'completed' : 'failed',
        progress: 100,
        results: result.data?.results || [],
        completedAt: new Date().toISOString(),
      };

      setGenerationJob(completedJob);
      storeGeneration(completedJob);

      // Mark successful reports as cached
      for (const result of completedJob.results.filter(r => r.success)) {
        setCached(result.report);
      }

      fetchReports();
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;

      const failedJob: GenerationJob = {
        ...newJob,
        status: 'failed',
        progress: 0,
        results: [{
          report: 'error',
          success: false,
          message: error instanceof Error ? error.message : 'Generation failed',
          duration: 0,
        }],
        completedAt: new Date().toISOString(),
      };

      setGenerationJob(failedJob);
      storeGeneration(failedJob);
    }
  };

  const handleDismissProgress = () => {
    clearGeneration();
    setGenerationJob(null);
  };

  const toggleReportSelection = (report: string) => {
    setSelectedReports((prev) =>
      prev.includes(report) ? prev.filter((r) => r !== report) : [...prev, report]
    );
    // Clear cache warning when selection changes
    setShowCacheWarning([]);
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'passing':
        return { icon: 'check_circle', color: 'text-emerald-500', label: 'Passing' };
      case 'failing':
        return { icon: 'cancel', color: 'text-red-500', label: 'Failing' };
      default:
        return { icon: 'help', color: 'text-muted-foreground', label: 'Unknown' };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500';
    if (score >= 70) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const isGenerating = generationJob?.status === 'running';

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Governance', href: '/governance' },
          { label: 'Quality Reports' },
        ]}
        title="Quality Reports"
        description="CI-generated quality reports for Lighthouse, test coverage, and performance"
        actions={[
          {
            label: 'Run Tests',
            icon: 'play_arrow',
            variant: 'secondary',
            onClick: () => setShowTestModal(true),
          },
          {
            label: isGenerating ? 'Generating...' : 'Generate Reports',
            icon: isGenerating ? 'progress_activity' : 'refresh',
            variant: 'primary',
            onClick: () => !isGenerating && setShowGenerateModal(true),
            disabled: isGenerating,
          },
        ]}
        className="mb-8"
      />

      {/* Generation Progress Banner */}
      {generationJob && (
        <GenerationProgressBanner job={generationJob} onDismiss={handleDismissProgress} />
      )}

      {/* Generate Reports Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 cursor-default"
            aria-label="Close modal"
            onClick={() => setShowGenerateModal(false)}
          />
          <Card className="relative z-10 w-full max-w-2xl p-6 m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">Generate Quality Reports</h2>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Cache Warning */}
            {showCacheWarning.length > 0 && (
              <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-amber-500">info</span>
                  <div>
                    <p className="font-medium text-amber-600 dark:text-amber-400">
                      Reports already generated today
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The following reports were already generated today: <strong>{showCacheWarning.join(', ')}</strong>.
                      Running again will overwrite the cached results.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => setShowCacheWarning([])}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleStartGeneration}>
                        Generate Anyway
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Scope Selection */}
            <fieldset className="mb-6 border-0 p-0 m-0">
              <legend className="block text-sm font-medium text-foreground mb-3">
                Report Scope
              </legend>
              <div className="grid grid-cols-3 gap-3">
                {(['quick', 'standard', 'comprehensive'] as ReportScope[]).map((scope) => (
                  <ScopeSelectorButton
                    key={scope}
                    scope={scope}
                    isSelected={selectedScope === scope}
                    onClick={() => setSelectedScope(scope)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Report Selection */}
            <fieldset className="mb-6 border-0 p-0 m-0">
              <legend className="block text-sm font-medium text-foreground mb-3">
                Select Reports
              </legend>
              <div className="space-y-3">
                {Object.entries(reportConfigs).map(([key, config]) => (
                  <ReportSelectorCard
                    key={key}
                    reportKey={key}
                    config={config}
                    isSelected={selectedReports.includes(key)}
                    isCached={isCached(key)}
                    selectedScope={selectedScope}
                    onToggle={() => toggleReportSelection(key)}
                  />
                ))}
              </div>
            </fieldset>

            {/* Lighthouse URL (conditional) */}
            {selectedReports.includes('lighthouse') && (
              <div className="mb-6">
                <label htmlFor="lighthouse-url" className="block text-sm font-medium text-foreground mb-2">
                  Lighthouse Target URL
                </label>
                <input
                  id="lighthouse-url"
                  type="url"
                  value={lighthouseUrl}
                  onChange={(e) => setLighthouseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
                  placeholder="http://localhost:3000"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ensure the app is running at this URL for Lighthouse to analyze
                </p>
              </div>
            )}

            {/* Time Estimate */}
            {selectedReports.length > 0 && (
              <div className="mb-6 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <span className="material-symbols-outlined text-muted-foreground">schedule</span>
                  <span className="text-muted-foreground">
                    Estimated total time:{' '}
                    <strong className="text-foreground">
                      {calculateTimeEstimate(selectedReports, selectedScope)}
                    </strong>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Reports will generate in the background. You can continue using the app.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowGenerateModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartGeneration}
                disabled={selectedReports.length === 0}
                className="flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">play_arrow</span>
                <span>Start Generation ({selectedReports.length})</span>
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Test Runner Modal */}
      <TestRunnerModal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        onComplete={fetchReports}
      />

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-cyan-600 dark:text-cyan-400">
                monitoring
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Reports</p>
              <p className="text-2xl font-bold text-foreground">
                {loading ? '...' : data?.reports.length || 0}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">
                check_circle
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Passing</p>
              <p className="text-2xl font-bold text-foreground">
                {loading ? '...' : data?.reports.filter((r) => r.status === 'passing').length || 0}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-600 dark:text-red-400">
                cancel
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Failing</p>
              <p className="text-2xl font-bold text-foreground">
                {loading ? '...' : data?.reports.filter((r) => r.status === 'failing').length || 0}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                build
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CI Generated</p>
              <p className="text-2xl font-bold text-foreground">
                {loading ? '...' : data?.reports.filter((r) => r.source === 'ci').length || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Reports Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {data?.reports.map((report) => {
          const config = reportConfigs[report.type];
          const statusInfo = getStatusInfo(report.status);
          const hasCached = isCached(report.type);

          return (
            <Link key={report.id} href={`/governance/quality-reports/${report.id}`}>
              <Card className={`p-6 h-full hover:border-primary hover:shadow-md transition-all cursor-pointer ${report.isPlaceholder ? 'border-amber-500/50' : ''}`}>
                {/* Placeholder Warning Banner */}
                {report.isPlaceholder && (
                  <div className="flex items-center gap-2 mb-4 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 dark:text-amber-400 text-xs">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    <span className="flex-1">{report.placeholderReason || 'Placeholder data'}</span>
                  </div>
                )}

                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 ${report.isPlaceholder ? 'bg-muted' : config.color} rounded-lg flex items-center justify-center`}
                    >
                      <span className={`material-symbols-outlined text-2xl ${report.isPlaceholder ? 'text-muted-foreground' : 'text-white'}`}>
                        {config.icon}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{report.name}</h3>
                        {hasCached && !report.isPlaceholder && (
                          <span className="material-symbols-outlined text-xs text-emerald-500" title="Cached today">
                            cached
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{report.type}</p>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-2xl ${statusInfo.color}`}>
                    {statusInfo.icon}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground mb-4">{config.description}</p>

                {report.score !== undefined && !report.isPlaceholder && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Score</span>
                      <span className={`text-2xl font-bold ${getScoreColor(report.score)}`}>
                        {report.score}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getScoreBarColor(report.score)}`}
                        style={{ width: `${report.score}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Failure Summary */}
                {report.status === 'failing' && report.failures && report.failures.length > 0 && (
                  <div className="mb-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <p className="text-xs font-medium text-red-500 mb-1">
                      {report.failures.length} issue{report.failures.length > 1 ? 's' : ''} detected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {report.failures[0].suggestion || 'Click to view details and suggested fixes'}
                    </p>
                  </div>
                )}

                {report.isPlaceholder && (
                  <div className="mb-4 text-center py-4">
                    <span className="text-muted-foreground text-sm">Click &quot;Generate Reports&quot; to create real data</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-4">
                  <span className="flex items-center gap-1">
                    {(() => {
                      const source = getSourceDisplay(report.source);
                      return (
                        <>
                          <span className={`material-symbols-outlined text-sm ${source.className || ''}`}>
                            {source.icon}
                          </span>
                          <span className={source.className}>{source.label}</span>
                        </>
                      );
                    })()}
                  </span>
                  <span>
                    {new Date(report.generatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {loading && (
        <div className="text-center py-16 text-muted-foreground">
          <span className="material-symbols-outlined text-5xl mb-4 animate-spin">
            progress_activity
          </span>
          <p className="text-lg">Loading quality reports...</p>
        </div>
      )}

      {!loading && !data?.reports?.length && (
        <Card className="p-12 text-center">
          <span className="material-symbols-outlined text-5xl text-muted-foreground mb-4">
            info
          </span>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Reports Available</h3>
          <p className="text-muted-foreground mb-4">
            Quality reports are generated during CI/CD pipeline execution.
          </p>
          <Button onClick={() => setShowGenerateModal(true)} className="mt-2">
            Generate Reports Now
          </Button>
        </Card>
      )}
    </>
  );
}
