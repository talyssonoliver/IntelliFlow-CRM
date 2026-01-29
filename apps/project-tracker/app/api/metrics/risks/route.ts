/**
 * GET /api/metrics/risks
 *
 * Returns risk data parsed from risk-matrix.md
 * Extracts the risk register table and calculates summary statistics
 */

import { NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Risk {
  id: string;
  risk: string;
  category: string;
  probability: string;
  impact: string;
  score: number;
  status: string;
  owner: string;
}

interface RiskSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  mitigated: number;
  monitoring: number;
  accepted: number;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

function parseRiskMatrix(): { risks: Risk[]; summary: RiskSummary } {
  const projectRoot = getProjectRoot();
  const matrixPath = join(projectRoot, 'artifacts', 'reports', 'risk-matrix.md');

  const defaultSummary: RiskSummary = {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    mitigated: 0,
    monitoring: 0,
    accepted: 0,
  };

  if (!existsSync(matrixPath)) {
    return { risks: [], summary: defaultSummary };
  }

  try {
    const content = readFileSync(matrixPath, 'utf8');
    const lines = content.split('\n');

    const risks: Risk[] = [];
    let inRiskTable = false;
    let headerParsed = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Look for the risk register table
      if (trimmed.startsWith('| ID |') || trimmed.startsWith('|ID|')) {
        inRiskTable = true;
        headerParsed = false;
        continue;
      }

      // Skip separator rows
      if (trimmed.startsWith('|---') || trimmed.startsWith('|-')) {
        headerParsed = true;
        continue;
      }

      // End of table
      if (inRiskTable && !trimmed.startsWith('|')) {
        inRiskTable = false;
        continue;
      }

      // Parse risk rows
      if (inRiskTable && headerParsed && trimmed.startsWith('|')) {
        const cells = trimmed
          .split('|')
          .map(c => c.trim())
          .filter(c => c !== '');

        if (cells.length >= 8 && cells[0].match(/^R\d+$/)) {
          risks.push({
            id: cells[0],
            risk: cells[1],
            category: cells[2],
            probability: cells[3],
            impact: cells[4],
            score: parseInt(cells[5], 10) || 0,
            status: cells[6],
            owner: cells[7],
          });
        }
      }
    }

    // Calculate summary
    const summary: RiskSummary = {
      total: risks.length,
      critical: risks.filter(r => r.impact === 'Critical').length,
      high: risks.filter(r => r.impact === 'High').length,
      medium: risks.filter(r => r.impact === 'Medium').length,
      low: risks.filter(r => r.impact === 'Low').length,
      mitigated: risks.filter(r => r.status.toLowerCase() === 'mitigated').length,
      monitoring: risks.filter(r => r.status.toLowerCase() === 'monitoring').length,
      accepted: risks.filter(r => r.status.toLowerCase() === 'accepted').length,
    };

    return { risks, summary };
  } catch (error) {
    console.error('Error parsing risk matrix:', error);
    return { risks: [], summary: defaultSummary };
  }
}

function getScoreLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 9) return 'critical';
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

export async function GET() {
  try {
    const { risks, summary } = parseRiskMatrix();

    // Sort risks by score descending (highest risk first)
    const sortedRisks = [...risks].sort((a, b) => b.score - a.score);

    // Add score level to each risk
    const enrichedRisks = sortedRisks.map(risk => ({
      ...risk,
      scoreLevel: getScoreLevel(risk.score),
    }));

    // Calculate overall risk score (weighted average)
    const overallScore = risks.length > 0
      ? Math.round(risks.reduce((sum, r) => sum + r.score, 0) / risks.length * 10) / 10
      : 0;

    // Determine overall risk level
    let overallLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (summary.critical > 0) overallLevel = 'critical';
    else if (summary.high > 2) overallLevel = 'high';
    else if (summary.medium > 3 || summary.high > 0) overallLevel = 'medium';

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      risks: enrichedRisks,
      summary: {
        ...summary,
        overallScore,
        overallLevel,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating risk data:', error);
    return NextResponse.json(
      { error: 'Failed to generate risk data', details: String(error) },
      { status: 500 }
    );
  }
}
