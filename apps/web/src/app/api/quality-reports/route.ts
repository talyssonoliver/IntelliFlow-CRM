import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

type ReportStatus = 'passing' | 'failing' | 'unknown';
type ReportSource = 'ci' | 'manual' | 'placeholder' | 'dynamic';
type StaticReportSource = 'ci' | 'manual' | 'placeholder';
type HealthStatus = 'good' | 'warning' | 'critical';

interface QualityReport {
  id: string;
  name: string;
  type: 'lighthouse' | 'coverage' | 'performance' | 'trpc-benchmark' | 'debt' | 'sonarqube';
  status: ReportStatus;
  score?: number;
  generatedAt: string;
  source: ReportSource;
  htmlPath?: string;
  details?: Record<string, unknown>;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

interface QualityReportsSummary {
  reports: QualityReport[];
  lastUpdated: string;
  overallHealth: HealthStatus;
}

const PROJECT_ROOT_MARKERS = ['package.json', 'turbo.json', 'pnpm-workspace.yaml'];

function isProjectRoot(dir: string): boolean {
  const hasMarker = PROJECT_ROOT_MARKERS.some((m) => fs.existsSync(path.join(dir, m)));
  return hasMarker && fs.existsSync(path.join(dir, 'apps'));
}

function detectProjectRoot(cwd: string): string {
  let current = cwd;
  for (let i = 0; i < 5; i++) {
    if (isProjectRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return cwd;
}

function buildBaseLocations(cwd: string, projectRoot: string): string[] {
  const locations = [
    projectRoot,
    path.resolve(cwd, '..', '..'),
    cwd,
    path.resolve(cwd, '..'),
    path.resolve(cwd, '..', '..', '..'),
  ];
  if (process.platform === 'win32') {
    locations.push(
      String.raw`C:\taly\intelliFlow-CRM`,
      'C:/taly/intelliFlow-CRM',
      path.join(process.env.USERPROFILE || '', 'intelliFlow-CRM')
    );
  }
  return [...new Set(locations.map((p) => path.normalize(p)))];
}

function tryFindInBase(base: string, relativePath: string): string | null {
  try {
    const fullPath = path.join(base, relativePath);
    return fs.existsSync(fullPath) ? fullPath : null;
  } catch {
    return null;
  }
}

function findFile(relativePaths: string[]): string | null {
  const cwd = process.cwd();
  const projectRoot = detectProjectRoot(cwd);
  const uniqueBases = buildBaseLocations(cwd, projectRoot);

  for (const relativePath of relativePaths) {
    for (const base of uniqueBases) {
      const found = tryFindInBase(base, relativePath);
      if (found) return found;
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[Quality Reports] File not found. Searched paths:', relativePaths);
    console.log('[Quality Reports] CWD:', cwd);
    console.log('[Quality Reports] Detected project root:', projectRoot);
  }

  return null;
}

interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

// Zod schemas for validating filesystem JSON (external data boundary)
const lighthouseScoresShape = z.object({
  performance: z.number(),
  accessibility: z.number(),
  bestPractices: z.number(),
  seo: z.number(),
});

const lighthouseVitalsShape = z
  .object({
    fcp: z.number().nullable().optional(),
    lcp: z.number().nullable().optional(),
    tbt: z.number().nullable().optional(),
    cls: z.number().nullable().optional(),
    tti: z.number().nullable().optional(),
    si: z.number().nullable().optional(),
    serverResponse: z.number().nullable().optional(),
    jsBytes: z.number().nullable().optional(),
    totalBytes: z.number().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .optional();

const lighthouseSummaryFormat = z.object({
  scores: lighthouseScoresShape,
  vitals: lighthouseVitalsShape,
  generatedAt: z.string().optional(),
});

const lighthouseCategoryScore = z.object({ score: z.number().optional() }).optional();
const lighthouseRawFormat = z.object({
  categories: z.object({
    performance: lighthouseCategoryScore,
    accessibility: lighthouseCategoryScore,
    'best-practices': lighthouseCategoryScore,
    seo: lighthouseCategoryScore,
  }),
  fetchTime: z.string().optional(),
});

function parseLighthouseScores(data: unknown): {
  scores: LighthouseScores;
  generatedAt: string;
  vitals?: Record<string, number | string | null | undefined>;
} {
  // Try summary format first
  const summaryResult = lighthouseSummaryFormat.safeParse(data);
  if (summaryResult.success) {
    return {
      scores: summaryResult.data.scores,
      vitals: summaryResult.data.vitals,
      generatedAt: summaryResult.data.generatedAt || new Date().toISOString(),
    };
  }

  // Try raw Lighthouse format
  const rawResult = lighthouseRawFormat.safeParse(data);
  if (rawResult.success) {
    const cats = rawResult.data.categories;
    return {
      scores: {
        performance: Math.round((cats.performance?.score || 0) * 100),
        accessibility: Math.round((cats.accessibility?.score || 0) * 100),
        bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
        seo: Math.round((cats.seo?.score || 0) * 100),
      },
      generatedAt: rawResult.data.fetchTime || new Date().toISOString(),
    };
  }

  throw new Error('Unknown lighthouse report format');
}

interface LighthouseWebVitals {
  fcp: number | null;
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
  tti: number | null;
  si: number | null;
  serverResponse: number | null;
  jsBytes: number | null;
  totalBytes: number | null;
  url: string | null;
}

function findDirectory(relativePath: string): string | null {
  const cwd = process.cwd();
  const projectRoot = detectProjectRoot(cwd);
  const uniqueBases = buildBaseLocations(cwd, projectRoot);
  for (const base of uniqueBases) {
    try {
      const full = path.join(base, relativePath);
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) return full;
    } catch {
      /* skip */
    }
  }
  return null;
}

function loadLighthouseWebVitals(): LighthouseWebVitals {
  const empty: LighthouseWebVitals = {
    fcp: null,
    lcp: null,
    tbt: null,
    cls: null,
    tti: null,
    si: null,
    serverResponse: null,
    jsBytes: null,
    totalBytes: null,
    url: null,
  };

  const lhciDir = findDirectory('.lighthouseci');
  if (!lhciDir) return empty;

  try {
    const files = fs
      .readdirSync(lhciDir)
      .filter((f) => f.endsWith('.json') && f.startsWith('lhr-'))
      .sort();
    if (files.length === 0) return empty;

    interface LhrRun {
      perf: number;
      data: LighthouseWebVitals & { perf: number };
    }

    const runs: LhrRun[] = files.map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(lhciDir, f), 'utf8'));
      const resourceItems = d.audits?.['resource-summary']?.details?.items ?? [];
      const scriptItem = resourceItems.find(
        (i: { resourceType: string }) => i.resourceType === 'script'
      );
      const totalItem = resourceItems.find(
        (i: { resourceType: string }) => i.resourceType === 'total'
      );
      return {
        perf: d.categories?.performance?.score ?? 0,
        data: {
          perf: d.categories?.performance?.score ?? 0,
          fcp: d.audits?.['first-contentful-paint']?.numericValue ?? null,
          lcp: d.audits?.['largest-contentful-paint']?.numericValue ?? null,
          tbt: d.audits?.['total-blocking-time']?.numericValue ?? null,
          cls: d.audits?.['cumulative-layout-shift']?.numericValue ?? null,
          tti: d.audits?.interactive?.numericValue ?? null,
          si: d.audits?.['speed-index']?.numericValue ?? null,
          serverResponse: d.audits?.['server-response-time']?.numericValue ?? null,
          jsBytes: scriptItem?.transferSize ?? null,
          totalBytes: totalItem?.transferSize ?? null,
          url: d.requestedUrl || d.finalUrl || null,
        },
      };
    });

    // Sort by performance score descending, pick median (skip cold-start outlier)
    runs.sort((a, b) => b.perf - a.perf);
    const rep = runs.length >= 3 ? runs[1] : runs[0];
    return rep.data;
  } catch {
    return empty;
  }
}

function getLighthouseReport(): QualityReport {
  // Check multiple possible file locations
  const filePath = findFile([
    'artifacts/lighthouse/lighthouse-summary.json',
    'artifacts/lighthouse/lighthouse-report.json',
  ]);

  try {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Check if this is explicitly a placeholder report
      const isPlaceholder = data.type === 'unavailable' || data.source === 'placeholder';

      const { scores, generatedAt, vitals: parsedVitals } = parseLighthouseScores(data);

      const avgScore = Math.round(
        (scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4
      );

      // If we have valid scores, it's not a placeholder
      const hasValidData = avgScore > 0 || Object.values(scores).some((s) => s > 0);

      const scoreStatus: 'passing' | 'failing' = avgScore >= 90 ? 'passing' : 'failing';
      const lighthouseStatus: 'unknown' | 'passing' | 'failing' = isPlaceholder
        ? 'unknown'
        : scoreStatus;

      // Prefer vitals embedded in the summary file; fall back to scanning .lighthouseci/
      const hasEmbeddedVitals = parsedVitals && Object.values(parsedVitals).some((v) => v != null);
      const vitals = hasEmbeddedVitals ? parsedVitals : loadLighthouseWebVitals();

      return {
        id: 'lighthouse',
        name: 'Lighthouse Performance',
        type: 'lighthouse',
        status: lighthouseStatus,
        score: hasValidData ? avgScore : undefined,
        generatedAt,
        source: isPlaceholder ? 'placeholder' : data.source || 'ci',
        htmlPath: '/api/quality-reports/view?report=lighthouse',
        details: { ...scores, vitals },
        isPlaceholder: isPlaceholder && !hasValidData,
        placeholderReason:
          isPlaceholder && !hasValidData ? data.message || 'Lighthouse not available' : undefined,
      };
    }
  } catch (error) {
    console.error('Failed to read lighthouse report:', error);
  }

  return {
    id: 'lighthouse',
    name: 'Lighthouse Performance',
    type: 'lighthouse',
    status: 'unknown',
    generatedAt: new Date().toISOString(),
    source: 'placeholder',
    isPlaceholder: true,
    placeholderReason: 'No report generated yet. Click "Generate Reports" to create one.',
  };
}

interface CoverageMetaStatus {
  status: ReportStatus;
  statusMessage?: string;
}

function resolveCoverageMetaStatus(
  meta: Record<string, unknown>,
  overall: number
): CoverageMetaStatus {
  switch (meta.status) {
    case 'passed':
      return { status: 'passing' };
    case 'partial': {
      const status = meta.thresholdsMet ? 'passing' : 'failing';
      const statusMessage =
        (meta.testsFailed as number) > 0
          ? `${meta.testsPassed}/${meta.testsTotal} tests passing`
          : 'Thresholds not met';
      return { status, statusMessage };
    }
    case 'failed':
      return { status: 'failing', statusMessage: 'Tests failed' };
    case 'no-tests':
      return { status: 'failing', statusMessage: 'No tests found' };
    default:
      return { status: overall >= 90 ? 'passing' : 'failing' };
  }
}

interface ParsedCoverageData {
  overall: number;
  details: Record<string, unknown>;
  generatedAt: string;
}

function parseCoverageData(
  data: Record<string, unknown>,
  meta: Record<string, unknown>
): ParsedCoverageData {
  if ((data.coverage as Record<string, unknown>)?.overall !== undefined) {
    const cov = data.coverage as Record<string, unknown>;
    return {
      overall: cov.overall as number,
      details: cov,
      generatedAt:
        (data.generatedAt as string) || (meta.lastRunAt as string) || new Date().toISOString(),
    };
  }
  if ((data.total as Record<string, unknown>)?.lines !== undefined) {
    const total = data.total as Record<string, { pct: number }>;
    return {
      overall: Math.round(
        (total.lines.pct + total.branches.pct + total.functions.pct + total.statements.pct) / 4
      ),
      details: {
        lines: Math.round(total.lines.pct),
        branches: Math.round(total.branches.pct),
        functions: Math.round(total.functions.pct),
        statements: Math.round(total.statements.pct),
      },
      generatedAt: (meta.lastRunAt as string) || new Date().toISOString(),
    };
  }
  throw new Error('Unknown coverage report format');
}

function resolveCoverageSource(dataSource: unknown): StaticReportSource {
  if (dataSource === 'placeholder') return 'placeholder';
  if (dataSource === 'manual') return 'manual';
  return 'ci';
}

function buildCoverageDetails(
  baseDetails: Record<string, unknown>,
  meta: Record<string, unknown>,
  statusMessage: string | undefined
): Record<string, unknown> {
  const hasTddMetadata = meta.lastRunAt !== undefined;
  let details = baseDetails;
  if (hasTddMetadata && (meta.testsTotal as number) > 0) {
    details = {
      ...details,
      testsTotal: meta.testsTotal,
      testsPassed: meta.testsPassed,
      testsFailed: meta.testsFailed,
      thresholdsMet: meta.thresholdsMet,
    };
  }
  return {
    ...details,
    ...(statusMessage && { statusMessage }),
    ...((meta.failingTests as unknown[])?.length > 0 && { failingTests: meta.failingTests }),
  };
}

function getCoverageReport(): QualityReport {
  const filePath = findFile([
    'artifacts/coverage/coverage-summary.json',
    'artifacts/misc/coverage/coverage-summary.json',
  ]);

  try {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const meta = (data.meta || {}) as Record<string, unknown>;
      const hasTddMetadata = meta.lastRunAt !== undefined;
      const { overall, details: baseDetails, generatedAt } = parseCoverageData(data, meta);

      let status: ReportStatus;
      let statusMessage: string | undefined;
      if (hasTddMetadata) {
        const metaStatus = resolveCoverageMetaStatus(meta, overall);
        status = metaStatus.status;
        statusMessage = metaStatus.statusMessage;
      } else {
        status = overall >= 90 ? 'passing' : 'failing';
      }

      return {
        id: 'coverage',
        name: 'Test Coverage',
        type: 'coverage',
        status,
        score: Math.round(overall),
        generatedAt,
        source: resolveCoverageSource(data.source),
        htmlPath: '/api/quality-reports/view?report=coverage',
        details: buildCoverageDetails(baseDetails, meta, statusMessage),
        isPlaceholder: false,
        placeholderReason: undefined,
      };
    }
  } catch (error) {
    console.error('Failed to read coverage report:', error);
  }

