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
  mode?: string | null;
  scope?: string;
  result?: { overall_status?: string };
};

export async function GET() {
  const repoRoot = getRepoRootDir();
  const bundlesDir = path.join(repoRoot, 'artifacts', 'reports', 'system-audit');

  try {
    const entries = await readdir(bundlesDir, { withFileTypes: true });
    const runIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    runIds.sort((a, b) => b.localeCompare(a));

    const items = [];
    for (const runId of runIds.slice(0, 50)) {
      const summaryPath = path.join(bundlesDir, runId, 'summary.json');
      const summaryMdPath = path.join(bundlesDir, runId, 'summary.md');
      try {
        const [summaryRaw, summaryStat] = await Promise.all([
          readFile(summaryPath, 'utf-8'),
          stat(summaryPath),
        ]);
        const summary = JSON.parse(summaryRaw) as AuditBundleSummary;
        items.push({
          runId,
          summary,
          updatedAt: summaryStat.mtime.toISOString(),
          paths: {
            summaryJson: path.relative(repoRoot, summaryPath).replaceAll('\\', '/'),
            summaryMd: path.relative(repoRoot, summaryMdPath).replaceAll('\\', '/'),
          },
        });
      } catch {
        items.push({
          runId,
          summary: null,
          updatedAt: null,
          paths: {
            summaryJson: path.relative(repoRoot, summaryPath).replaceAll('\\', '/'),
            summaryMd: path.relative(repoRoot, summaryMdPath).replaceAll('\\', '/'),
          },
        });
      }
    }

    return NextResponse.json({
      bundlesDir: path.relative(repoRoot, bundlesDir).replaceAll('\\', '/'),
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        bundlesDir: path.relative(repoRoot, bundlesDir).replaceAll('\\', '/'),
        items: [],
        error: String(error),
      },
      { status: 200 }
    );
  }
}
