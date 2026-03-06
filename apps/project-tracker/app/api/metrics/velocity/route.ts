/**
 * GET /api/metrics/velocity
 *
 * Returns velocity data combining config from velocity-prediction.json
 * with calculated actuals from Sprint_plan.csv
 */

import { NextResponse } from 'next/server';
import { loadCSVTasks } from '@/lib/governance';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

interface VelocityConfig {
  schemaVersion: string;
  taskId: string;
  generatedAt?: string;
  config?: {
    sprintLengthDays: number;
    targetVelocity: number;
    forecastErrorThreshold?: number;
    minVelocityWarning?: number;
    velocityGoal?: string;
  };
  forecast?: {
    method?: string;
    lookbackSprints?: number;
    sprintLengthDays?: number;
    predictedVelocityPoints?: number | null;
    confidence?: number | null;
    confidenceThresholds?: {
      high: number;
      medium: number;
      low: number;
    };
    notes?: string;
  };
  notes?: string;
}

interface SprintBar {
  sprint: number;
  velocity: number;
  percentage: number;
  planned: number;
  completed: number;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

function computeVelocityTrend(sprintBars: SprintBar[]): 'improving' | 'stable' | 'declining' {
  const recentSprints = sprintBars.slice(-3);
  const previousSprints = sprintBars.slice(-6, -3);
  if (recentSprints.length < 2 || previousSprints.length < 1) return 'stable';
  const avgRecent = recentSprints.reduce((sum, s) => sum + s.velocity, 0) / recentSprints.length;
  const avgPrevious =
    previousSprints.reduce((sum, s) => sum + s.velocity, 0) / previousSprints.length;
  if (avgRecent > avgPrevious * 1.1) return 'improving';
  if (avgRecent < avgPrevious * 0.9) return 'declining';
  return 'stable';
}

function computeConfidence(
  avgVelocity: number | null,
  thresholds: { high: number; medium: number; low: number }
): 'high' | 'medium' | 'low' {
  if (avgVelocity === null) return 'low';
  if (avgVelocity >= thresholds.high) return 'high';
  if (avgVelocity >= thresholds.medium) return 'medium';
  return 'low';
}

function computeHealthStatus(
  currentVelocity: number,
  minVelocityWarning: number,
  targetVelocity: number
): 'healthy' | 'warning' | 'critical' {
  if (currentVelocity < minVelocityWarning) return 'critical';
  if (currentVelocity < targetVelocity) return 'warning';
  return 'healthy';
}

function loadVelocityConfig(): VelocityConfig | null {
  const projectRoot = getProjectRoot();
  const configPath = join(projectRoot, 'artifacts', 'misc', 'velocity-prediction.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf8');
    return JSON.parse(content) as VelocityConfig;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const config = loadVelocityConfig();
    const allTasks = loadCSVTasks();

    if (!allTasks.length) {
      return NextResponse.json({ error: 'No tasks found' }, { status: 404 });
    }

    // Filter sprint tasks only (exclude Continuous)
    const sprintTasks = allTasks.filter((t) => typeof t.sprint === 'number');

    // Calculate velocity by sprint
    const sprintMap = new Map<number, { planned: number; completed: number }>();

    for (const task of sprintTasks) {
      const sprint = task.sprint as number;
      if (!sprintMap.has(sprint)) {
        sprintMap.set(sprint, { planned: 0, completed: 0 });
      }
      const counts = sprintMap.get(sprint)!;
      counts.planned++;

      const status = task.status.toLowerCase();
      if (status === 'completed' || status === 'done') {
        counts.completed++;
      }
    }

    // Calculate sprint bars for visualization
    const sprintBars: SprintBar[] = Array.from(sprintMap.entries())
      .map(([sprint, counts]) => {
        const velocity =
          counts.planned > 0 ? Math.round((counts.completed / counts.planned) * 100) : 0;
        return {
          sprint,
          velocity,
          percentage: velocity, // For bar height
          planned: counts.planned,
          completed: counts.completed,
        };
      })
      .sort((a, b) => a.sprint - b.sprint);

    // Calculate overall velocity
    const totalPlanned = sprintTasks.length;
    const totalCompleted = sprintTasks.filter((t) => {
      const status = t.status.toLowerCase();
      return status === 'completed' || status === 'done';
    }).length;
    const currentVelocity =
      totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

    // Calculate trend from recent sprints
    const trend = computeVelocityTrend(sprintBars);

    // Get target velocity from config or use default
    const targetVelocity = config?.config?.targetVelocity ?? 80;
    const sprintLengthDays = config?.config?.sprintLengthDays ?? 14;
    const minVelocityWarning = config?.config?.minVelocityWarning ?? 50;

    // Calculate forecast for next sprint using rolling average
    const lookbackSprints = config?.forecast?.lookbackSprints ?? 3;
    const lastCompletedSprints = sprintBars.filter((s) => s.completed > 0).slice(-lookbackSprints);
    const avgVelocity =
      lastCompletedSprints.length > 0
        ? Math.round(
            lastCompletedSprints.reduce((sum, s) => sum + s.velocity, 0) /
              lastCompletedSprints.length
          )
        : null;

    const confidenceThresholds = config?.forecast?.confidenceThresholds ?? {
      high: 80,
      medium: 60,
      low: 40,
    };
    const confidence = computeConfidence(avgVelocity, confidenceThresholds);
    const healthStatus = computeHealthStatus(currentVelocity, minVelocityWarning, targetVelocity);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        config: {
          sprintLengthDays,
          targetVelocity,
          minVelocityWarning,
          forecastErrorThreshold: config?.config?.forecastErrorThreshold ?? 20,
          velocityGoal: config?.config?.velocityGoal ?? 'Maintain target velocity',
        },
        actual: {
          currentVelocity,
          trend,
          healthStatus,
          totalPlanned,
          totalCompleted,
          sprintCount: sprintBars.length,
          bySprintBars: sprintBars,
        },
        forecast: {
          nextSprintPrediction: avgVelocity,
          confidence,
          method: config?.forecast?.method ?? 'rolling-3-sprint-average',
          lookbackSprints,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Error generating velocity data:', error);
    return NextResponse.json(
      { error: 'Failed to generate velocity data', details: String(error) },
      { status: 500 }
    );
  }
}