  return {
    id: 'coverage',
    name: 'Test Coverage',
    type: 'coverage',
    status: 'unknown',
    generatedAt: new Date().toISOString(),
    source: 'placeholder',
    isPlaceholder: true,
    placeholderReason: 'No coverage data. Run "pnpm test:coverage" to generate.',
  };
}

interface ParsedPerformanceData {
  passed: boolean;
  score: number;
  generatedAt: string;
  details: Record<string, unknown>;
}

function parsePerformanceSummaryFormat(data: Record<string, unknown>): ParsedPerformanceData {
  return {
    passed: data.passed as boolean,
    score: data.score as number,
    generatedAt: data.generatedAt as string,
    details: (data.metrics as Record<string, unknown>) || {},
  };
}

function parsePerformanceBenchmarkFormat(data: Record<string, unknown>): ParsedPerformanceData {
  const validation = data.validation as Record<string, unknown>;
  const passed = validation.all_targets_met === true;
  const benchmarks = (data.benchmarks as Array<{ operation: string; p95Time?: number }>) || [];

  const tRPCBench = benchmarks.find((b) => b.operation.toLowerCase().includes('trpc'));
  const dbBench = benchmarks.find((b) => b.operation.toLowerCase().includes('database'));

  const tRPCScore =
    tRPCBench?.p95Time === undefined ? 80 : Math.max(0, 100 - (tRPCBench.p95Time / 50) * 100);
  const dbScore =
    dbBench?.p95Time === undefined ? 80 : Math.max(0, 100 - (dbBench.p95Time / 20) * 100);

  const score = Math.min(100, Math.max(0, Math.round((tRPCScore + dbScore) / 2)));

  return {
    passed,
    score,
    generatedAt: (data.timestamp as string) || new Date().toISOString(),
    details: {
      tRPC_p95: tRPCBench?.p95Time === undefined ? 'N/A' : `${tRPCBench.p95Time.toFixed(3)}ms`,
      database_p95: dbBench?.p95Time === undefined ? 'N/A' : `${dbBench.p95Time.toFixed(3)}ms`,
      all_targets_met: passed,
      benchmarks: benchmarks.length,
    },
  };
}

