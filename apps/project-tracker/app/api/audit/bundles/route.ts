import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getRepoRootDir(): string {
  return path.join(process.cwd(), '..', '..');
}

type AuditBundleSummary = {
  run_id?: string;
  runId?: string;
  taskId?: string;
  commit_sha?: string;
  started_at?: string;
  finished_at?: string;
  generated_at?: string;
  mode?: string | null;
  scope?: string;
  sprint?: number;
  verdict?: string;
  finalVerdict?: string;
  result?: { overall_status?: string };
  summary?: {
    totalTasks?: number;
    auditedTasks?: number;
    passedTasks?: number;
    failedTasks?: number;
  };
};

type BundleItem = {
  runId: string;
  type: 'system' | 'sprint' | 'matop';
  taskId?: string;
  sprintNumber?: number;
  summary: AuditBundleSummary | null;
  updatedAt: string | null;
  paths: {
    summaryJson: string;
    summaryMd: string;
  };
};

/**
 * Load bundles from a flat directory structure (e.g., sprint-audit).
 */
async function loadBundlesFromDir(
  repoRoot: string,
  bundlesDir: string,
  type: 'system' | 'sprint',
  summaryFilename: string = 'summary.json',
  mdFilename: string = 'summary.md'
): Promise<BundleItem[]> {
  const items: BundleItem[] = [];

  try {
    const entries = await readdir(bundlesDir, { withFileTypes: true });
    const runIds = entries
      .filter((e) => e.isDirectory() && !e.name.endsWith('-latest'))
      .map((e) => e.name);
    runIds.sort((a, b) => b.localeCompare(a));

    for (const runId of runIds.slice(0, 25)) {
      const summaryPath = path.join(bundlesDir, runId, summaryFilename);
      const summaryMdPath = path.join(bundlesDir, runId, mdFilename);
      try {
        const [summaryRaw, summaryStat] = await Promise.all([
          readFile(summaryPath, 'utf-8'),
          stat(summaryPath),
        ]);
        const summary = JSON.parse(summaryRaw) as AuditBundleSummary;
        items.push({
          runId,
          type,
          summary,
          updatedAt: summaryStat.mtime.toISOString(),
          paths: {
            summaryJson: path.relative(repoRoot, summaryPath).replaceAll('\\', '/'),
            summaryMd: path.relative(repoRoot, summaryMdPath).replaceAll('\\', '/'),
          },
        });
      } catch {
        // Skip bundles without a valid summary file (incomplete runs)
        // Don't add them to the list
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return items;
}

async function loadMatopRunsForTask(
  repoRoot: string,
  taskId: string,
  taskExecutionDir: string,
  sprintNumber: number
): Promise<BundleItem[]> {
  const items: BundleItem[] = [];
  try {
    const runEntries = await readdir(taskExecutionDir, { withFileTypes: true });
    const runDirs = runEntries
      .filter((e) => e.isDirectory() && !e.name.endsWith('-latest'))
      .map((e) => e.name)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 5);

    for (const runId of runDirs) {
      const matopDir = path.join(taskExecutionDir, runId, 'matop');
      const summaryPath = path.join(matopDir, 'summary.json');
      const summaryMdPath = path.join(matopDir, 'summary.md');
      try {
        const [summaryRaw, summaryStat] = await Promise.all([
          readFile(summaryPath, 'utf-8'),
          stat(summaryPath),
        ]);
        const summary = JSON.parse(summaryRaw) as AuditBundleSummary;
        items.push({
          runId,
          type: 'matop',
          taskId,
          sprintNumber,
          summary,
          updatedAt: summaryStat.mtime.toISOString(),
          paths: {
            summaryJson: path.relative(repoRoot, summaryPath).replaceAll('\\', '/'),
            summaryMd: path.relative(repoRoot, summaryMdPath).replaceAll('\\', '/'),
          },
        });
      } catch {
        // No summary file in this matop directory
      }
    }
  } catch {
    // Can't read task execution directory
  }
  return items;
}

/**
 * Load MATOP bundles from the sprint-based execution structure.
 * Path: .specify/sprints/sprint-{N}/execution/{taskId}/{runId}/matop/
 */
async function loadMatopBundles(repoRoot: string): Promise<BundleItem[]> {
  const sprintsDir = path.join(repoRoot, '.specify', 'sprints');

  try {
    const sprintEntries = await readdir(sprintsDir, { withFileTypes: true });
    const sprintDirs = sprintEntries
      .filter((e) => e.isDirectory() && e.name.startsWith('sprint-'))
      .map((e) => e.name);

    const perSprintResults = await Promise.all(
      sprintDirs.map(async (sprintDir) => {
        const sprintNumber = Number.parseInt(sprintDir.replaceAll('sprint-', ''), 10);
        const executionDir = path.join(sprintsDir, sprintDir, 'execution');
        try {
          const taskEntries = await readdir(executionDir, { withFileTypes: true });
          const taskIds = taskEntries.filter((e) => e.isDirectory()).map((e) => e.name);
          const taskResults = await Promise.all(
            taskIds.map((taskId) =>
              loadMatopRunsForTask(repoRoot, taskId, path.join(executionDir, taskId), sprintNumber)
            )
          );
          return taskResults.flat();
        } catch {
          return [];
        }
      })
    );

    return perSprintResults.flat();
  } catch {
    return [];
  }
}

/**
 * Also check legacy system-audit path for backwards compatibility.
 */
async function loadLegacySystemBundles(repoRoot: string): Promise<BundleItem[]> {
  const legacyDir = path.join(repoRoot, 'artifacts', 'reports', 'system-audit');
  return loadBundlesFromDir(repoRoot, legacyDir, 'system', 'summary.json', 'summary.md');
}

export async function GET() {
  const repoRoot = getRepoRootDir();
  const sprintBundlesDir = path.join(repoRoot, 'artifacts', 'reports', 'sprint-audit');

  // Load bundles from all sources in parallel
  const [matopBundles, legacyBundles, sprintBundles] = await Promise.all([
    loadMatopBundles(repoRoot),
    loadLegacySystemBundles(repoRoot),
    loadBundlesFromDir(repoRoot, sprintBundlesDir, 'sprint', 'audit.json', 'audit.md'),
  ]);

  // Combine and sort by runId (which includes timestamp)
  const allItems = [...matopBundles, ...legacyBundles, ...sprintBundles];
  allItems.sort((a, b) => b.runId.localeCompare(a.runId));

  return NextResponse.json({
    bundlesDir: '.specify/sprints (MATOP) + artifacts/reports (legacy/sprint-audit)',
    matopBundlesPath: '.specify/sprints/sprint-{N}/execution/{taskId}/{runId}/matop/',
    sprintBundlesDir: path.relative(repoRoot, sprintBundlesDir).replaceAll('\\', '/'),
    items: allItems.slice(0, 50),
  });
}
