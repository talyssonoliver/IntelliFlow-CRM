/**
 * GET /api/infrastructure/budget-status
 *
 * RSI endpoint for budget tracking and financial status.
 * Sources: Sprint_plan.csv investment gates, cost tracking, attestations
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BudgetLine {
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
  status: 'under' | 'on-track' | 'over';
}

interface MilestonePayment {
  milestone: string;
  taskId: string;
  amount: number;
  status: 'pending' | 'approved' | 'released';
  releaseDate?: string;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load budget data from Sprint_plan and attestations
function loadBudgetData(): { lines: BudgetLine[]; milestones: MilestonePayment[] } {
  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');

  const lines: BudgetLine[] = [];
  const milestones: MilestonePayment[] = [];

  // Default budget allocation (from project planning)
  const budgetAllocation: Record<string, number> = {
    'Infrastructure': 200,
    'AI/ML Services': 150,
    'Development Tools': 50,
    'Third-party SaaS': 50,
    'Contingency': 50,
  };

  // Estimated spend (would come from actual tracking in production)
  const estimatedSpend: Record<string, number> = {
    'Infrastructure': 0,     // Using free tiers
    'AI/ML Services': 20,    // OpenAI dev usage
    'Development Tools': 0,  // Free tools
    'Third-party SaaS': 0,   // Free tiers
    'Contingency': 0,
  };

  for (const [category, allocated] of Object.entries(budgetAllocation)) {
    const spent = estimatedSpend[category] || 0;
    lines.push({
      category,
      allocated,
      spent,
      remaining: allocated - spent,
      status: spent > allocated ? 'over' : spent > allocated * 0.8 ? 'on-track' : 'under',
    });
  }

  // Load milestone/gate payments from Sprint_plan
  try {
    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, 'utf8');
      const results = Papa.parse(content, { header: true, skipEmptyLines: true });

      // Investment gates
      const gates: Record<string, { name: string; amount: number }> = {
        'IFC-010': { name: 'Phase 1 Go/No-Go', amount: 0 },  // Decision point, no payment
        'IFC-019': { name: 'Gate 1 - £500 Review', amount: 500 },
        'IFC-027': { name: 'Gate 2 - £2000 Investment', amount: 2000 },
        'IFC-034': { name: 'Gate 3 - £3000 Investment', amount: 3000 },
        'IFC-049': { name: 'Gate 4 - £5000 Investment', amount: 5000 },
      };

      for (const row of results.data as RawCSVRow[]) {
        const taskId = row['Task ID'];
        if (taskId && gates[taskId]) {
          const status = row['Status']?.toLowerCase();
          milestones.push({
            milestone: gates[taskId].name,
            taskId,
            amount: gates[taskId].amount,
            status: status === 'completed' || status === 'done' ? 'released' :
                    status === 'in progress' ? 'approved' : 'pending',
          });
        }
      }
    }
  } catch (error) {
    console.error('Error loading milestone data:', error);
  }

  return { lines, milestones: milestones.sort((a, b) => a.taskId.localeCompare(b.taskId)) };
}

export async function GET(_request: NextRequest) {
  try {
    const { lines, milestones } = loadBudgetData();

    // Calculate totals
    const totalAllocated = lines.reduce((sum, l) => sum + l.allocated, 0);
    const totalSpent = lines.reduce((sum, l) => sum + l.spent, 0);
    const totalRemaining = totalAllocated - totalSpent;

    // Milestone funding totals
    const totalFunding = milestones.reduce((sum, m) => sum + m.amount, 0);
    const releasedFunding = milestones
      .filter(m => m.status === 'released')
      .reduce((sum, m) => sum + m.amount, 0);
    const pendingFunding = totalFunding - releasedFunding;

    // Budget health
    const spendPercentage = Math.round((totalSpent / totalAllocated) * 100);
    const health = spendPercentage < 50 ? 'healthy' :
                   spendPercentage < 80 ? 'moderate' :
                   spendPercentage < 100 ? 'caution' : 'over-budget';

    // Burn rate (monthly)
    const monthlyBurn = totalSpent; // Simplified - would calculate from historical data

    // Runway calculation
    const currentFunds = releasedFunding;
    const runway = monthlyBurn > 0 ? Math.floor((currentFunds - totalSpent) / monthlyBurn) : 'unlimited';

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        currency: 'GBP',
        summary: {
          allocated: totalAllocated,
          spent: totalSpent,
          remaining: totalRemaining,
          spendPercentage,
          health,
        },
        funding: {
          total: totalFunding,
          released: releasedFunding,
          pending: pendingFunding,
          milestones,
        },
        budgetLines: lines,
        burnRate: {
          monthly: monthlyBurn,
          runway: runway === 'unlimited' ? 'Unlimited (no burn)' : `${runway} months`,
        },
        alerts: lines
          .filter(l => l.status === 'over' || (l.status === 'on-track' && l.remaining < 20))
          .map(l => ({
            category: l.category,
            message: l.status === 'over'
              ? `Over budget by £${Math.abs(l.remaining)}`
              : `Only £${l.remaining} remaining`,
            severity: l.status === 'over' ? 'high' : 'medium',
          })),
        nextMilestone: milestones.find(m => m.status === 'pending') || null,
        recommendation: health === 'healthy'
          ? 'Budget utilization is optimal'
          : health === 'over-budget'
          ? 'URGENT: Review and reduce spending'
          : 'Monitor spending closely',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating budget status:', error);
    return NextResponse.json(
      { error: 'Failed to generate budget status', details: String(error) },
      { status: 500 }
    );
  }
}