function parsePerformanceData(data: Record<string, unknown>): ParsedPerformanceData {
  if (data.score !== undefined) {
    return parsePerformanceSummaryFormat(data);
  }
  if (data.validation) {
    return parsePerformanceBenchmarkFormat(data);
  }
  throw new Error('Unknown performance report format');
}

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

function loadEndpointResults(): EndpointResult[] {
  const baselinePath = findFile(['artifacts/benchmarks/baseline.json']);
  if (!baselinePath) return [];
  try {
    const data = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const apiResults = (data.results?.api || []) as Array<Record<string, unknown>>;
    return apiResults
      .filter((r) => !(r.metadata as Record<string, unknown>)?.aggregate)
      .map((r) => ({
        name: (r.name as string).replace('-', '.'),
        description: r.description as string,
        p50: Math.round(r.p50 as number),
        p95: Math.round(r.p95 as number),
        p99: Math.round(r.p99 as number),
        avgTime: Math.round(r.avgTime as number),
        iterations: r.iterations as number,
        status: r.status as string,
      }));
  } catch {
    return [];
  }
}

function getPerformanceReport(): QualityReport {
  // Check multiple possible file locations
  const filePath = findFile([
    'artifacts/benchmarks/performance-summary.json',
    'artifacts/benchmarks/performance-benchmark.json',
  ]);

  try {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Check for placeholder markers - synthetic benchmarks are still valid data
      const isPlaceholder =
        data.source === 'placeholder' || (data.message as string)?.includes('not installed');

      const { passed, score, generatedAt, details } = parsePerformanceData(data);

      // Synthetic benchmarks (type: 'synthetic') are still valid - just locally generated
      const isSynthetic = data.type === 'synthetic';
      const nonPlaceholderSource: 'ci' | 'manual' = isSynthetic ? 'manual' : data.source || 'ci';
      const performanceSource: StaticReportSource = isPlaceholder
        ? 'placeholder'
        : nonPlaceholderSource;

      // Enrich with per-endpoint data from baseline.json
      const endpoints = loadEndpointResults();

      return {
        id: 'performance',
        name: 'Performance Benchmarks',
        type: 'performance',
        status: passed ? 'passing' : 'failing',
        score,
        generatedAt,
        source: performanceSource,
        htmlPath: '/api/quality-reports/view?report=performance',
        details: { ...details, endpoints },
        isPlaceholder: false,
        placeholderReason: undefined,
      };
    }
  } catch (error) {
    console.error('Failed to read performance report:', error);
  }

  return {
    id: 'performance',
    name: 'Performance Benchmarks',
    type: 'performance',
    status: 'unknown',
    generatedAt: new Date().toISOString(),
    source: 'placeholder',
    isPlaceholder: true,
    placeholderReason: 'No report generated yet. Click "Generate Reports" to create one.',
  };
}

