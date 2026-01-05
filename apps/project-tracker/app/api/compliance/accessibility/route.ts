/**
 * GET /api/compliance/accessibility
 *
 * RSI endpoint for accessibility compliance metrics.
 * Sources: axe-core scan results, attestation accessibility checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AccessibilityIssue {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  nodes: number;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load axe-core results if available
function loadAxeResults(): { issues: AccessibilityIssue[]; timestamp: string } | null {
  const projectRoot = getProjectRoot();
  const axePath = join(projectRoot, 'artifacts', 'misc', 'accessibility-audit.json');

  try {
    if (existsSync(axePath)) {
      const content = JSON.parse(readFileSync(axePath, 'utf8'));
      return {
        issues: content.violations || [],
        timestamp: content.timestamp || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Check accessibility-related KPIs from attestations
function loadAccessibilityKPIs(): { taskId: string; kpi: string; met: boolean }[] {
  const projectRoot = getProjectRoot();
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const kpis: { taskId: string; kpi: string; met: boolean }[] = [];

  try {
    if (!existsSync(attestationsDir)) return kpis;

    const taskDirs = readdirSync(attestationsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const taskId of taskDirs) {
      const ackPath = join(attestationsDir, taskId, 'context_ack.json');
      if (existsSync(ackPath)) {
        try {
          const content = JSON.parse(readFileSync(ackPath, 'utf8'));
          if (content.kpi_results) {
            for (const result of content.kpi_results) {
              if (result.kpi.toLowerCase().includes('access') ||
                  result.kpi.toLowerCase().includes('wcag') ||
                  result.kpi.toLowerCase().includes('a11y')) {
                kpis.push({
                  taskId,
                  kpi: result.kpi,
                  met: result.met === true,
                });
              }
            }
          }
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch (error) {
    console.error('Error loading attestations:', error);
  }

  return kpis;
}

export async function GET(request: NextRequest) {
  try {
    const axeResults = loadAxeResults();
    const accessibilityKPIs = loadAccessibilityKPIs();

    // Compute compliance score
    let score = 100;
    const issues = axeResults?.issues || [];

    for (const issue of issues) {
      switch (issue.impact) {
        case 'critical': score -= 25; break;
        case 'serious': score -= 15; break;
        case 'moderate': score -= 5; break;
        case 'minor': score -= 2; break;
      }
    }
    score = Math.max(0, score);

    const summary = {
      score,
      status: score >= 90 ? 'passing' : score >= 70 ? 'warning' : 'failing',
      issueCount: {
        critical: issues.filter(i => i.impact === 'critical').length,
        serious: issues.filter(i => i.impact === 'serious').length,
        moderate: issues.filter(i => i.impact === 'moderate').length,
        minor: issues.filter(i => i.impact === 'minor').length,
      },
      kpisMet: accessibilityKPIs.filter(k => k.met).length,
      kpisTotal: accessibilityKPIs.length,
    };

    return NextResponse.json(
      {
        source: axeResults ? 'fresh' : 'unavailable',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        summary,
        issues: issues.slice(0, 20), // Top 20 issues
        kpis: accessibilityKPIs,
        wcagLevel: score >= 90 ? 'AA' : score >= 70 ? 'A' : 'Non-compliant',
        lastScan: axeResults?.timestamp || null,
        recommendation: score < 90
          ? 'Run: npx axe-core http://localhost:3000 --save artifacts/misc/accessibility-audit.json'
          : 'Accessibility standards met',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating accessibility report:', error);
    return NextResponse.json(
      { error: 'Failed to generate accessibility report', details: String(error) },
      { status: 500 }
    );
  }
}
