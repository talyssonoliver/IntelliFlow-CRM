import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');
const CODE_ANALYSIS_DIR = path.join(REPORTS_DIR, 'code-analysis');

export const dynamic = 'force-dynamic';

interface QualityMetrics {
  debt: {
    total_items: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    trend: 'up' | 'down' | 'stable';
    healthScore: number;
    lastUpdated: string | null;
    history: Array<{ date: string; total: number; critical: number }>;
  };
  coverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
    lastUpdated: string | null;
  };
  sonarqube: {
    qualityGate: string;
    bugs: number;
    vulnerabilities: number;
    codeSmells: number;
    duplications: number;
    lastUpdated: string | null;
    history: Array<{ date: string; bugs: number; vulnerabilities: number; codeSmells: number }>;
  };
  phantomAudit: {
    phantomCount: number;
    validCount: number;
    lastUpdated: string | null;
  };
  cadenceFreshness: {
    total: number;
    fresh: number;
    stale: number;
    missing: number;
    freshnessScore: string;
    lastUpdated: string | null;
  };
}

async function readJsonFile<T>(
  filePath: string
): Promise<{ data: T | null; lastUpdated: string | null }> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    return {
      data: JSON.parse(content),
      lastUpdated: stats.mtime.toISOString(),
    };
  } catch {
    return { data: null, lastUpdated: null };
  }
}

export async function GET() {
  try {
    // Read debt-analysis.json for quality metrics
    const debtPath = path.join(CODE_ANALYSIS_DIR, 'debt-analysis.json');
    const { data: debtData, lastUpdated: debtUpdated } = await readJsonFile<any>(debtPath);

    // Read coverage
    const coveragePath = path.join(ARTIFACTS_DIR, 'coverage', 'coverage-summary.json');
    const { data: coverageData, lastUpdated: coverageUpdated } =
      await readJsonFile<any>(coveragePath);

    // BUG-2 FIX: Read sonarqube-metrics.json (not latest.json)
    const sonarPath = path.join(CODE_ANALYSIS_DIR, 'sonarqube-metrics.json');
    const { data: sonarData, lastUpdated: sonarUpdated } = await readJsonFile<any>(sonarPath);

    // Read phantom audit
    const phantomPath = path.join(REPORTS_DIR, 'phantom-completion-audit.json');
    const { data: phantomData, lastUpdated: phantomUpdated } = await readJsonFile<any>(phantomPath);

    // Read cadence freshness report
    const cadencePath = path.join(REPORTS_DIR, 'cadence-freshness-report.json');
    const { data: cadenceData, lastUpdated: cadenceUpdated } = await readJsonFile<any>(cadencePath);

    // FEAT-2: Read history files
    const debtHistoryPath = path.join(CODE_ANALYSIS_DIR, 'debt-history.json');
    const { data: debtHistoryData } = await readJsonFile<any>(debtHistoryPath);

    const sonarHistoryPath = path.join(CODE_ANALYSIS_DIR, 'sonarqube-history.json');
    const { data: sonarHistoryData } = await readJsonFile<any>(sonarHistoryPath);

    // Build metrics object
    const metrics: QualityMetrics = {
      debt: {
        // BUG-1 FIX: Use bySeverity (not by_severity), summary.total, trending.trend
        total_items: debtData?.summary?.total ?? debtData?.items?.length ?? 0,
        critical: debtData?.bySeverity?.critical ?? 0,
        high: debtData?.bySeverity?.high ?? 0,
        medium: debtData?.bySeverity?.medium ?? 0,
        low: debtData?.bySeverity?.low ?? 0,
        trend: debtData?.trending?.trend ?? 'stable',
        healthScore: debtData?.healthScore ?? 0,
        lastUpdated: debtUpdated,
        history: Array.isArray(debtHistoryData) ? debtHistoryData : [],
      },
      coverage: {
        lines: coverageData?.total?.lines?.pct ?? 0,
        branches: coverageData?.total?.branches?.pct ?? 0,
        functions: coverageData?.total?.functions?.pct ?? 0,
        statements: coverageData?.total?.statements?.pct ?? 0,
        lastUpdated: coverageUpdated,
      },
      sonarqube: {
        qualityGate: sonarData?.qualityGate ?? sonarData?.status ?? 'Unknown',
        bugs: sonarData?.bugs ?? sonarData?.measures?.bugs ?? 0,
        vulnerabilities: sonarData?.vulnerabilities ?? sonarData?.measures?.vulnerabilities ?? 0,
        codeSmells: sonarData?.codeSmells ?? sonarData?.measures?.code_smells ?? 0,
        duplications: sonarData?.duplications ?? sonarData?.measures?.duplicated_lines_density ?? 0,
        lastUpdated: sonarUpdated,
        history: Array.isArray(sonarHistoryData) ? sonarHistoryData : [],
      },
      phantomAudit: {
        // BUG-4 FIX: Use summary.phantom_completions / summary.verified_completions
        phantomCount: phantomData?.summary?.phantom_completions ?? 0,
        validCount: phantomData?.summary?.verified_completions ?? 0,
        lastUpdated: phantomUpdated,
      },
      cadenceFreshness: {
        total: cadenceData?.summary?.total ?? 0,
        fresh: cadenceData?.summary?.fresh ?? 0,
        stale: cadenceData?.summary?.stale ?? 0,
        missing: cadenceData?.summary?.missing ?? 0,
        freshnessScore: cadenceData?.summary?.freshness_score ?? '0%',
        lastUpdated: cadenceUpdated,
      },
    };

    return NextResponse.json({
      status: 'ok',
      metrics,
    });
  } catch (error) {
    console.error('Error reading quality metrics:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'all';

  try {
    const results: Record<string, any> = {};
    const scriptsDir = path.join(process.cwd(), '..', '..', 'scripts');

    if (type === 'all' || type === 'debt') {
      // Run debt analyzer
      try {
        const debtScript = path.join(scriptsDir, 'debt-analyzer.js');
        await execAsync(`node "${debtScript}" --save`, {
          cwd: path.join(process.cwd(), '..', '..'),
          timeout: 60000,
        });
        results.debt = 'updated';
      } catch (e) {
        results.debt = `failed: ${e}`;
      }
    }

    if (type === 'all' || type === 'sonar') {
      // BUG-3 FIX: Add --save flag to sonarqube-metrics exec
      try {
        const sonarScript = path.join(scriptsDir, 'sonarqube-metrics.js');
        await execAsync(`node "${sonarScript}" --save`, {
          cwd: path.join(process.cwd(), '..', '..'),
          timeout: 60000,
        });
        results.sonar = 'updated';
      } catch (e) {
        results.sonar = `failed: ${e}`;
      }
    }

    // FEAT-5: Phantom refresh re-reads phantom audit file (no script to run)
    if (type === 'phantom') {
      results.phantom = 're-read';
    }

    // Re-read metrics after update
    const response = await GET();
    const data = await response.json();

    return NextResponse.json({
      status: 'ok',
      message: 'Quality metrics refreshed',
      results,
      metrics: data.metrics,
    });
  } catch (error) {
    console.error('Error refreshing quality metrics:', error);
    return NextResponse.json({ status: 'error', message: String(error) }, { status: 500 });
  }
}