/**
 * Read the tRPC benchmark summary produced by
 * apps/api/src/shared/performance-benchmark.ts.
 *
 * File shape (trpc-benchmark-summary.json):
 *   { generatedAt, kpi, thresholds: { p50, p95, p99 },
 *     totals: { total, completed, passed, failedKpi, errored },
 *     operations: [{ operation, p50, p95, p99, mean, passed, error }],
 *     passed: boolean }
 */
function getTRPCBenchmarkReport(): QualityReport {
  const filePath = findFile(['artifacts/benchmarks/trpc-benchmark-summary.json']);
  const placeholder: QualityReport = {
    id: 'trpc-benchmark',
    name: 'tRPC API Benchmark',
    type: 'trpc-benchmark',
    status: 'unknown',
    generatedAt: new Date().toISOString(),
    source: 'placeholder',
    isPlaceholder: true,
    placeholderReason:
      'No tRPC benchmark generated yet. Run: npx dotenv -e .env.test -- npx tsx apps/api/src/shared/performance-benchmark.ts',
  };

  if (!filePath) return placeholder;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      generatedAt?: string;
      kpi?: string;
      thresholds?: { p50?: number; p95?: number; p99?: number };
      totals?: {
        total: number;
        completed: number;
        passed: number;
        failedKpi: number;
        errored: number;
      };
      operations?: Array<{
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
      }>;
      passed?: boolean;
    };

    const totals = data.totals ?? { total: 0, completed: 0, passed: 0, failedKpi: 0, errored: 0 };
    const status: ReportStatus =
      totals.completed === 0
        ? 'unknown'
        : totals.failedKpi === 0 && totals.errored === 0
          ? 'passing'
          : 'failing';

    // Score = share of completed benchmarks that passed KPI, scaled 0–100.
    const score = totals.completed > 0 ? Math.round((totals.passed / totals.completed) * 100) : 0;

    return {
      id: 'trpc-benchmark',
      name: 'tRPC API Benchmark',
      type: 'trpc-benchmark',
      status,
      score,
      generatedAt: data.generatedAt ?? new Date().toISOString(),
      source: 'manual',
      htmlPath: '/api/quality-reports/view?report=trpc-benchmark',
      details: {
        kpi: data.kpi ?? 'IFC-003',
        thresholds: data.thresholds ?? { p50: 30, p95: 50, p99: 100 },
        totals,
        operations: data.operations ?? [],
      },
      isPlaceholder: false,
    };
  } catch (error) {
    console.error('Failed to read tRPC benchmark report:', error);
    return placeholder;
  }
}

