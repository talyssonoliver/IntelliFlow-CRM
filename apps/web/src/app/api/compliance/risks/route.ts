import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { Risk, RiskHeatMapResponse, RiskSummary, RiskStatus, RiskProbability, RiskImpact } from '../types';

// Find project root by looking for package.json
function findProjectRoot(startDir: string): string {
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      // Check if this is the monorepo root (has turbo.json or pnpm-workspace.yaml)
      if (
        fs.existsSync(path.join(currentDir, 'turbo.json')) ||
        fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))
      ) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

function loadRiskData(): Risk[] {
  const projectRoot = findProjectRoot(process.cwd());
  const riskRegisterPath = path.join(projectRoot, 'artifacts', 'misc', 'risk-register.json');

  try {
    if (fs.existsSync(riskRegisterPath)) {
      const content = fs.readFileSync(riskRegisterPath, 'utf-8');
      const data = JSON.parse(content);
      return data.risks || [];
    }
  } catch (error) {
    console.error('Failed to load risk register:', error);
  }

  return [];
}

function calculateSummary(risks: Risk[]): RiskSummary {
  const byStatus: Record<RiskStatus, number> = {
    accepted: 0,
    mitigated: 0,
    requires_action: 0,
  };

  const byProbability: Record<RiskProbability, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  const byImpact: Record<RiskImpact, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  for (const risk of risks) {
    byStatus[risk.status]++;
    byProbability[risk.probability]++;
    byImpact[risk.impact]++;
  }

  return {
    total: risks.length,
    byStatus,
    byProbability,
    byImpact,
  };
}

export async function GET() {
  try {
    const risks = loadRiskData();
    const summary = calculateSummary(risks);

    const response: RiskHeatMapResponse = {
      risks,
      summary,
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(
      { success: true, data: response },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Risk API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load risk data' },
      { status: 500 }
    );
  }
}
