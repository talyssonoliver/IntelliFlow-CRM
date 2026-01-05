/**
 * GET /api/sprint/baseline
 *
 * RSI endpoint for sprint baseline data.
 * Sources: Sprint_plan.csv, sprint summary files
 * Fallback: artifacts/reports/sprint{N}-baseline-latest.json
 * Query: ?sprint=N
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface BaselineTask {
  taskId: string;
  description: string;
  section: string;
  dependencies: string[];
  prerequisites: string[];
  targetSprint: number | string;
  estimatedEffort?: string;
  priority?: string;
}

interface SprintBaseline {
  sprintNumber: number;
  plannedTasks: number;
  plannedSections: string[];
  dependencies: { internal: number; external: number };
  criticalPath: string[];
  riskFactors: string[];
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Get fallback file path pattern
function getFallbackPath(sprintNumber: number): string {
  const projectRoot = getProjectRoot();
  return join(projectRoot, 'artifacts', 'reports', `sprint${sprintNumber}-baseline-latest.json`);
}

// Load fallback data if exists
function loadFallback(sprintNumber: number): any | null {
  const fallbackPath = getFallbackPath(sprintNumber);
  try {
    if (existsSync(fallbackPath)) {
      return JSON.parse(readFileSync(fallbackPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Save generated data as fallback for future use
function saveFallback(sprintNumber: number, data: any): void {
  const fallbackPath = getFallbackPath(sprintNumber);
  try {
    writeFileSync(fallbackPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving fallback:', error);
  }
}

// Load sprint baseline from CSV
function loadSprintBaseline(sprintNumber: number): { tasks: BaselineTask[]; baseline: SprintBaseline } {
  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
  const tasks: BaselineTask[] = [];
  const sections = new Set<string>();
  let internalDeps = 0;
  let externalDeps = 0;
  const criticalPath: string[] = [];

  try {
    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, 'utf8');
      const results = Papa.parse(content, { header: true, skipEmptyLines: true });

      for (const row of results.data as RawCSVRow[]) {
        const targetSprint = row['Target Sprint'];
        const sprintNum = targetSprint === 'Continuous' ? -1 : parseInt(String(targetSprint ?? ''));

        if (sprintNum === sprintNumber) {
          const dependencies = (row['Dependencies'] || '').split(',').map((d: string) => d.trim()).filter(Boolean);
          const prerequisites = (row['Pre-requisites'] || '').split(',').map((p: string) => p.trim()).filter(Boolean);

          tasks.push({
            taskId: row['Task ID'] || '',
            description: row['Description'] || '',
            section: row['Section'] || '',
            dependencies,
            prerequisites,
            targetSprint: sprintNum,
            estimatedEffort: String((row as Record<string, unknown>)['Effort'] ?? (row as Record<string, unknown>)['Story Points'] ?? ''),
            priority: String((row as Record<string, unknown>)['Priority'] ?? ''),
          });

          sections.add(row['Section'] || 'Unknown');

          // Count dependencies
          for (const dep of dependencies) {
            if (dep.startsWith('IFC-') || dep.startsWith('ENV-') || dep.startsWith('AI-')) {
              internalDeps++;
            } else {
              externalDeps++;
            }
          }

          // Tasks with many dependencies are on critical path
          if (dependencies.length >= 2 && row['Task ID']) {
            criticalPath.push(row['Task ID']);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading sprint baseline:', error);
  }

  // Identify risk factors
  const riskFactors: string[] = [];
  if (tasks.length > 30) riskFactors.push('High task count may cause resource contention');
  if (internalDeps > 20) riskFactors.push('Many internal dependencies - blocking risk');
  if (criticalPath.length > 5) riskFactors.push('Long critical path - schedule risk');
  if (sections.size > 5) riskFactors.push('Many sections - coordination overhead');

  return {
    tasks,
    baseline: {
      sprintNumber,
      plannedTasks: tasks.length,
      plannedSections: Array.from(sections),
      dependencies: { internal: internalDeps, external: externalDeps },
      criticalPath: criticalPath.slice(0, 10),
      riskFactors,
    },
  };
}

// Load sprint summary if available
function loadSprintSummary(sprintNumber: number): any | null {
  const projectRoot = getProjectRoot();
  const summaryPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', `sprint-${sprintNumber}`, '_summary.json');

  try {
    if (existsSync(summaryPath)) {
      return JSON.parse(readFileSync(summaryPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sprintNumber = parseInt(searchParams.get('sprint') || '0');

    const { tasks, baseline } = loadSprintBaseline(sprintNumber);
    const summary = loadSprintSummary(sprintNumber);

    // Calculate baseline metrics
    const tasksBySection = tasks.reduce((acc, t) => {
      if (!acc[t.section]) acc[t.section] = [];
      acc[t.section].push(t.taskId);
      return acc;
    }, {} as Record<string, string[]>);

    // Dependency graph analysis
    const dependencyGraph: Record<string, string[]> = {};
    for (const task of tasks) {
      dependencyGraph[task.taskId] = task.dependencies;
    }

    // Find tasks with no dependencies (can start immediately)
    const readyToStart = tasks
      .filter(t => t.dependencies.length === 0)
      .map(t => t.taskId);

    // Find tasks blocking others
    const blockingTasks: Record<string, number> = {};
    for (const task of tasks) {
      for (const dep of task.dependencies) {
        blockingTasks[dep] = (blockingTasks[dep] || 0) + 1;
      }
    }
    const topBlockers = Object.entries(blockingTasks)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([taskId, count]) => ({ taskId, blocksCount: count }));

    // Build response data
    const responseData = {
      source: 'fresh',
      timestamp: new Date().toISOString(),
      pattern: 'RSI',
      sprint: sprintNumber,
      fallbackPath: getFallbackPath(sprintNumber),
      baseline,
      tasksBySection,
      scheduling: {
        readyToStart,
        topBlockers,
        parallelizationPotential: readyToStart.length > 3 ? 'High' : readyToStart.length > 1 ? 'Medium' : 'Low',
      },
      existingSummary: summary ? {
        totalTasks: summary.total_tasks,
        completedTasks: summary.completed_tasks,
        lastUpdated: summary.updated_at,
      } : null,
      dependencyGraph,
      tasks: tasks.map(t => ({
        taskId: t.taskId,
        description: t.description.substring(0, 80),
        section: t.section,
        dependencyCount: t.dependencies.length,
        prerequisiteCount: t.prerequisites.length,
      })),
      recommendation: baseline.riskFactors.length > 0
        ? `Address risks: ${baseline.riskFactors[0]}`
        : 'Sprint baseline looks healthy',
    };

    // If no fresh data available, try fallback
    if (tasks.length === 0) {
      const fallbackData = loadFallback(sprintNumber);
      if (fallbackData) {
        return NextResponse.json(
          { ...fallbackData, source: 'fallback' },
          {
            headers: {
              'Cache-Control': 'no-store, no-cache, max-age=0',
            },
          }
        );
      }
    }

    // Save fresh data as fallback for future use
    saveFallback(sprintNumber, responseData);

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating sprint baseline:', error);
    return NextResponse.json(
      { error: 'Failed to generate sprint baseline', details: String(error) },
      { status: 500 }
    );
  }
}
