/**
 * GET /api/sprint/completion
 *
 * RSI endpoint for sprint completion reports.
 * Sources: Sprint_plan.csv, attestations, phase summaries
 * Fallback: artifacts/reports/sprint{N}-completion-latest.json
 * Query: ?sprint=N&format=md|json
 */

import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { RawCSVRow } from '../../../../lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CompletedTask {
  taskId: string;
  description: string;
  section: string;
  completedAt: string;
  verdict: string;
  kpisMet: number;
  kpisTotal: number;
  artifacts: string[];
}

interface SprintCompletion {
  sprintNumber: number;
  status: 'not-started' | 'in-progress' | 'completed' | 'partial';
  completionPercentage: number;
  completedTasks: number;
  totalTasks: number;
  kpiSummary: {
    totalKpis: number;
    metKpis: number;
    percentage: number;
  };
}

function getProjectRoot(): string {
  return process.cwd().replace(/[\\/]apps[\\/]project-tracker$/, '');
}

// Get fallback file path pattern
function getFallbackPath(sprintNumber: number): string {
  const projectRoot = getProjectRoot();
  return join(projectRoot, 'artifacts', 'reports', `sprint${sprintNumber}-completion-latest.json`);
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

// Load attestation data for a task
function loadTaskAttestation(taskId: string): any | null {
  const projectRoot = getProjectRoot();
  const ackPath = join(projectRoot, 'artifacts', 'attestations', taskId, 'context_ack.json');

  try {
    if (existsSync(ackPath)) {
      return JSON.parse(readFileSync(ackPath, 'utf8'));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Load sprint completion data
function loadSprintCompletion(sprintNumber: number): { tasks: CompletedTask[]; completion: SprintCompletion } {
  const projectRoot = getProjectRoot();
  const csvPath = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
  const tasks: CompletedTask[] = [];
  let totalTasks = 0;
  let completedCount = 0;
  let totalKpis = 0;
  let metKpis = 0;

  try {
    if (existsSync(csvPath)) {
      const content = readFileSync(csvPath, 'utf8');
      const results = Papa.parse(content, { header: true, skipEmptyLines: true });

      for (const row of results.data as RawCSVRow[]) {
        const targetSprint = row['Target Sprint'];
        const sprintNum = targetSprint === 'Continuous' ? -1 : parseInt(String(targetSprint ?? ''));

        if (sprintNum === sprintNumber) {
          totalTasks++;
          const status = (row['Status'] || '').toLowerCase();
          const isCompleted = status === 'completed' || status === 'done';

          if (isCompleted) {
            completedCount++;

            // Load attestation for completed tasks
            const attestation = row['Task ID'] ? loadTaskAttestation(row['Task ID']) : null;
            const kpiResults = attestation?.kpi_results || [];
            const kpisMet = kpiResults.filter((k: any) => k.met).length;

            totalKpis += kpiResults.length;
            metKpis += kpisMet;

            tasks.push({
              taskId: row['Task ID'] || '',
              description: row['Description'] || '',
              section: row['Section'] || '',
              completedAt: attestation?.attestation_timestamp || '',
              verdict: attestation?.verdict || 'COMPLETE',
              kpisMet,
              kpisTotal: kpiResults.length,
              artifacts: attestation?.artifact_hashes
                ? Object.keys(attestation.artifact_hashes)
                : [],
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading sprint completion:', error);
  }

  const percentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  const status: SprintCompletion['status'] =
    percentage === 0 ? 'not-started' :
    percentage === 100 ? 'completed' :
    percentage >= 80 ? 'partial' : 'in-progress';

  return {
    tasks: tasks.sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    completion: {
      sprintNumber,
      status,
      completionPercentage: percentage,
      completedTasks: completedCount,
      totalTasks,
      kpiSummary: {
        totalKpis,
        metKpis,
        percentage: totalKpis > 0 ? Math.round((metKpis / totalKpis) * 100) : 0,
      },
    },
  };
}

// Load phase completion from phase summaries
function loadPhaseCompletion(sprintNumber: number): any[] {
  const projectRoot = getProjectRoot();
  const sprintDir = join(projectRoot, 'apps', 'project-tracker', 'docs', 'metrics', `sprint-${sprintNumber}`);
  const phases: any[] = [];

  try {
    if (existsSync(sprintDir)) {
      const entries = readdirSync(sprintDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('phase-')) {
          const summaryPath = join(sprintDir, entry.name, '_phase-summary.json');
          if (existsSync(summaryPath)) {
            const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
            phases.push({
              phase: entry.name,
              name: summary.phase_name || entry.name,
              total: summary.total_tasks || 0,
              completed: summary.completed_tasks || 0,
              percentage: summary.total_tasks > 0
                ? Math.round((summary.completed_tasks / summary.total_tasks) * 100)
                : 0,
              status: summary.completed_tasks === summary.total_tasks ? 'completed' :
                      summary.completed_tasks > 0 ? 'in-progress' : 'not-started',
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error loading phase completion:', error);
  }

  return phases.sort((a, b) => a.phase.localeCompare(b.phase));
}

// Generate markdown report
function generateMarkdown(
  completion: SprintCompletion,
  tasks: CompletedTask[],
  phases: any[]
): string {
  let md = `# Sprint ${completion.sprintNumber} Completion Report\n\n`;
  md += `**Generated:** ${new Date().toISOString()}\n`;
  md += `**Status:** ${completion.status.toUpperCase()}\n\n`;

  md += `## Executive Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Tasks | ${completion.totalTasks} |\n`;
  md += `| Completed | ${completion.completedTasks} |\n`;
  md += `| Completion | ${completion.completionPercentage}% |\n`;
  md += `| KPIs Met | ${completion.kpiSummary.metKpis}/${completion.kpiSummary.totalKpis} (${completion.kpiSummary.percentage}%) |\n\n`;

  if (phases.length > 0) {
    md += `## Phase Completion\n\n`;
    md += `| Phase | Status | Progress |\n`;
    md += `|-------|--------|----------|\n`;
    for (const phase of phases) {
      const statusEmoji = phase.status === 'completed' ? '✅' : phase.status === 'in-progress' ? '🔄' : '⏳';
      md += `| ${phase.name} | ${statusEmoji} ${phase.status} | ${phase.completed}/${phase.total} (${phase.percentage}%) |\n`;
    }
    md += `\n`;
  }

  md += `## Completed Tasks\n\n`;
  md += `| Task ID | Description | KPIs Met | Completed At |\n`;
  md += `|---------|-------------|----------|-------------|\n`;
  for (const task of tasks.slice(0, 30)) {
    const kpiStatus = task.kpisTotal > 0 ? `${task.kpisMet}/${task.kpisTotal}` : 'N/A';
    md += `| ${task.taskId} | ${task.description.substring(0, 40)}... | ${kpiStatus} | ${task.completedAt.split('T')[0]} |\n`;
  }

  if (tasks.length > 30) {
    md += `\n*... and ${tasks.length - 30} more completed tasks*\n`;
  }

  return md;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sprintNumber = parseInt(searchParams.get('sprint') || '0');
    const format = searchParams.get('format') || 'json';

    const { tasks, completion } = loadSprintCompletion(sprintNumber);
    const phases = loadPhaseCompletion(sprintNumber);

    // If markdown format requested
    if (format === 'md' || format === 'markdown') {
      const markdown = generateMarkdown(completion, tasks, phases);
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, max-age=0',
        },
      });
    }

    // Group tasks by section
    const bySection = tasks.reduce((acc, t) => {
      if (!acc[t.section]) acc[t.section] = [];
      acc[t.section].push({
        taskId: t.taskId,
        kpisMet: t.kpisMet,
        kpisTotal: t.kpisTotal,
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Calculate velocity (tasks completed per day)
    const completionDates = tasks
      .filter(t => t.completedAt)
      .map(t => t.completedAt.split('T')[0]);
    const uniqueDates = [...new Set(completionDates)];
    const velocity = uniqueDates.length > 0
      ? Math.round((tasks.length / uniqueDates.length) * 10) / 10
      : 0;

    // Build response data
    const responseData = {
      source: 'fresh',
      timestamp: new Date().toISOString(),
      pattern: 'RSI',
      sprint: sprintNumber,
      fallbackPath: getFallbackPath(sprintNumber),
      completion,
      phases,
      bySection,
      velocity: {
        tasksPerDay: velocity,
        daysWorked: uniqueDates.length,
        dateRange: uniqueDates.length > 0 ? {
          first: uniqueDates[uniqueDates.length - 1],
          last: uniqueDates[0],
        } : null,
      },
      recentCompletions: tasks.slice(0, 10).map(t => ({
        taskId: t.taskId,
        description: t.description.substring(0, 60),
        completedAt: t.completedAt,
        kpiSuccess: t.kpisTotal > 0 ? `${t.kpisMet}/${t.kpisTotal}` : 'N/A',
      })),
      artifacts: tasks.flatMap(t => t.artifacts).slice(0, 20),
      recommendation: completion.status === 'completed'
        ? 'Sprint completed successfully!'
        : completion.status === 'partial'
        ? `${completion.totalTasks - completion.completedTasks} tasks remaining for full completion`
        : `Continue working on sprint tasks - ${completion.completionPercentage}% complete`,
    };

    // If no fresh data available, try fallback
    if (completion.totalTasks === 0) {
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
    console.error('Error generating sprint completion:', error);
    return NextResponse.json(
      { error: 'Failed to generate sprint completion', details: String(error) },
      { status: 500 }
    );
  }
}