function resolveDebtStatus(summary: Record<string, number> | undefined): ReportStatus {
  if (!summary) return 'unknown';
  if (summary.critical === 0 && summary.overdue === 0) return 'passing';
  if (summary.critical > 0 || summary.overdue > 0) return 'failing';
  return 'unknown';
}

/**
 * Get Technical Debt report from dynamic analysis
 * RSI: Auto-updated from debt-ledger.yaml on each request
 */
function getDebtReport(): QualityReport {
  const filePath = findFile([
    'artifacts/reports/code-analysis/latest.json',
    'artifacts/reports/code-analysis/debt-analysis.json',
  ]);

  try {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (data.debt?.success && data.debt.data) {
        const debt = data.debt.data;
        const summary = data.debt.summary;

        // Health score: 100 = no debt, 0 = critical debt load
        const healthScore = summary?.healthScore ?? debt.healthScore ?? 50;

        const status: ReportStatus = resolveDebtStatus(summary);

        return {
          id: 'debt',
          name: 'Technical Debt',
          type: 'debt',
          status,
          score: healthScore,
          generatedAt: data.timestamp || new Date().toISOString(),
          source: 'dynamic',
          details: {
            total: summary?.total ?? debt.total ?? 0,
            critical: summary?.critical ?? debt.bySeverity?.critical ?? 0,
            high: debt.bySeverity?.high ?? 0,
            medium: debt.bySeverity?.medium ?? 0,
            low: debt.bySeverity?.low ?? 0,
            overdue: summary?.overdue ?? debt.overdueItems?.length ?? 0,
            expiringSoon: debt.expiringSoon?.length ?? 0,
            open: debt.byStatus?.open ?? 0,
            inProgress: debt.byStatus?.inProgress ?? 0,
            resolved: debt.byStatus?.resolved ?? 0,
          },
          isPlaceholder: false,
        };
      }
    }
  } catch (error) {
    console.error('Failed to read debt report:', error);
  }

  return {
    id: 'debt',
    name: 'Technical Debt',
    type: 'debt',
    status: 'unknown',
    generatedAt: new Date().toISOString(),
    source: 'placeholder',
    isPlaceholder: true,
    placeholderReason:
      'Run code analysis to generate debt report. Uses debt-ledger.yaml as source.',
  };
}

