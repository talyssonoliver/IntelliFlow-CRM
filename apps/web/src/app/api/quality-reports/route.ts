import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

      // Handle both summary format and raw lighthouse format
      let scores: { performance: number; accessibility: number; bestPractices: number; seo: number };
      let generatedAt: string;

      if (data.scores) {
        // Summary format (from CI script or generate route)
        scores = data.scores;
        generatedAt = data.generatedAt || new Date().toISOString();
      } else if (data.categories) {
        // Raw Lighthouse format (from actual Lighthouse run)
        scores = {
          performance: Math.round((data.categories.performance?.score || 0) * 100),
          accessibility: Math.round((data.categories.accessibility?.score || 0) * 100),
          bestPractices: Math.round((data.categories['best-practices']?.score || 0) * 100),
          seo: Math.round((data.categories.seo?.score || 0) * 100),
        };
        generatedAt = data.fetchTime || new Date().toISOString();
      } else {
        throw new Error('Unknown lighthouse report format');
      }

      const avgScore = Math.round(
        (scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4
      );

      // If we have valid scores, it's not a placeholder
      const hasValidData = avgScore > 0 || Object.values(scores).some(s => s > 0);

      return {
        id: 'lighthouse',
        name: 'Lighthouse Performance',
        type: 'lighthouse',
        status: isPlaceholder ? 'unknown' : avgScore >= 90 ? 'passing' : avgScore >= 70 ? 'failing' : 'failing',
        score: hasValidData ? avgScore : undefined,
        generatedAt,
        source: isPlaceholder ? 'placeholder' : (data.source || 'ci'),
        htmlPath: '/api/quality-reports/view?report=lighthouse',
        details: scores,
        isPlaceholder: isPlaceholder && !hasValidData,
        placeholderReason: isPlaceholder && !hasValidData ? (data.message || 'Lighthouse not available') : undefined,
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
      const meta = data.meta || {};
      const hasTddMetadata = meta.lastRunAt !== undefined;

      // Calculate coverage percentages
      let overall: number;
      let details: Record<string, unknown>;
      let generatedAt: string;

      if (data.coverage?.overall !== undefined) {
        // CI summary format (from generate-coverage-report.js)
        overall = data.coverage.overall;
        details = data.coverage;
        generatedAt = data.generatedAt || meta.lastRunAt || new Date().toISOString();
      } else if (data.total?.lines?.pct !== undefined) {
        // Istanbul format (from vitest + our metadata script)
        const total = data.total;
        overall = Math.round(
          (total.lines.pct + total.branches.pct + total.functions.pct + total.statements.pct) / 4
        );
        details = {
          lines: Math.round(total.lines.pct),
          branches: Math.round(total.branches.pct),
          functions: Math.round(total.functions.pct),
          statements: Math.round(total.statements.pct),
        };
        generatedAt = meta.lastRunAt || new Date().toISOString();
      } else {
        throw new Error('Unknown coverage report format');
      }

      // TDD-friendly status: Use metadata status if available
      let status: 'passing' | 'failing' | 'unknown';
      let statusMessage: string | undefined;

      if (hasTddMetadata) {
        // Use TDD metadata for accurate status
        switch (meta.status) {
          case 'passed':
            status = 'passing';
            break;
          case 'partial':
            status = meta.thresholdsMet ? 'passing' : 'failing';
            statusMessage = meta.testsFailed > 0
              ? `${meta.testsPassed}/${meta.testsTotal} tests passing`
              : 'Thresholds not met';
            break;
          case 'failed':
          case 'no-tests':
            status = 'failing';
            statusMessage = meta.status === 'no-tests' ? 'No tests found' : 'Tests failed';
            break;
          default:
            status = overall >= 90 ? 'passing' : 'failing';
        }

        // Add test results to details
        if (meta.testsTotal > 0) {
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
        data.source === 'placeholder' ? 'placeholder' :
        data.source === 'manual' ? 'manual' : 'ci';

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
          ...(meta.failingTests?.length > 0 && { failingTests: meta.failingTests }),
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
      const isPlaceholder = data.source === 'placeholder' || data.message?.includes('not installed');

      // Handle both summary format and raw benchmark format
      let passed: boolean;
      let score: number;
      let generatedAt: string;
      let details: Record<string, unknown>;

      if (data.score !== undefined) {
        // Summary format (from generate route)
        passed = data.passed;
        score = data.score;
        generatedAt = data.generatedAt;
        details = data.metrics || {};
      } else if (data.validation) {
        // Raw benchmark format (existing benchmark files)
        passed = data.validation.all_targets_met === true;

        // Calculate a score based on how well benchmarks meet targets
        const benchmarks = data.benchmarks || [];
        const tRPCBench = benchmarks.find((b: { operation: string }) =>
          b.operation.toLowerCase().includes('trpc')
        );
        const dbBench = benchmarks.find((b: { operation: string }) =>
          b.operation.toLowerCase().includes('database')
        );

        // Score based on p95 times vs targets (lower is better)
        // Target: tRPC < 50ms, DB < 20ms
        const tRPCScore = tRPCBench?.p95Time !== undefined
          ? Math.max(0, 100 - (tRPCBench.p95Time / 50) * 100)
          : 80;
        const dbScore = dbBench?.p95Time !== undefined
          ? Math.max(0, 100 - (dbBench.p95Time / 20) * 100)
          : 80;

        score = Math.round((tRPCScore + dbScore) / 2);
        score = Math.min(100, Math.max(0, score)); // Clamp 0-100

        generatedAt = data.timestamp || new Date().toISOString();
        details = {
          tRPC_p95: tRPCBench?.p95Time !== undefined ? `${tRPCBench.p95Time.toFixed(3)}ms` : 'N/A',
          database_p95: dbBench?.p95Time !== undefined ? `${dbBench.p95Time.toFixed(3)}ms` : 'N/A',
          all_targets_met: passed,
          benchmarks: benchmarks.length,
        };
      } else {
        throw new Error('Unknown performance report format');
      }

      // Synthetic benchmarks (type: 'synthetic') are still valid - just locally generated
      const isSynthetic = data.type === 'synthetic';

      return {
        id: 'performance',
        name: 'Performance Benchmarks',
        type: 'performance',
        status: passed ? 'passing' : 'failing',
        score,
        generatedAt,
        source: isPlaceholder ? 'placeholder' : isSynthetic ? 'manual' : (data.source || 'ci'),
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
    placeholderReason: 'Run code analysis to generate debt report. Uses debt-ledger.yaml as source.',
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
            placeholderReason: 'SonarQube server not available. Start with: docker-compose up sonarqube',
          };
        }

        // Status based on quality gate
        const gateStatus = summary?.gateStatus ?? sonar.qualityGate?.status ?? 'UNKNOWN';
        let status: 'passing' | 'failing' | 'unknown' = 'unknown';
        if (gateStatus === 'OK') status = 'passing';
        else if (gateStatus === 'ERROR' || gateStatus === 'WARN') status = 'failing';

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
    placeholderReason: 'Run code analysis to fetch SonarQube metrics. Requires SonarQube server running.',
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
