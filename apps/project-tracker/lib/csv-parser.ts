/**
 * CSV Parser - Converts Sprint_plan.csv to typed Task objects
 */

import Papa from 'papaparse';
import type { Task, SprintNumber } from './types';

export interface ParsedCSVData {
  tasks: Task[];
  sections: string[];
  owners: string[];
  sprints: SprintNumber[];
}

/**
 * Parse CSV file and return structured task data
 */
export async function parseCSV(file: File): Promise<ParsedCSVData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const tasks = normalizeCSVData(results.data as any[]);
          const sections = [...new Set(tasks.map(t => t.section))].sort();
          const owners = [...new Set(tasks.map(t => t.owner))].sort();
          const sprints = [...new Set(tasks.map(t => t.sprint))].sort((a, b) => {
            if (a === 'Continuous') return 1;
            if (b === 'Continuous') return -1;
            return (a as number) - (b as number);
          });

          resolve({ tasks, sections, owners, sprints });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

/**
 * Parse CSV from text content
 */
export function parseCSVText(csvText: string): ParsedCSVData {
  const results = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const tasks = normalizeCSVData(results.data as any[]);
  const sections = [...new Set(tasks.map(t => t.section))].sort();
  const owners = [...new Set(tasks.map(t => t.owner))].sort();
  const sprints = [...new Set(tasks.map(t => t.sprint))].sort((a, b) => {
    if (a === 'Continuous') return 1;
    if (b === 'Continuous') return -1;
    return (a as number) - (b as number);
  });

  return { tasks, sections, owners, sprints };
}

/**
 * Normalize CSV rows to Task objects
 */
function normalizeCSVData(rows: any[]): Task[] {
  return rows.map((row) => {
    const task: Task = {
      id: row['Task ID'] || row.id || '',
      section: row.Section || row.section || '',
      description: row.Description || row.description || '',
      owner: row.Owner || row.owner || '',
      dependencies: parseDependencies(row.Dependencies || row.dependencies || ''),
      cleanDependencies: parseDependencies(row.CleanDependencies || ''),
      crossQuarterDeps: parseBoolean(row.CrossQuarterDeps),
      prerequisites: row['Pre-requisites'] || row.prerequisites || '',
      dod: row['Definition of Done'] || row.dod || '',
      status: normalizeStatus(row.Status || row.status),
      kpis: row.KPIs || row.kpis || '',
      sprint: parseSprint(row['Target Sprint'] || row.sprint),
      artifacts: parseArtifacts(row['Artifacts To Track'] || row.artifacts || ''),
      validation: row['Validation Method'] || row.validation || '',
    };
    return task;
  });
}

/**
 * Parse dependencies string
 */
function parseDependencies(deps: string): string[] {
  if (!deps || deps.trim() === '') return [];
  return deps.split(',').map(d => d.trim()).filter(Boolean);
}

/**
 * Parse artifacts string
 */
function parseArtifacts(artifacts: string): string[] {
  if (!artifacts || artifacts.trim() === '') return [];
  return artifacts.split(',').map(a => a.trim()).filter(Boolean);
}

/**
 * Parse sprint value
 */
function parseSprint(sprintValue: string | number): SprintNumber {
  if (!sprintValue || sprintValue === '') return 0;

  const str = String(sprintValue).trim();

  // Handle "Continuous"
  if (str.toLowerCase() === 'continuous') return 'Continuous';

  // Handle ranges like "28-42" - take first number
  if (str.includes('-')) {
    const first = str.split('-')[0].trim();
    const num = parseInt(first, 10);
    return isNaN(num) ? 0 : num;
  }

  // Parse as number
  const num = parseInt(str, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalize status value
 */
function normalizeStatus(status: string): Task['status'] {
  const normalized = (status || 'Planned').trim();

  if (normalized === 'In Progress') return 'In Progress';
  if (normalized === 'Completed') return 'Completed';
  if (normalized === 'Blocked') return 'Blocked';

  return 'Planned';
}

/**
 * Parse boolean value
 */
function parseBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return false;
}

/**
 * Group tasks by sprint
 */
export function groupTasksBySprint(tasks: Task[]): Map<SprintNumber, Task[]> {
  const grouped = new Map<SprintNumber, Task[]>();

  tasks.forEach(task => {
    const existing = grouped.get(task.sprint) || [];
    existing.push(task);
    grouped.set(task.sprint, existing);
  });

  return grouped;
}

/**
 * Count tasks by status
 */
export function countTasksByStatus(tasks: Task[]) {
  return {
    total: tasks.length,
    planned: tasks.filter(t => t.status === 'Planned').length,
    inProgress: tasks.filter(t => t.status === 'In Progress').length,
    completed: tasks.filter(t => t.status === 'Completed').length,
    blocked: tasks.filter(t => t.status === 'Blocked').length,
  };
}

/**
 * Calculate completion rate
 */
export function calculateCompletionRate(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  return Math.round((completed / tasks.length) * 100);
}
