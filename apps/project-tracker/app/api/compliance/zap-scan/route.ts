/**
 * GET /api/compliance/zap-scan
 *
 * RSI endpoint for OWASP ZAP scan results.
 * Source: ZAP scan report JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

type ZapRisk = 'High' | 'Medium' | 'Low' | 'Informational';

const RISK_LEVELS: readonly ZapRisk[] = ['Informational', 'Low', 'Medium', 'High'] as const;

interface ZapAlert {
  id: string;
  name: string;
  riskcode: number;
  risk: ZapRisk;
  confidence: string;
  description: string;
  solution: string;
  count: number;
  cweid: string;
}

function getRiskFromCode(riskcode: number): ZapRisk {
  const index = Math.max(0, Math.min(riskcode, 3));
  return RISK_LEVELS[index];
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

function parseZapAlert(alert: any): ZapAlert {
  const riskcode = Number.parseInt(alert.riskcode) || 0;
  return {
    id: alert.pluginid || 'unknown',
    name: alert.name || 'Unknown alert',
    riskcode,
    risk: getRiskFromCode(riskcode),
    confidence: alert.confidence || 'Medium',
    description: alert.desc || '',
    solution: alert.solution || '',
    count: Number.parseInt(alert.count) || 1,
    cweid: alert.cweid || '',
  };
}

// Load ZAP scan report
function loadZapReport(): { alerts: ZapAlert[]; timestamp: string; site: string } | null {
  const zapPath = join(getProjectRoot(), 'artifacts', 'reports', 'zap-scan-report.json');

  if (!existsSync(zapPath)) return null;

  try {
    const content = JSON.parse(readFileSync(zapPath, 'utf8'));
    const stats = statSync(zapPath);
    const alerts: ZapAlert[] = (content.site || []).flatMap((site: any) =>
      (site.alerts || []).map(parseZapAlert)
    );
    return {
      alerts,
      timestamp: stats.mtime.toISOString(),
      site: content.site?.[0]?.['@name'] || 'unknown',
    };
  } catch {
    return null;
  }
}

const CWE_TO_OWASP: Array<[number[], string]> = [
  [[79, 80], 'A03:2021 - Injection'],
  [[287, 306, 384], 'A07:2021 - Auth Failures'],
  [[200, 209, 497], 'A01:2021 - Broken Access'],
  [[311, 319, 523], 'A02:2021 - Crypto Failures'],
  [[16, 614], 'A05:2021 - Security Misconfig'],
];

function getCweCategory(cwe: number): string {
  for (const [cwes, category] of CWE_TO_OWASP) {
    if (cwes.includes(cwe)) return category;
  }
  return 'Other';
}

function buildOwaspMapping(alerts: ZapAlert[]): Map<string, string[]> {
  const mapping = new Map<string, string[]>();
  for (const alert of alerts) {
    if (!alert.cweid) continue;
    const cwe = Number.parseInt(alert.cweid);
    const category = getCweCategory(cwe);
    if (!mapping.has(category)) mapping.set(category, []);
    mapping.get(category)!.push(alert.name);
  }
  return mapping;
}

export async function GET(_request: NextRequest) {
  try {
    const zapReport = loadZapReport();

    if (!zapReport) {
      return NextResponse.json(
        {
          source: 'unavailable',
          timestamp: new Date().toISOString(),
          pattern: 'RSI',
          message:
            'No ZAP scan report available. Run: zap-cli quick-scan http://localhost:3000 --output-format json',
          status: 'unknown',
          recommendation: 'Run OWASP ZAP scan to assess web application security',
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, max-age=0',
          },
        }
      );
    }

    const alerts = zapReport.alerts;

    // Count by risk level
    const riskCounts = {
      high: alerts.filter((a) => a.risk === 'High').length,
      medium: alerts.filter((a) => a.risk === 'Medium').length,
      low: alerts.filter((a) => a.risk === 'Low').length,
      informational: alerts.filter((a) => a.risk === 'Informational').length,
    };

    // Calculate OWASP compliance score
    let score = 100;
    score -= riskCounts.high * 20;
    score -= riskCounts.medium * 8;
    score -= riskCounts.low * 2;
    score = Math.max(0, score);

    let zapStatus: string;
    if (riskCounts.high > 0) {
      zapStatus = 'failing';
    } else if (riskCounts.medium > 0) {
      zapStatus = 'warning';
    } else {
      zapStatus = 'passing';
    }
    const mediumOrSafeRecommendation =
      riskCounts.medium > 0
        ? 'Review and remediate medium-risk findings'
        : 'Web application security posture is acceptable';
    const zapRecommendation =
      riskCounts.high > 0
        ? 'CRITICAL: Address high-risk vulnerabilities before production'
        : mediumOrSafeRecommendation;

    // Map to OWASP Top 10 categories
    const owaspMapping = buildOwaspMapping(alerts);

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        status: zapStatus,
        score,
        site: zapReport.site,
        lastScan: zapReport.timestamp,
        summary: {
          total: alerts.length,
          ...riskCounts,
        },
        owaspCategories: Object.fromEntries(
          Array.from(owaspMapping.entries()).map(([cat, issues]) => [cat, issues.length])
        ),
        highRiskAlerts: alerts
          .filter((a) => a.risk === 'High')
          .map((a) => ({
            name: a.name,
            description: a.description.substring(0, 200),
            solution: a.solution.substring(0, 200),
            cweid: a.cweid,
          })),
        mediumRiskAlerts: alerts
          .filter((a) => a.risk === 'Medium')
          .slice(0, 5)
          .map((a) => ({
            name: a.name,
            count: a.count,
          })),
        recommendation: zapRecommendation,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating ZAP scan report:', error);
    return NextResponse.json(
      { error: 'Failed to generate ZAP scan report', details: String(error) },
      { status: 500 }
    );
  }
}