/**
 * Get SonarQube metrics report
 * RSI: Auto-fetches from SonarQube API when available
 */
function getSonarQubeReport(): QualityReport {
  const filePath = findFile([
    'artifacts/reports/code-analysis/latest.json',
    'artifacts/reports/code-analysis/sonarqube-metrics.json',
  ]);

  try {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (data.sonarqube?.success && data.sonarqube.data) {
        const sonar = data.sonarqube.data;
        const summary = data.sonarqube.summary;

        if (!sonar.available) {
          return {
            id: 'sonarqube',
            name: 'SonarQube Quality',
            type: 'sonarqube',
            status: 'unknown',
            generatedAt: data.timestamp || new Date().toISOString(),
            source: 'dynamic',
            isPlaceholder: true,
            placeholderReason:
              'SonarQube server not available. Start with: docker-compose up sonarqube',
          };
        }

        // Status based on quality gate
        const gateStatus = summary?.gateStatus ?? sonar.qualityGate?.status ?? 'UNKNOWN';
        const GATE_STATUS_MAP: Record<string, ReportStatus> = {
          OK: 'passing',
          ERROR: 'failing',
          WARN: 'failing',
        };
        const status: ReportStatus = GATE_STATUS_MAP[gateStatus] ?? 'unknown';

        return {
          id: 'sonarqube',
          name: 'SonarQube Quality',
          type: 'sonarqube',
          status,
          score: summary?.healthScore ?? sonar.healthScore ?? 0,
          generatedAt: data.timestamp || new Date().toISOString(),
          source: 'dynamic',
          details: {
            bugs: summary?.bugs ?? sonar.bugs ?? 0,
            vulnerabilities: summary?.vulnerabilities ?? sonar.vulnerabilities ?? 0,
            codeSmells: sonar.codeSmells ?? 0,
            coverage: summary?.coverage ?? sonar.coverage ?? 0,
            duplications: sonar.duplications ?? 0,
            debtRatio: sonar.debtRatio ?? 0,
            reliabilityRating: sonar.reliabilityRating ?? 'N/A',
            securityRating: sonar.securityRating ?? 'N/A',
            maintainabilityRating: sonar.maintainabilityRating ?? 'N/A',
            qualityGate: gateStatus,
          },
          isPlaceholder: false,
        };
      }
    }
  } catch (error) {
    console.error('Failed to read sonarqube report:', error);
  }

  return {
    id: 'sonarqube',
    name: 'SonarQube Quality',
    type: 'sonarqube',
    status: 'unknown',
    generatedAt: new Date().toISOString(),
    source: 'placeholder',
    isPlaceholder: true,
    placeholderReason:
      'Run code analysis to fetch SonarQube metrics. Requires SonarQube server running.',
  };
}

