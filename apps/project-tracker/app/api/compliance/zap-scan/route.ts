/**
 * GET /api/compliance/zap-scan
 *
 * RSI endpoint for OWASP ZAP scan results.
 * Source: ZAP scan report JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

// Load ZAP scan report
function loadZapReport(): { alerts: ZapAlert[]; timestamp: string; site: string } | null {
  const projectRoot = getProjectRoot();
  const zapPath = join(projectRoot, 'artifacts', 'reports', 'zap-scan-report.json');

  try {
    if (existsSync(zapPath)) {
      const content = JSON.parse(readFileSync(zapPath, 'utf8'));
      const stats = statSync(zapPath);
      const alerts: ZapAlert[] = [];

      // Parse ZAP JSON format
      if (content.site) {
        for (const site of content.site) {
          for (const alert of site.alerts || []) {
            const riskcode = parseInt(alert.riskcode) || 0;
            alerts.push({
              id: alert.pluginid || 'unknown',
              name: alert.name || 'Unknown alert',
              riskcode,
              risk: getRiskFromCode(riskcode),
              confidence: alert.confidence || 'Medium',
              description: alert.desc || '',
              solution: alert.solution || '',
              count: parseInt(alert.count) || 1,
              cweid: alert.cweid || '',
            });
          }
        }
      }

      return {
        alerts,
        timestamp: stats.mtime.toISOString(),
        site: content.site?.[0]?.['@name'] || 'unknown',
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
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
          message: 'No ZAP scan report available. Run: zap-cli quick-scan http://localhost:3000 --output-format json',
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
      high: alerts.filter(a => a.risk === 'High').length,
      medium: alerts.filter(a => a.risk === 'Medium').length,
      low: alerts.filter(a => a.risk === 'Low').length,
      informational: alerts.filter(a => a.risk === 'Informational').length,
    };

    // Calculate OWASP compliance score
    let score = 100;
    score -= riskCounts.high * 20;
    score -= riskCounts.medium * 8;
    score -= riskCounts.low * 2;
    score = Math.max(0, score);

    const status = riskCounts.high > 0 ? 'failing' :
                   riskCounts.medium > 0 ? 'warning' : 'passing';

    // Map to OWASP Top 10 categories
    const owaspMapping = new Map<string, string[]>();
    for (const alert of alerts) {
      if (alert.cweid) {
        // Simplified CWE to OWASP mapping
        const cwe = parseInt(alert.cweid);
        let category = 'Other';
        if ([79, 80].includes(cwe)) category = 'A03:2021 - Injection';
        if ([287, 306, 384].includes(cwe)) category = 'A07:2021 - Auth Failures';
        if ([200, 209, 497].includes(cwe)) category = 'A01:2021 - Broken Access';
        if ([311, 319, 523].includes(cwe)) category = 'A02:2021 - Crypto Failures';
        if ([16, 614].includes(cwe)) category = 'A05:2021 - Security Misconfig';

        if (!owaspMapping.has(category)) owaspMapping.set(category, []);
        owaspMapping.get(category)!.push(alert.name);
      }
    }

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        status,
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
          .filter(a => a.risk === 'High')
          .map(a => ({
            name: a.name,
            description: a.description.substring(0, 200),
            solution: a.solution.substring(0, 200),
            cweid: a.cweid,
          })),
        mediumRiskAlerts: alerts
          .filter(a => a.risk === 'Medium')
          .slice(0, 5)
          .map(a => ({
            name: a.name,
            count: a.count,
          })),
        recommendation: riskCounts.high > 0
          ? 'CRITICAL: Address high-risk vulnerabilities before production'
          : riskCounts.medium > 0
          ? 'Review and remediate medium-risk findings'
          : 'Web application security posture is acceptable',
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
