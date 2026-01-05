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
export const revalidate = 0;

interface QualityMetrics {
  debt: {
    total_items: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    trend: 'up' | 'down' | 'stable';
    lastUpdated: string | null;
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
  };
  phantomAudit: {
    phantomCount: number;
    validCount: number;
    lastUpdated: string | null;
  };
}

async function readJsonFile<T>(filePath: string): Promise<{ data: T | null; lastUpdated: string | null }> {
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
    // Read debt ledger
    const debtPath = path.join(REPORTS_DIR, 'debt-ledger.json');
    const { data: debtData, lastUpdated: debtUpdated } = await readJsonFile<any>(debtPath);

    // Read coverage
    const coveragePath = path.join(ARTIFACTS_DIR, 'coverage', 'coverage-summary.json');
    const { data: coverageData, lastUpdated: coverageUpdated } = await readJsonFile<any>(coveragePath);

    // Read SonarQube metrics
    const sonarPath = path.join(CODE_ANALYSIS_DIR, 'latest.json');
    const { data: sonarData, lastUpdated: sonarUpdated } = await readJsonFile<any>(sonarPath);

    // Read phantom audit
    const phantomPath = path.join(REPORTS_DIR, 'phantom-completion-audit.json');
    const { data: phantomData, lastUpdated: phantomUpdated } = await readJsonFile<any>(phantomPath);

    // Build metrics object
    const metrics: QualityMetrics = {
      debt: {
        total_items: debtData?.items?.length ?? debtData?.total ?? 0,
        critical: debtData?.by_severity?.critical ?? 0,
        high: debtData?.by_severity?.high ?? 0,
        medium: debtData?.by_severity?.medium ?? 0,
        low: debtData?.by_severity?.low ?? 0,
        trend: debtData?.trend ?? 'stable',
        lastUpdated: debtUpdated,
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
      },
      phantomAudit: {
        phantomCount: phantomData?.phantom_count ?? phantomData?.phantoms?.length ?? 0,
        validCount: phantomData?.valid_count ?? 0,
        lastUpdated: phantomUpdated,
      },
    };

    return NextResponse.json({
      status: 'ok',
      metrics,
    });
  } catch (error) {
    console.error('Error reading quality metrics:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
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
      // Run SonarQube metrics
      try {
        const sonarScript = path.join(scriptsDir, 'sonarqube-metrics.js');
        await execAsync(`node "${sonarScript}"`, {
          cwd: path.join(process.cwd(), '..', '..'),
          timeout: 60000,
        });
        results.sonar = 'updated';
      } catch (e) {
        results.sonar = `failed: ${e}`;
      }
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
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
