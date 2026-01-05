/**
 * GET /api/compliance/security-scan
 *
 * RSI endpoint for security scan results.
 * Sources: Trivy, CodeQL, npm audit, pnpm audit
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low';

interface Vulnerability {
  id: string;
  severity: VulnerabilitySeverity;
  package: string;
  title: string;
  fixAvailable: boolean;
}

function normalizeSeverity(severity: string | undefined): VulnerabilitySeverity {
  const normalized = (severity || 'medium').toLowerCase();
  if (normalized === 'critical' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'medium';
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load pnpm audit results
function loadPnpmAudit(): { vulnerabilities: Vulnerability[]; timestamp: string } | null {
  const projectRoot = getProjectRoot();
  const auditPath = join(projectRoot, 'artifacts', 'reports', 'security', 'pnpm-audit-latest.json');

  try {
    if (existsSync(auditPath)) {
      const content = JSON.parse(readFileSync(auditPath, 'utf8'));
      const stats = statSync(auditPath);
      const vulnerabilities: Vulnerability[] = [];

      // Parse pnpm audit format
      if (content.advisories) {
        for (const [id, advisory] of Object.entries(content.advisories as Record<string, any>)) {
          vulnerabilities.push({
            id,
            severity: advisory.severity || 'medium',
            package: advisory.module_name || 'unknown',
            title: advisory.title || 'Unknown vulnerability',
            fixAvailable: !!advisory.patched_versions,
          });
        }
      }

      return {
        vulnerabilities,
        timestamp: stats.mtime.toISOString(),
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Load Trivy scan results
function loadTrivyScan(): { vulnerabilities: Vulnerability[]; timestamp: string } | null {
  const projectRoot = getProjectRoot();
  const trivyPath = join(projectRoot, 'artifacts', 'misc', 'security-scan-results.json');

  try {
    if (existsSync(trivyPath)) {
      const content = JSON.parse(readFileSync(trivyPath, 'utf8'));
      const stats = statSync(trivyPath);
      const vulnerabilities: Vulnerability[] = [];

      // Parse Trivy format
      if (content.Results) {
        for (const result of content.Results) {
          for (const vuln of result.Vulnerabilities || []) {
            vulnerabilities.push({
              id: vuln.VulnerabilityID || 'unknown',
              severity: normalizeSeverity(vuln.Severity),
              package: vuln.PkgName || 'unknown',
              title: vuln.Title || vuln.Description || 'Unknown vulnerability',
              fixAvailable: !!vuln.FixedVersion,
            });
          }
        }
      }

      return {
        vulnerabilities,
        timestamp: stats.mtime.toISOString(),
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const pnpmAudit = loadPnpmAudit();
    const trivyScan = loadTrivyScan();

    // Merge vulnerabilities from all sources
    const allVulnerabilities: Vulnerability[] = [
      ...(pnpmAudit?.vulnerabilities || []),
      ...(trivyScan?.vulnerabilities || []),
    ];

    // Dedupe by ID
    const uniqueVulns = Array.from(
      new Map(allVulnerabilities.map(v => [v.id, v])).values()
    );

    // Calculate severity counts
    const severityCounts = {
      critical: uniqueVulns.filter(v => v.severity === 'critical').length,
      high: uniqueVulns.filter(v => v.severity === 'high').length,
      medium: uniqueVulns.filter(v => v.severity === 'medium').length,
      low: uniqueVulns.filter(v => v.severity === 'low').length,
    };

    // Calculate security score (100 - deductions)
    let score = 100;
    score -= severityCounts.critical * 25;
    score -= severityCounts.high * 10;
    score -= severityCounts.medium * 3;
    score -= severityCounts.low * 1;
    score = Math.max(0, score);

    const status = severityCounts.critical > 0 ? 'critical' :
                   severityCounts.high > 0 ? 'warning' :
                   score >= 80 ? 'passing' : 'warning';

    return NextResponse.json(
      {
        source: pnpmAudit || trivyScan ? 'fresh' : 'unavailable',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        status,
        score,
        summary: {
          total: uniqueVulns.length,
          ...severityCounts,
          fixable: uniqueVulns.filter(v => v.fixAvailable).length,
        },
        sources: {
          pnpmAudit: pnpmAudit ? { count: pnpmAudit.vulnerabilities.length, lastScan: pnpmAudit.timestamp } : null,
          trivy: trivyScan ? { count: trivyScan.vulnerabilities.length, lastScan: trivyScan.timestamp } : null,
        },
        criticalVulnerabilities: uniqueVulns
          .filter(v => v.severity === 'critical')
          .slice(0, 10),
        highVulnerabilities: uniqueVulns
          .filter(v => v.severity === 'high')
          .slice(0, 10),
        recommendation: severityCounts.critical > 0
          ? 'URGENT: Fix critical vulnerabilities immediately'
          : severityCounts.high > 0
          ? 'Fix high severity vulnerabilities before deployment'
          : 'Security posture acceptable',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating security scan report:', error);
    return NextResponse.json(
      { error: 'Failed to generate security scan report', details: String(error) },
      { status: 500 }
    );
  }
}
