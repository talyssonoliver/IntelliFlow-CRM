/**
 * Summary Generation Operations
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TaskRecord } from './types';
import { readJsonTolerant, writeJsonFile } from './file-io';

/**
 * Update phase summaries for Sprint 0
 */
export function updatePhaseSummaries(tasks: TaskRecord[], metricsDir: string): void {
  const sprint0Dir = join(metricsDir, 'sprint-0');
  const phases = [
    'phase-0-initialisation',
    'phase-1-ai-foundation',
    'phase-2-parallel',
    'phase-3-dependencies',
    'phase-4-final-setup',
    'phase-5-completion',
  ];

  for (const phase of phases) {
    const phaseDir = join(sprint0Dir, phase);
    const summaryPath = join(phaseDir, '_phase-summary.json');

    if (!existsSync(summaryPath)) continue;

    const summary = readJsonTolerant(summaryPath);

    // Count tasks in this phase
    const phaseTasks: any[] = [];
    const searchPhase = (dir: string): void => {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (
          entry.isFile() &&
          entry.name.endsWith('.json') &&
          entry.name !== '_phase-summary.json'
        ) {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.phase === phase) {
            phaseTasks.push(taskData);
          }
        } else if (entry.isDirectory()) {
          searchPhase(fullPath);
        }
      }
    };

    searchPhase(phaseDir);

    // Calculate aggregated metrics
    const done = phaseTasks.filter((t) => t.status === 'DONE').length;
    const in_progress = phaseTasks.filter(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'VALIDATING'
    ).length;
    const blocked = phaseTasks.filter(
      (t) => t.status === 'BLOCKED' || t.status === 'NEEDS_HUMAN' || t.status === 'FAILED'
    ).length;
    const not_started = phaseTasks.filter(
      (t) =>
        t.status === 'PLANNED' ||
        t.status === 'NOT_STARTED' ||
        t.status === 'BACKLOG' ||
        t.status === 'IN_REVIEW'
    ).length;

    summary.aggregated_metrics = {
      total_tasks: phaseTasks.length,
      done,
      in_progress,
      blocked,
      not_started,
    };

    if (done === phaseTasks.length && phaseTasks.length > 0) {
      summary.completed_at = new Date().toISOString();
    }

    writeJsonFile(summaryPath, summary, 2);
  }
}

/**
 * Generic sprint summary updater
 */
export function updateSprintSummaryGeneric(
  tasks: TaskRecord[],
  metricsDir: string,
  sprintNum: number
): void {
  const sprintDir = join(metricsDir, `sprint-${sprintNum}`);
  const summaryPath = join(sprintDir, '_summary.json');

  if (!existsSync(summaryPath)) {
    const newSummary = {
      sprint: `sprint-${sprintNum}`,
      name: `Sprint ${sprintNum}`,
      target_date: null,
      started_at: null,
      completed_at: null,
      phases: [],
      task_summary: {
        total: tasks.length,
        done: 0,
        in_progress: 0,
        blocked: 0,
        not_started: tasks.length,
        failed: 0,
      },
      notes: `Sprint ${sprintNum} - initialized`,
    };
    writeJsonFile(summaryPath, newSummary, 2);
  }

  const summary = readJsonTolerant(summaryPath);

  // Calculate task counts from CSV
  const done = tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed').length;
  const inProgress = tasks.filter(
    (t) => t.Status === 'In Progress' || t.Status === 'Validating'
  ).length;
  const blocked = tasks.filter((t) => t.Status === 'Blocked').length;
  const backlog = tasks.filter((t) => t.Status === 'Backlog').length;
  const planned = tasks.filter((t) => t.Status === 'Planned').length;
  const failed = tasks.filter((t) => t.Status === 'Failed').length;
  const needsHuman = tasks.filter((t) => t.Status === 'Needs Human').length;
  const inReview = tasks.filter((t) => t.Status === 'In Review').length;
  const notStarted = backlog + planned + inReview;

  summary.task_summary = {
    total: tasks.length,
    done,
    in_progress: inProgress,
    blocked: blocked + needsHuman,
    not_started: notStarted,
    failed,
  };

  // Build completed_tasks from task JSON files and CSV
  const completedTasksMap = new Map<
    string,
    { task_id: string; completed_at: string; duration_minutes: number }
  >();

  const searchForCompleted = (dir: string): void => {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_')) {
        try {
          const taskData = readJsonTolerant(fullPath);
          if (taskData.status === 'DONE' && taskData.completed_at) {
            const taskId = taskData.task_id || taskData.taskId || entry.name.replace('.json', '');
            completedTasksMap.set(taskId, {
              task_id: taskId,
              completed_at: taskData.completed_at,
              duration_minutes:
                taskData.actual_duration_minutes || taskData.target_duration_minutes || 15,
            });
          }
        } catch {
          // Skip invalid files
        }
      } else if (entry.isDirectory()) {
        searchForCompleted(fullPath);
      }
    }
  };

  searchForCompleted(sprintDir);

  // Add CSV completed tasks that don't have JSON files
  const csvCompletedTasks = tasks.filter((t) => t.Status === 'Done' || t.Status === 'Completed');
  for (const csvTask of csvCompletedTasks) {
    const taskId = csvTask['Task ID'];
    if (taskId && !completedTasksMap.has(taskId)) {
      completedTasksMap.set(taskId, {
        task_id: taskId,
        completed_at: new Date().toISOString(),
        duration_minutes: 15,
      });
    }
  }

  const completedTasks = Array.from(completedTasksMap.values());
  completedTasks.sort(
    (a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
  );
  summary.completed_tasks = completedTasks;

  const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  summary.notes = `${done}/${tasks.length} tasks DONE (${pct}%). Last synced: ${new Date().toISOString()}`;

  writeJsonFile(summaryPath, summary, 2);
}
