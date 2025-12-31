import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function getRepoRootDir(): string {
  return path.join(process.cwd(), '..', '..');
}

type AuditBundleSummary = {
  run_id?: string;
  commit_sha?: string;
  started_at?: string;
  finished_at?: string;
  generated_at?: string;
  mode?: string | null;
  scope?: string;
  sprint?: number;
  verdict?: string;
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
  type: 'system' | 'sprint';
  summary: AuditBundleSummary | null;
  updatedAt: string | null;
  paths: {
    summaryJson: string;
    summaryMd: string;
  };
};

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

export async function GET() {
  const repoRoot = getRepoRootDir();
  const systemBundlesDir = path.join(repoRoot, 'artifacts', 'reports', 'system-audit');
  const sprintBundlesDir = path.join(repoRoot, 'artifacts', 'reports', 'sprint-audit');

  // Load bundles from both directories in parallel
  const [systemBundles, sprintBundles] = await Promise.all([
    loadBundlesFromDir(repoRoot, systemBundlesDir, 'system', 'summary.json', 'summary.md'),
    loadBundlesFromDir(repoRoot, sprintBundlesDir, 'sprint', 'audit.json', 'audit.md'),
  ]);

  // Combine and sort by runId (which includes timestamp)
  const allItems = [...systemBundles, ...sprintBundles];
  allItems.sort((a, b) => b.runId.localeCompare(a.runId));

  return NextResponse.json({
    bundlesDir: 'artifacts/reports',
    systemBundlesDir: path.relative(repoRoot, systemBundlesDir).replaceAll('\\', '/'),
    sprintBundlesDir: path.relative(repoRoot, sprintBundlesDir).replaceAll('\\', '/'),
    items: allItems.slice(0, 50),
  });
}
