/**
 * GET /api/compliance/accessibility
 *
 * RSI endpoint for accessibility compliance metrics.
 * Sources: axe-core scan results, attestation accessibility checks
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

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

function isAccessibilityKpi(kpiName: string): boolean {
  const lower = kpiName.toLowerCase();
  return lower.includes('access') || lower.includes('wcag') || lower.includes('a11y');
}

function extractAccessibilityKpisFromTask(
  taskId: string,
  attestationsDir: string
): { taskId: string; kpi: string; met: boolean }[] {
  const ackPath = join(attestationsDir, taskId, 'context_ack.json');
  if (!existsSync(ackPath)) return [];

  try {
    const content = JSON.parse(readFileSync(ackPath, 'utf8'));
    if (!content.kpi_results) return [];
    return content.kpi_results
      .filter((result: { kpi: string; met: unknown }) => isAccessibilityKpi(result.kpi))
      .map((result: { kpi: string; met: unknown }) => ({
        taskId,
        kpi: result.kpi,
        met: result.met === true,
      }));
  } catch {
    return [];
  }
}

// Check accessibility-related KPIs from attestations
function loadAccessibilityKPIs(): { taskId: string; kpi: string; met: boolean }[] {
  const projectRoot = getProjectRoot();
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const kpis: { taskId: string; kpi: string; met: boolean }[] = [];

  try {
    if (!existsSync(attestationsDir)) return kpis;

    const taskDirs = readdirSync(attestationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const taskId of taskDirs) {
      kpis.push(...extractAccessibilityKpisFromTask(taskId, attestationsDir));
    }
  } catch (error) {
    console.error('Error loading attestations:', error);
  }

  return kpis;
}

export async function GET(_request: NextRequest) {
  try {
    const axeResults = loadAxeResults();
    const accessibilityKPIs = loadAccessibilityKPIs();

    // Compute compliance score
    const issues = axeResults?.issues || [];
    const IMPACT_DEDUCTIONS: Record<string, number> = {
      critical: 25,
      serious: 15,
      moderate: 5,
      minor: 2,
    };
    const totalDeduction = issues.reduce(
      (sum, issue) => sum + (IMPACT_DEDUCTIONS[issue.impact] ?? 0),
      0
    );
    const score = Math.max(0, 100 - totalDeduction);

    const warningOrFailingStatus = score >= 70 ? 'warning' : 'failing';
    const accessibilityStatus = score >= 90 ? 'passing' : warningOrFailingStatus;
    const aOrNonCompliant = score >= 70 ? 'A' : 'Non-compliant';
    const wcagLevel = score >= 90 ? 'AA' : aOrNonCompliant;
    const summary = {
      score,
      status: accessibilityStatus,
      issueCount: {
        critical: issues.filter((i) => i.impact === 'critical').length,
        serious: issues.filter((i) => i.impact === 'serious').length,
        moderate: issues.filter((i) => i.impact === 'moderate').length,
        minor: issues.filter((i) => i.impact === 'minor').length,
      },
      kpisMet: accessibilityKPIs.filter((k) => k.met).length,
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
        wcagLevel,
        lastScan: axeResults?.timestamp || null,
        recommendation:
          score < 90
            ? 'Run: npx axe-core http://localhost:3000 --save artifacts/reports/accessibility-audit.json'
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
