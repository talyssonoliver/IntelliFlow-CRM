import { NextResponse } from 'next/server';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import Papa from 'papaparse';

export const dynamic = 'force-dynamic';

interface CsvTask {
  'Task ID': string;
  Section: string;
  Description: string;
  Owner: string;
  Dependencies: string;
  'Pre-requisites': string;
  'Definition of Done': string;
  Status: string;
  KPIs: string;
  'Target Sprint': string;
  'Artifacts To Track': string;
  'Validation Method': string;
}

interface RevertResult {
  success: boolean;
  tasksReverted: string[];
  tasksWithMissingArtifacts: Array<{
    taskId: string;
    missingArtifacts: string[];
    missingEvidence: string[];
  }>;
  message: string;
  timestamp: string;
}

// Prefixes that are metadata/commands, not file paths
const METADATA_PREFIXES = ['VALIDATE:', 'GATE:', 'AUDIT:', 'FILE:', 'ENV:', 'POLICY:'] as const;

function parseArtifactsWithPrefixes(artifactsStr: string): {
  artifacts: string[];
  evidence: string[];
} {
  const result = { artifacts: [] as string[], evidence: [] as string[] };

  if (
    !artifactsStr ||
    artifactsStr.trim() === '' ||
    artifactsStr === '-' ||
    artifactsStr === 'N/A'
  ) {
    return result;
  }

  const items = artifactsStr
    .split(/[,;\n]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && a !== '-');

  // Prefixes that represent file paths to validate
  const pathPrefixes = ['ARTIFACT:', 'SPEC:', 'PLAN:', 'CONTEXT:', 'PRD:'] as const;

  for (const item of items) {
    const pathPrefix = pathPrefixes.find((prefix) => item.startsWith(prefix));
    if (pathPrefix) {
      const path = item.slice(pathPrefix.length).trim();
      if (path) result.artifacts.push(path);
    } else if (item.startsWith('EVIDENCE:')) {
      const path = item.replace('EVIDENCE:', '').trim();
      if (path) result.evidence.push(path);
    } else if (METADATA_PREFIXES.some((prefix) => item.startsWith(prefix))) {
      // Skip metadata prefixes
    } else {
      // Legacy: items without prefix are treated as artifact paths
      result.artifacts.push(item);
    }
  }

  return result;
}

async function checkPathExists(artifactPath: string): Promise<boolean> {
  try {
    if (artifactPath.includes('*')) {
      const parentDir = artifactPath.split('*')[0].replace(/\/{1,100}$/, '');
      if (parentDir) {
        await access(join(process.cwd(), '..', '..', parentDir));
        return true;
      }
      return false;
    }
    await access(join(process.cwd(), '..', '..', artifactPath));
    return true;
  } catch {
    return false;
  }
}

async function findTasksToRevert(tasks: CsvTask[]): Promise<Array<{ taskId: string; missingArtifacts: string[]; missingEvidence: string[] }>> {
  const results: Array<{ taskId: string; missingArtifacts: string[]; missingEvidence: string[] }> = [];

  for (const task of tasks) {
    const status = (task.Status || '').toLowerCase().trim();
    if (status !== 'completed' && status !== 'done') continue;

    const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
    const missingArtifacts = await Promise.all(parsed.artifacts.map(async (a) => (await checkPathExists(a) ? null : a)));
    const missingEvidence = await Promise.all(parsed.evidence.map(async (e) => (await checkPathExists(e) ? null : e)));

    const filteredArtifacts = missingArtifacts.filter((a): a is string => a !== null);
    const filteredEvidence = missingEvidence.filter((e): e is string => e !== null);

    if (filteredArtifacts.length > 0 || filteredEvidence.length > 0) {
      results.push({ taskId: task['Task ID'], missingArtifacts: filteredArtifacts, missingEvidence: filteredEvidence });
    }
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const csvContent = await readFile(csvPath, 'utf-8');

    const tasks = parse(csvContent, {
      columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, bom: true,
    }) as CsvTask[];

    const tasksToRevert = await findTasksToRevert(tasks);

    const revertedTaskIds: string[] = [];
    if (!dryRun && tasksToRevert.length > 0) {
      const taskIdsToRevert = new Set(tasksToRevert.map((t) => t.taskId));
      for (const task of tasks) {
        if (taskIdsToRevert.has(task['Task ID'])) {
          task.Status = 'In Progress';
          revertedTaskIds.push(task['Task ID']);
        }
      }
      await writeFile(csvPath, Papa.unparse(tasks, { header: true, quotes: true }), 'utf-8');
    }

    const result: RevertResult = {
      success: true,
      tasksReverted: dryRun ? [] : revertedTaskIds,
      tasksWithMissingArtifacts: tasksToRevert,
      message: dryRun
        ? `DRY RUN: ${tasksToRevert.length} tasks would be reverted to "In Progress"`
        : `${revertedTaskIds.length} tasks reverted to "In Progress"`,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (error) {
    console.error('Error in revert-incomplete:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process revert request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // GET returns documentation about how to use this endpoint
  return NextResponse.json({
    endpoint: '/api/governance/revert-incomplete',
    description: 'Reverts completed tasks with missing artifacts/evidence to "In Progress"',
    methods: {
      POST: {
        description: 'Execute the revert operation',
        body: {
          dryRun: {
            type: 'boolean',
            default: true,
            description:
              'If true (default), only reports what would be reverted without making changes',
          },
        },
        examples: [
          {
            description: 'Dry run (preview changes)',
            command: 'curl -X POST http://localhost:3002/api/governance/revert-incomplete',
          },
          {
            description: 'Execute revert',
            command:
              'curl -X POST http://localhost:3002/api/governance/revert-incomplete -H "Content-Type: application/json" -d \'{"dryRun": false}\'',
          },
        ],
      },
    },
    governance: {
      policy:
        'Tasks marked as "Completed" must have all ARTIFACT: and EVIDENCE: paths existing. Tasks with missing files should be reverted to "In Progress" until artifacts are created.',
      reference: 'audit-cutover.yml, audit-matrix.yml',
    },
  });
}