function getOverallHealth(reports: QualityReport[]): HealthStatus {
  const passingCount = reports.filter((r) => r.status === 'passing').length;
  const failingCount = reports.filter((r) => r.status === 'failing').length;

  if (failingCount > 0) return 'critical';
  if (passingCount === reports.length) return 'good';
  return 'warning';
}

function getAllReports(): QualityReport[] {
  return [
    getLighthouseReport(),
    getCoverageReport(),
    getPerformanceReport(),
    getTRPCBenchmarkReport(),
    getDebtReport(),
    getSonarQubeReport(),
  ];
}

function handleSummaryAction(reports: QualityReport[]) {
  const summary: QualityReportsSummary = {
    reports,
    lastUpdated: new Date().toISOString(),
    overallHealth: getOverallHealth(reports),
  };
  return NextResponse.json({ success: true, data: summary });
}

function handleDetailAction(reports: QualityReport[], reportId: string | null) {
  if (!reportId) {
    return NextResponse.json({ success: false, error: 'Report ID is required' }, { status: 400 });
  }
  const report = reports.find((r) => r.id === reportId);
  if (!report) {
    return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: report });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const reportId = searchParams.get('id');

  try {
    const reports = getAllReports();

    if (action === 'summary') return handleSummaryAction(reports);
    if (action === 'detail') return handleDetailAction(reports, reportId);

    return NextResponse.json(
      { success: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Quality Reports API error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
