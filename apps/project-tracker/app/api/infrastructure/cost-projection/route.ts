/**
 * GET /api/infrastructure/cost-projection
 *
 * RSI endpoint for infrastructure cost projections.
 * Sources: Cloud usage, budget data, Sprint_plan.csv investment gates
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CostItem {
  service: string;
  category: 'compute' | 'storage' | 'database' | 'ai' | 'saas' | 'other';
  monthlyCost: number;
  annualCost: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

interface InvestmentGate {
  taskId: string;
  sprint: number;
  amount: number;
  description: string;
  status: 'pending' | 'approved' | 'completed';
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Load Sprint_plan.csv to find investment gates
function loadInvestmentGates(): InvestmentGate[] {
  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
  const gates: InvestmentGate[] = [];

  try {
    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, 'utf8');
      const results = Papa.parse(content, { header: true, skipEmptyLines: true });

      // Known investment gate tasks
      const gateTaskIds = ['IFC-019', 'IFC-027', 'IFC-034', 'IFC-049'];
      const gateAmounts: Record<string, number> = {
        'IFC-019': 500,  // Gate 1: £500
        'IFC-027': 2000, // Gate 2: £2000
        'IFC-034': 3000, // Gate 3: £3000
        'IFC-049': 5000, // Gate 4: £5000
      };

      for (const row of results.data as RawCSVRow[]) {
        const taskId = row['Task ID'];
        if (taskId && gateTaskIds.includes(taskId)) {
          const status = row['Status']?.toLowerCase();
          gates.push({
            taskId,
            sprint: parseInt(String(row['Target Sprint'] ?? '0')) || 0,
            amount: gateAmounts[taskId] || 0,
            description: row['Description'] || '',
            status: status === 'completed' || status === 'done' ? 'completed' :
                    status === 'in progress' ? 'approved' : 'pending',
          });
        }
      }
    }
  } catch (error) {
    console.error('Error loading investment gates:', error);
  }

  return gates.sort((a, b) => a.sprint - b.sprint);
}

// Calculate current and projected costs
function calculateCosts(): CostItem[] {
  const costs: CostItem[] = [];

  // Development phase costs (free tier heavy)
  costs.push({
    service: 'Supabase (Database + Auth)',
    category: 'database',
    monthlyCost: 0, // Free tier
    annualCost: 0,
    trend: 'stable',
  });

  costs.push({
    service: 'Vercel (Hosting)',
    category: 'compute',
    monthlyCost: 0, // Free tier / hobby
    annualCost: 0,
    trend: 'stable',
  });

  costs.push({
    service: 'OpenAI API',
    category: 'ai',
    monthlyCost: 20, // Estimated dev usage
    annualCost: 240,
    trend: 'increasing',
  });

  costs.push({
    service: 'GitHub (Actions)',
    category: 'compute',
    monthlyCost: 0, // Free tier
    annualCost: 0,
    trend: 'stable',
  });

  costs.push({
    service: 'Domain + SSL',
    category: 'other',
    monthlyCost: 1.5,
    annualCost: 18,
    trend: 'stable',
  });

  costs.push({
    service: 'Sentry (Error Tracking)',
    category: 'saas',
    monthlyCost: 0, // Free tier
    annualCost: 0,
    trend: 'stable',
  });

  return costs;
}

export async function GET(request: NextRequest) {
  try {
    const investmentGates = loadInvestmentGates();
    const currentCosts = calculateCosts();

    // Calculate totals
    const monthlyTotal = currentCosts.reduce((sum, c) => sum + c.monthlyCost, 0);
    const annualTotal = currentCosts.reduce((sum, c) => sum + c.annualCost, 0);

    // Investment tracking
    const totalInvestment = investmentGates.reduce((sum, g) => sum + g.amount, 0);
    const completedInvestment = investmentGates
      .filter(g => g.status === 'completed')
      .reduce((sum, g) => sum + g.amount, 0);
    const pendingInvestment = totalInvestment - completedInvestment;

    // Project cost by category
    const byCategory = currentCosts.reduce((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + c.monthlyCost;
      return acc;
    }, {} as Record<string, number>);

    // Production projection (when scaling)
    const productionProjection = {
      monthly: {
        supabase: 25,  // Pro plan
        vercel: 20,    // Pro plan
        openai: 100,   // Increased usage
        monitoring: 29, // Better observability
        other: 10,
      },
      total: 184,
    };

    return NextResponse.json(
      {
        source: 'fresh',
        timestamp: new Date().toISOString(),
        pattern: 'RSI',
        currency: 'GBP',
        current: {
          monthlyTotal,
          annualTotal,
          byCategory,
          services: currentCosts,
        },
        investmentGates: {
          total: totalInvestment,
          completed: completedInvestment,
          pending: pendingInvestment,
          gates: investmentGates,
        },
        projections: {
          development: {
            monthly: monthlyTotal,
            annual: annualTotal,
            phase: 'MVP Development',
          },
          production: {
            monthly: productionProjection.total,
            annual: productionProjection.total * 12,
            phase: 'Production (estimated)',
            breakdown: productionProjection.monthly,
          },
        },
        runway: {
          currentBudget: 500, // Gate 1 approved
          monthlyBurn: monthlyTotal,
          monthsRemaining: monthlyTotal > 0 ? Math.floor(500 / monthlyTotal) : 'unlimited',
        },
        recommendation: monthlyTotal < 50
          ? 'Costs optimized - within development budget'
          : 'Consider optimizing AI API usage',
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating cost projection:', error);
    return NextResponse.json(
      { error: 'Failed to generate cost projection', details: String(error) },
      { status: 500 }
    );
  }
}
