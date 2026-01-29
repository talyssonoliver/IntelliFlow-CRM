/**
 * GET /api/sprint/progress
 *
 * RSI endpoint for sprint progress reports.
 * Sources: Sprint_plan.csv, phase summaries, attestations
 * Fallback: artifacts/reports/sprint{N}-progress-*.md
 * Query: ?sprint=N&format=md|json
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TaskProgress {
  taskId: string;
  description: string;
  status: string;
  section: string;
  phase?: string;
  completedAt?: string;
}

interface PhaseProgress {
  phaseId: string;
  phaseName: string;
  total: number;
  completed: number;
  inProgress: number;
  percentage: number;
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Get fallback file path pattern
function getFallbackPath(sprintNumber: number): string {
  const projectRoot = getProjectRoot();
  return join(projectRoot, 'artifacts', 'reports', `sprint${sprintNumber}-progress-latest.json`);
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

// Load sprint tasks from CSV
function loadSprintTasks(sprintNumber: number): TaskProgress[] {
  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
  const tasks: TaskProgress[] = [];

  try {
    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, 'utf8');
      const results = Papa.parse(content, { header: true, skipEmptyLines: true });

      for (const row of results.data as RawCSVRow[]) {
        const targetSprint = parseInt(String(row['Target Sprint'] ?? ''));
        if (targetSprint === sprintNumber || (row['Target Sprint'] === 'Continuous' && sprintNumber === 0)) {
          tasks.push({
            taskId: row['Task ID'] || '',
            description: row['Description'] || '',
            status: row['Status'] || 'Planned',
            section: row['Section'] || '',
          });
        }
      }
    }
  } catch (error) {
    console.error('Error loading sprint tasks:', error);
  }

  return tasks;
}

// Load phase progress from phase summary files
function loadPhaseProgress(sprintNumber: number): PhaseProgress[] {
  const projectRoot = getProjectRoot();
  const sprintDir = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', `sprint-${sprintNumber}`);
  const phases: PhaseProgress[] = [];

  try {
    if (existsSync(sprintDir)) {
      const entries = readdirSync(sprintDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('phase-')) {
          const summaryPath = join(sprintDir, entry.name, '_phase-summary.json');
          if (existsSync(summaryPath)) {
            const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
            phases.push({
              phaseId: entry.name,
              phaseName: summary.phase_name || entry.name,
              total: summary.total_tasks || 0,
              completed: summary.completed_tasks || 0,
              inProgress: summary.in_progress_tasks || 0,
              percentage: summary.total_tasks > 0
                ? Math.round((summary.completed_tasks / summary.total_tasks) * 100)
                : 0,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading phase progress:', error);
  }

  return phases.sort((a, b) => a.phaseId.localeCompare(b.phaseId));
}

// Load attestation data for completion timestamps
function loadAttestations(_sprintNumber: number): Map<string, { timestamp: string; verdict: string }> {
  const projectRoot = getProjectRoot();
  const attestationsDir = join(projectRoot, 'artifacts', 'attestations');
  const attestations = new Map<string, { timestamp: string; verdict: string }>();

  try {
    if (existsSync(attestationsDir)) {
      const taskDirs = readdirSync(attestationsDir, { withFileTypes: true });

      for (const taskDir of taskDirs) {
        if (taskDir.isDirectory()) {
          const ackPath = join(attestationsDir, taskDir.name, 'context_ack.json');
          if (existsSync(ackPath)) {
            const ack = JSON.parse(readFileSync(ackPath, 'utf8'));
            attestations.set(taskDir.name, {
              timestamp: ack.attestation_timestamp || '',
              verdict: ack.verdict || 'PENDING',
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading attestations:', error);
  }

  return attestations;
}

// Generate markdown format
function generateMarkdown(
  sprintNumber: number,
  tasks: TaskProgress[],
  phases: PhaseProgress[],
  attestations: Map<string, { timestamp: string; verdict: string }>
): string {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t =>
    t.status.toLowerCase() === 'completed' || t.status.toLowerCase() === 'done'
  ).length;
  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  let md = `# Sprint ${sprintNumber} Progress Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `## Summary\n\n`;
  md += `- **Total Tasks:** ${totalTasks}\n`;
  md += `- **Completed:** ${completedTasks}\n`;
  md += `- **Progress:** ${percentage}%\n\n`;

  if (phases.length > 0) {
    md += `## Phase Breakdown\n\n`;
    md += `| Phase | Total | Completed | Progress |\n`;
    md += `|-------|-------|-----------|----------|\n`;
    for (const phase of phases) {
      md += `| ${phase.phaseName} | ${phase.total} | ${phase.completed} | ${phase.percentage}% |\n`;
    }
    md += `\n`;
  }

  md += `## Task Status\n\n`;
  md += `| Task ID | Description | Status | Completed At |\n`;
  md += `|---------|-------------|--------|-------------|\n`;
  for (const task of tasks.slice(0, 50)) { // Limit for readability
    const attestation = attestations.get(task.taskId);
    const completedAt = attestation?.verdict === 'COMPLETE' ? attestation.timestamp.split('T')[0] : '-';
    md += `| ${task.taskId} | ${task.description.substring(0, 40)}... | ${task.status} | ${completedAt} |\n`;
  }

  if (tasks.length > 50) {
    md += `\n*... and ${tasks.length - 50} more tasks*\n`;
  }

  return md;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sprintNumber = parseInt(searchParams.get('sprint') || '0');
    const format = searchParams.get('format') || 'json';

    const tasks = loadSprintTasks(sprintNumber);
    const phases = loadPhaseProgress(sprintNumber);
    const attestations = loadAttestations(sprintNumber);

    // Enrich tasks with attestation data
    for (const task of tasks) {
      const attestation = attestations.get(task.taskId);
      if (attestation) {
        task.completedAt = attestation.timestamp;
      }
    }

    // Calculate metrics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t =>
      t.status.toLowerCase() === 'completed' || t.status.toLowerCase() === 'done'
    ).length;
    const inProgressTasks = tasks.filter(t =>
      t.status.toLowerCase() === 'in progress'
    ).length;
    const plannedTasks = totalTasks - completedTasks - inProgressTasks;

    // If markdown format requested
    if (format === 'md' || format === 'markdown') {
      const markdown = generateMarkdown(sprintNumber, tasks, phases, attestations);
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      });
    }

    // Build response data
    const responseData = {
      source: 'fresh',
      timestamp: new Date().toISOString(),
      pattern: 'RSI',
      sprint: sprintNumber,
      fallbackPath: getFallbackPath(sprintNumber),
      summary: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        planned: plannedTasks,
        percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      phases,
      bySection: tasks.reduce((acc, t) => {
        if (!acc[t.section]) acc[t.section] = { total: 0, completed: 0 };
        acc[t.section].total++;
        if (t.status.toLowerCase() === 'completed' || t.status.toLowerCase() === 'done') {
          acc[t.section].completed++;
        }
        return acc;
      }, {} as Record<string, { total: number; completed: number }>),
      recentCompletions: tasks
        .filter(t => t.completedAt)
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
        .slice(0, 10)
        .map(t => ({
          taskId: t.taskId,
          description: t.description.substring(0, 60),
          completedAt: t.completedAt,
        })),
      tasks: tasks.slice(0, 100),
      hasMore: tasks.length > 100,
    };

    // If no fresh data available, try fallback
    if (totalTasks === 0) {
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

    // JSON format
    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error generating sprint progress:', error);
    return NextResponse.json(
      { error: 'Failed to generate sprint progress', details: String(error) },
      { status: 500 }
    );
  }
}
