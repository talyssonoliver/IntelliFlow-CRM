import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import Papa from 'papaparse';
import { access } from 'node:fs/promises';

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

  for (const item of items) {
    if (item.startsWith('ARTIFACT:')) {
      const path = item.replace('ARTIFACT:', '').trim();
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
      const parentDir = artifactPath.split('*')[0].replace(/\/+$/, '');
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety

    const csvPath = join(process.cwd(), 'docs', 'metrics', '_global', 'Sprint_plan.csv');
    const csvContent = await readFile(csvPath, 'utf-8');

    const tasks = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as CsvTask[];

    const tasksToRevert: Array<{
      taskId: string;
      missingArtifacts: string[];
      missingEvidence: string[];
    }> = [];

    // Check each completed task for missing artifacts/evidence
    for (const task of tasks) {
      const status = (task.Status || '').toLowerCase().trim();
      const isCompleted = status === 'completed' || status === 'done';

      if (!isCompleted) continue;

      const parsed = parseArtifactsWithPrefixes(task['Artifacts To Track']);
      const missingArtifacts: string[] = [];
      const missingEvidence: string[] = [];

      // Check ARTIFACT: paths
      for (const artifact of parsed.artifacts) {
        const exists = await checkPathExists(artifact);
        if (!exists) {
          missingArtifacts.push(artifact);
        }
      }

      // Check EVIDENCE: paths
      for (const evidence of parsed.evidence) {
        const exists = await checkPathExists(evidence);
        if (!exists) {
          missingEvidence.push(evidence);
        }
      }

      if (missingArtifacts.length > 0 || missingEvidence.length > 0) {
        tasksToRevert.push({
          taskId: task['Task ID'],
          missingArtifacts,
          missingEvidence,
        });
      }
    }

    // If not dry run, update the CSV
    const revertedTaskIds: string[] = [];
    if (!dryRun && tasksToRevert.length > 0) {
      const taskIdsToRevert = new Set(tasksToRevert.map((t) => t.taskId));

      for (const task of tasks) {
        if (taskIdsToRevert.has(task['Task ID'])) {
          task.Status = 'In Progress';
          revertedTaskIds.push(task['Task ID']);
        }
      }

      // Write updated CSV using papaparse
      const updatedCsv = Papa.unparse(tasks, {
        header: true,
        quotes: true,
      });

      await writeFile(csvPath, updatedCsv, 'utf-8');
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

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    console.error('Error in revert-incomplete:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process revert request',
        details: error instanceof Error ? error.message : String(error),
      },
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
