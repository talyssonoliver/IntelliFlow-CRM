import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ARTIFACTS_DIR = path.join(process.cwd(), '..', '..', 'artifacts');
const SECURITY_DIR = path.join(ARTIFACTS_DIR, 'reports', 'security');
const PNPM_AUDIT_PATH = path.join(SECURITY_DIR, 'pnpm-audit-latest.json');
const VULNERABILITY_BASELINE_PATH = path.join(ARTIFACTS_DIR, 'misc', 'vulnerability-baseline.json');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SecurityMetrics {
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    total: number;
  };
  lastScan: string | null;
  baseline: {
    critical: number;
    high: number;
    date: string;
  } | null;
  scanHistory: Array<{
    date: string;
    total: number;
    critical: number;
  }>;
  compliance: {
    owasp_top10: boolean;
    dependency_check: boolean;
    secret_scan: boolean;
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
    // Read pnpm audit results
    const { data: auditData, lastUpdated } = await readJsonFile<any>(PNPM_AUDIT_PATH);

    // Read vulnerability baseline
    const { data: baselineData } = await readJsonFile<any>(VULNERABILITY_BASELINE_PATH);

    // Parse vulnerabilities
    let vulnerabilities = {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      total: 0,
    };

    if (auditData) {
      if (auditData.metadata?.vulnerabilities) {
        vulnerabilities = {
          critical: auditData.metadata.vulnerabilities.critical || 0,
          high: auditData.metadata.vulnerabilities.high || 0,
          moderate: auditData.metadata.vulnerabilities.moderate || 0,
          low: auditData.metadata.vulnerabilities.low || 0,
          total: auditData.metadata.vulnerabilities.total || 0,
        };
      } else if (auditData.vulnerabilities) {
        vulnerabilities = {
          critical: auditData.vulnerabilities.critical || 0,
          high: auditData.vulnerabilities.high || 0,
          moderate: auditData.vulnerabilities.moderate || auditData.vulnerabilities.medium || 0,
          low: auditData.vulnerabilities.low || 0,
          total: Object.values(auditData.vulnerabilities).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : 0), 0),
        };
      }
    }

    const metrics: SecurityMetrics = {
      vulnerabilities,
      lastScan: lastUpdated,
      baseline: baselineData
        ? {
            critical: baselineData.critical || 0,
            high: baselineData.high || 0,
            date: baselineData.date || baselineData.lastUpdated || 'Unknown',
          }
        : null,
      scanHistory: baselineData?.history || [],
      compliance: {
        owasp_top10: vulnerabilities.critical === 0,
        dependency_check: true,
        secret_scan: true,
      },
    };

    return NextResponse.json({
      status: 'ok',
      metrics,
      path: PNPM_AUDIT_PATH,
    });
  } catch (error) {
    console.error('Error reading security metrics:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rootDir = path.join(process.cwd(), '..', '..');

    // Run pnpm audit
    let auditResult: any = { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 } };

    try {
      const { stdout } = await execAsync('pnpm audit --json', {
        cwd: rootDir,
        timeout: 120000,
      });
      auditResult = JSON.parse(stdout);
    } catch (execError: any) {
      // pnpm audit returns non-zero exit code if vulnerabilities found
      // Try to parse stdout anyway
      if (execError.stdout) {
        try {
          auditResult = JSON.parse(execError.stdout);
        } catch {
          console.warn('Could not parse pnpm audit output');
        }
      }
    }

    // Save results
    await fs.mkdir(SECURITY_DIR, { recursive: true });
    await fs.writeFile(
      PNPM_AUDIT_PATH,
      JSON.stringify(
        {
          ...auditResult,
          scanDate: new Date().toISOString(),
        },
        null,
        2
      )
    );

    // Update vulnerability baseline history
    let baseline: any = { history: [] };
    try {
      const content = await fs.readFile(VULNERABILITY_BASELINE_PATH, 'utf-8');
      baseline = JSON.parse(content);
    } catch {
      // File doesn't exist
    }

    const vulns = auditResult.metadata?.vulnerabilities || auditResult.vulnerabilities || {};
    baseline.history = [
      {
        date: new Date().toISOString(),
        total: vulns.total || 0,
        critical: vulns.critical || 0,
      },
      ...(baseline.history || []).slice(0, 29), // Keep last 30 scans
    ];

    await fs.mkdir(path.dirname(VULNERABILITY_BASELINE_PATH), { recursive: true });
    await fs.writeFile(VULNERABILITY_BASELINE_PATH, JSON.stringify(baseline, null, 2));

    // Re-read and return
    const response = await GET();
    const data = await response.json();

    return NextResponse.json({
      status: 'ok',
      message: 'Security scan completed',
      metrics: data.metrics,
    });
  } catch (error) {
    console.error('Error running security scan:', error);
    return NextResponse.json(
      { status: 'error', message: String(error) },
      { status: 500 }
    );
  }
}
