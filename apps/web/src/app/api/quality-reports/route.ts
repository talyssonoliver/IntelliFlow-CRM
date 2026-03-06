import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

interface QualityReport {
  id: string;
  name: string;
  type: 'lighthouse' | 'coverage' | 'performance' | 'debt' | 'sonarqube';
  status: 'passing' | 'failing' | 'unknown';
  score?: number;
  generatedAt: string;
  source: 'ci' | 'manual' | 'placeholder' | 'dynamic';
  htmlPath?: string;
  details?: Record<string, unknown>;
  isPlaceholder?: boolean;
  placeholderReason?: string;
}

interface QualityReportsSummary {
  reports: QualityReport[];
  lastUpdated: string;
  overallHealth: 'good' | 'warning' | 'critical';
}

function findFile(relativePaths: string[]): string | null {
  // Check multiple possible locations for each path
  // The web app runs from apps/web, so we need to navigate to project root
  const cwd = process.cwd();

  // Detect project root by looking for common markers
  let projectRoot = cwd;
  const markers = ['package.json', 'turbo.json', 'pnpm-workspace.yaml'];
  let current = cwd;

  for (let i = 0; i < 5; i++) {
    const hasMarkers = markers.some((m) => fs.existsSync(path.join(current, m)));
    if (hasMarkers && fs.existsSync(path.join(current, 'apps'))) {
      projectRoot = current;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break; // Reached root
    current = parent;
  }

  // Build list of base locations to check
  const baseLocations = [
    projectRoot, // Detected project root (most reliable)
    path.resolve(cwd, '..', '..'), // apps/web -> root
    cwd, // Current directory
    path.resolve(cwd, '..'), // One level up
    path.resolve(cwd, '..', '..', '..'), // Three levels up
  ];

  // Add Windows-specific absolute paths as fallback
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Try common development paths
    const windowsPaths = [
      'C:\\taly\\intelliFlow-CRM',
      'C:/taly/intelliFlow-CRM',
      path.join(process.env.USERPROFILE || '', 'intelliFlow-CRM'),
    ];
    baseLocations.push(...windowsPaths);
  }

  // Remove duplicates
  const uniqueBases = [...new Set(baseLocations.map((p) => path.normalize(p)))];

  for (const relativePath of relativePaths) {
    for (const base of uniqueBases) {
      try {
        const fullPath = path.join(base, relativePath);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      } catch {
        // Continue to next base
      }
    }
  }

  // Debug: log what we tried (only in development)
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

const lighthouseSummaryFormat = z.object({
  scores: lighthouseScoresShape,
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

function parseLighthouseScores(data: unknown): { scores: LighthouseScores; generatedAt: string } {
  // Try summary format first
  const summaryResult = lighthouseSummaryFormat.safeParse(data);
  if (summaryResult.success) {
    return {
      scores: summaryResult.data.scores,
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

      const { scores, generatedAt } = parseLighthouseScores(data);

      const avgScore = Math.round(
        (scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4
      );

      // If we have valid scores, it's not a placeholder
      const hasValidData = avgScore > 0 || Object.values(scores).some((s) => s > 0);

      const scoreStatus: 'passing' | 'failing' = avgScore >= 90 ? 'passing' : 'failing';
      const lighthouseStatus: 'unknown' | 'passing' | 'failing' = isPlaceholder
        ? 'unknown'
        : scoreStatus;

      return {
        id: 'lighthouse',
        name: 'Lighthouse Performance',
        type: 'lighthouse',
        status: lighthouseStatus,
        score: hasValidData ? avgScore : undefined,
        generatedAt,
        source: isPlaceholder ? 'placeholder' : data.source || 'ci',
        htmlPath: '/api/quality-reports/view?report=lighthouse',
        details: { ...scores },
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
  status: 'passing' | 'failing' | 'unknown';
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

function getCoverageReport(): QualityReport {
  // DRY: Single source of truth for coverage data
  const filePath = findFile([
    'artifacts/coverage/coverage-summary.json', // Primary location (vitest output)
    'artifacts/misc/coverage/coverage-summary.json', // Backward compatibility
  ]);

  try {
    if (filePath) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // TDD-friendly metadata from our coverage script
      const meta = (data.meta || {}) as Record<string, unknown>;
      const hasTddMetadata = meta.lastRunAt !== undefined;

      const { overall, details: baseDetails, generatedAt } = parseCoverageData(data, meta);

      // TDD-friendly status: Use metadata status if available
      let details = baseDetails;
      let status: 'passing' | 'failing' | 'unknown';
      let statusMessage: string | undefined;

      if (hasTddMetadata) {
        const metaStatus = resolveCoverageMetaStatus(meta, overall);
        status = metaStatus.status;
        statusMessage = metaStatus.statusMessage;

        // Add test results to details
        if ((meta.testsTotal as number) > 0) {
          details = {
            ...details,
            testsTotal: meta.testsTotal,
            testsPassed: meta.testsPassed,
            testsFailed: meta.testsFailed,
            thresholdsMet: meta.thresholdsMet,
          };
        }
      } else {
        // Fallback: determine status from coverage score
        status = overall >= 90 ? 'passing' : 'failing';
      }

      // Source determination
      const source: 'ci' | 'manual' | 'placeholder' =
        data.source === 'placeholder' ? 'placeholder' : data.source === 'manual' ? 'manual' : 'ci';

      return {
        id: 'coverage',
        name: 'Test Coverage',
        type: 'coverage',
        status,
        score: Math.round(overall),
        generatedAt,
        source,
        htmlPath: '/api/quality-reports/view?report=coverage',
        details: {
          ...details,
          ...(statusMessage && { statusMessage }),
          ...((meta.failingTests as unknown[])?.length > 0 && { failingTests: meta.failingTests }),
        },
        isPlaceholder: false, // TDD: Never show placeholder, always show real data
        placeholderReason: undefined,
      };
    }
  } catch (error) {
    console.error('Failed to read coverage report:', error);
  }

  // No coverage data found
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
    tRPCBench?.p95Time !== undefined ? Math.max(0, 100 - (tRPCBench.p95Time / 50) * 100) : 80;
  const dbScore =
    dbBench?.p95Time !== undefined ? Math.max(0, 100 - (dbBench.p95Time / 20) * 100) : 80;

  const score = Math.min(100, Math.max(0, Math.round((tRPCScore + dbScore) / 2)));

  return {
    passed,
    score,
    generatedAt: (data.timestamp as string) || new Date().toISOString(),
    details: {
      tRPC_p95: tRPCBench?.p95Time !== undefined ? `${tRPCBench.p95Time.toFixed(3)}ms` : 'N/A',
      database_p95: dbBench?.p95Time !== undefined ? `${dbBench.p95Time.toFixed(3)}ms` : 'N/A',
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
      const performanceSource: 'ci' | 'manual' | 'placeholder' = isPlaceholder
        ? 'placeholder'
        : nonPlaceholderSource;

      return {
        id: 'performance',
        name: 'Performance Benchmarks',
        type: 'performance',
        status: passed ? 'passing' : 'failing',
        score,
        generatedAt,
        source: performanceSource,
        htmlPath: '/api/quality-reports/view?report=performance',
        details,
        isPlaceholder: false, // If we have data, it's not a placeholder
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

        // Status based on critical items and overdue
        let status: 'passing' | 'failing' | 'unknown' = 'unknown';
        if (summary?.critical === 0 && summary?.overdue === 0) {
          status = 'passing';
        } else if (summary?.critical > 0 || summary?.overdue > 0) {
          status = 'failing';
        }

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
        const GATE_STATUS_MAP: Record<string, 'passing' | 'failing' | 'unknown'> = {
          OK: 'passing',
          ERROR: 'failing',
          WARN: 'failing',
        };
        const status: 'passing' | 'failing' | 'unknown' = GATE_STATUS_MAP[gateStatus] ?? 'unknown';

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

function getOverallHealth(reports: QualityReport[]): 'good' | 'warning' | 'critical' {
  const passingCount = reports.filter((r) => r.status === 'passing').length;
  const failingCount = reports.filter((r) => r.status === 'failing').length;

  if (failingCount > 0) return 'critical';
  if (passingCount === reports.length) return 'good';
  return 'warning';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const reportId = searchParams.get('id');

  try {
    const reports = [
      getLighthouseReport(),
      getCoverageReport(),
      getPerformanceReport(),
      getDebtReport(),
      getSonarQubeReport(),
    ];

    switch (action) {
      case 'summary': {
        const summary: QualityReportsSummary = {
          reports,
          lastUpdated: new Date().toISOString(),
          overallHealth: getOverallHealth(reports),
        };
        return NextResponse.json({ success: true, data: summary });
      }

      case 'detail': {
        if (!reportId) {
          return NextResponse.json(
            { success: false, error: 'Report ID is required' },
            { status: 400 }
          );
        }
        const report = reports.find((r) => r.id === reportId);
        if (!report) {
          return NextResponse.json({ success: false, error: 'Report not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: report });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Quality Reports API error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
